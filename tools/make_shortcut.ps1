param(
  [Parameter(Mandatory = $true)]
  [string]$TargetPath,
  [Parameter(Mandatory = $false)]
  [string]$LinkPath,
  [Parameter(Mandatory = $false)]
  [string]$LinkDirectory,
  [Parameter(Mandatory = $false)]
  [switch]$UseDefaultJapaneseName,
  [Parameter(Mandatory = $false)]
  [string]$IconPath
)

$ErrorActionPreference = "Stop"

$target = $TargetPath.Trim().Trim('"')
$link = ""
if ($null -ne $LinkPath) {
  $link = $LinkPath.Trim().Trim('"')
}
$linkDirArg = ""
if ($null -ne $LinkDirectory) {
  $linkDirArg = $LinkDirectory.Trim().Trim('"')
}
$icon = ""
if ($null -ne $IconPath) {
  $icon = $IconPath
}
$icon = $icon.Trim().Trim('"')

if ([string]::IsNullOrWhiteSpace($target)) {
  throw "TargetPath is empty."
}

if ($UseDefaultJapaneseName.IsPresent) {
  if ([string]::IsNullOrWhiteSpace($linkDirArg)) {
    throw "LinkDirectory is required when -UseDefaultJapaneseName is specified."
  }
  $defaultName = -join (12362,12367,12377,12426,19981,36275,21360,21047,12450,12503,12522 | ForEach-Object { [char]$_ })
  $link = Join-Path -Path $linkDirArg -ChildPath ($defaultName + ".lnk")
}

if ([string]::IsNullOrWhiteSpace($link)) {
  throw "LinkPath is empty."
}

if (-not ($link.EndsWith(".lnk", [System.StringComparison]::OrdinalIgnoreCase) -or $link.EndsWith(".url", [System.StringComparison]::OrdinalIgnoreCase))) {
  $link = "$link.lnk"
}

$linkDir = Split-Path -Parent $link
if (-not [string]::IsNullOrWhiteSpace($linkDir) -and -not (Test-Path -LiteralPath $linkDir)) {
  New-Item -ItemType Directory -Path $linkDir -Force | Out-Null
}

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = $target

$working = Split-Path -Parent $target
if (-not [string]::IsNullOrWhiteSpace($working)) {
  $shortcut.WorkingDirectory = $working
}

if (-not [string]::IsNullOrWhiteSpace($icon) -and (Test-Path -LiteralPath $icon)) {
  $shortcut.IconLocation = $icon
}
else {
  $shortcut.IconLocation = $target
}

$shortcut.Save()
Write-Output $link
