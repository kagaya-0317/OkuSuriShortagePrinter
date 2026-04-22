param(
  [Parameter(Mandatory = $true)]
  [string]$Project,

  [Parameter(Mandatory = $true)]
  [string]$DotnetExe
)

$ErrorActionPreference = "Stop"
$watchMutex = $null

function Get-ProjectMetadata {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectPath
  )

  [xml]$xml = Get-Content -LiteralPath $ProjectPath

  $targetFramework = $null
  $assemblyName = $null
  $propertyGroups = @($xml.Project.PropertyGroup)

  foreach ($group in $propertyGroups) {
    if (-not $targetFramework -and $group.TargetFramework) {
      $targetFramework = [string]$group.TargetFramework
    }
    if (-not $targetFramework -and $group.TargetFrameworks) {
      $targetFramework = ([string]$group.TargetFrameworks).Split(";")[0].Trim()
    }
    if (-not $assemblyName -and $group.AssemblyName) {
      $assemblyName = [string]$group.AssemblyName
    }
  }

  if (-not $targetFramework) {
    throw "TargetFramework or TargetFrameworks is missing in $ProjectPath"
  }

  if (-not $assemblyName) {
    $assemblyName = [System.IO.Path]::GetFileNameWithoutExtension($ProjectPath)
  }

  return [pscustomobject]@{
    TargetFramework = $targetFramework
    AssemblyName = $assemblyName
  }
}

function Should-WatchPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FullPath
  )

  $normalized = $FullPath.Replace("/", "\").ToLowerInvariant()

  foreach ($fragment in $script:excludedFragments) {
    if ($normalized.Contains($fragment)) {
      return $false
    }
  }

  $extension = [System.IO.Path]::GetExtension($normalized)
  if (-not $extension) {
    return $false
  }

  return $script:watchExtensions -contains $extension
}

function Stop-AppProcess {
  if ($script:appProcess -and -not $script:appProcess.HasExited) {
    Stop-Process -Id $script:appProcess.Id -Force -ErrorAction SilentlyContinue
  }

  Get-Process -Name $script:assemblyName -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  $script:appProcess = $null
}

function Build-Project {
  Write-Host "[watch] Building..."
  & $script:dotnetExe build $script:projectPath --nologo
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[watch] Build failed. Waiting for changes..."
    return $false
  }
  return $true
}

function Resolve-AppPath {
  $defaultPath = Join-Path $script:projectDir ("bin\Debug\{0}\{1}.exe" -f $script:targetFramework, $script:assemblyName)
  if (Test-Path -LiteralPath $defaultPath) {
    return (Resolve-Path -LiteralPath $defaultPath).Path
  }

  $debugDir = Join-Path $script:projectDir "bin\Debug"
  $candidates = Get-ChildItem -LiteralPath $debugDir -File -Recurse -Filter ("{0}.exe" -f $script:assemblyName) -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending

  if ($candidates.Count -gt 0) {
    return $candidates[0].FullName
  }

  throw "Built exe was not found under $debugDir"
}

function Start-AppProcess {
  $exePath = Resolve-AppPath
  Write-Host "[watch] Starting: $exePath"
  $script:appProcess = Start-Process -FilePath $exePath -WorkingDirectory $script:projectDir -PassThru
}

function Restart-App {
  Stop-AppProcess
  if (Build-Project) {
    Start-AppProcess
  }
}

$projectPath = (Resolve-Path -LiteralPath $Project).Path
$projectDir = Split-Path -Parent $projectPath
$dotnetExe = (Resolve-Path -LiteralPath $DotnetExe).Path

$watchMutexName = "Local\OkuSuriShortagePrinter.DevWatch"
$createdNew = $false
$watchMutex = New-Object System.Threading.Mutex($true, $watchMutexName, [ref]$createdNew)
if (-not $createdNew) {
  Write-Host "[watch] Another watcher is already running. Close it before starting a new one."
  $watchMutex.Dispose()
  exit 0
}

$metadata = Get-ProjectMetadata -ProjectPath $projectPath
$targetFramework = $metadata.TargetFramework
$assemblyName = $metadata.AssemblyName

$watchExtensions = @(
  ".cs",
  ".csproj",
  ".props",
  ".targets",
  ".resx",
  ".html",
  ".css",
  ".js",
  ".json",
  ".config",
  ".xml"
)

$excludedFragments = @(
  "\bin\",
  "\obj\",
  "\.git\",
  "\.vs\",
  "\.idea\"
)

$appProcess = $null

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $projectDir
$watcher.Filter = "*.*"
$watcher.IncludeSubdirectories = $true

Write-Host "[watch] Project: $projectPath"
Write-Host "[watch] Watching: $projectDir"
Write-Host "[watch] Press Ctrl+C to stop."

try {
  Restart-App

  while ($true) {
    $change = $watcher.WaitForChanged([System.IO.WatcherChangeTypes]::All, 500)
    if ($change.TimedOut) {
      continue
    }

    $changedPath = if ($change.Name) { Join-Path $projectDir $change.Name } else { $change.Name }
    if (-not $changedPath -or -not (Should-WatchPath -FullPath $changedPath)) {
      continue
    }

    Write-Host ("[watch] Change detected: {0}" -f $changedPath)

    # Debounce rapid multi-event bursts.
    while ($true) {
      $next = $watcher.WaitForChanged([System.IO.WatcherChangeTypes]::All, 700)
      if ($next.TimedOut) {
        break
      }
    }

    Restart-App
  }
}
finally {
  Stop-AppProcess
  $watcher.Dispose()
  if ($watchMutex) {
    try {
      $watchMutex.ReleaseMutex()
    }
    catch {
      # Ignore if mutex is already released.
    }
    $watchMutex.Dispose()
  }
}
