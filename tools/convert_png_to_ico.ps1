param(
  [Parameter(Mandatory = $true)]
  [string]$Source,
  [Parameter(Mandatory = $true)]
  [string]$Destination
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$sourcePath = (Resolve-Path -LiteralPath $Source).Path
$destinationPath = $Destination
$destinationDir = Split-Path -Parent $destinationPath
if ($destinationDir -and -not (Test-Path -LiteralPath $destinationDir)) {
  New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$entries = New-Object System.Collections.Generic.List[object]

$img = [System.Drawing.Image]::FromFile($sourcePath)
try {
  $srcW = [double]$img.Width
  $srcH = [double]$img.Height
  foreach ($size in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.Clear([System.Drawing.Color]::Transparent)

        # Preserve aspect ratio and center image in each icon size.
        $scale = [Math]::Min($size / $srcW, $size / $srcH)
        $drawW = [int][Math]::Round($srcW * $scale)
        $drawH = [int][Math]::Round($srcH * $scale)
        $drawX = [int][Math]::Floor(($size - $drawW) / 2)
        $drawY = [int][Math]::Floor(($size - $drawH) / 2)
        $g.DrawImage($img, $drawX, $drawY, $drawW, $drawH)
      } finally {
        $g.Dispose()
      }

      $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
      $bmpData = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      try {
        $stride = [Math]::Abs($bmpData.Stride)
        $raw = New-Object byte[] ($stride * $size)
        [System.Runtime.InteropServices.Marshal]::Copy($bmpData.Scan0, $raw, 0, $raw.Length)
      } finally {
        $bmp.UnlockBits($bmpData)
      }

      $rowBytes = $size * 4
      $pixelData = New-Object byte[] ($rowBytes * $size)
      for ($y = 0; $y -lt $size; $y++) {
        $srcOffset = ($size - 1 - $y) * $stride
        $dstOffset = $y * $rowBytes
        [Array]::Copy($raw, $srcOffset, $pixelData, $dstOffset, $rowBytes)
      }

      # 1bpp AND mask aligned to 32-bit boundaries. Zero mask keeps alpha channel colors intact.
      $maskStride = [int]([Math]::Ceiling($size / 32.0) * 4)
      $maskData = New-Object byte[] ($maskStride * $size)

      $imageStream = New-Object System.IO.MemoryStream
      $imageWriter = New-Object System.IO.BinaryWriter($imageStream)
      try {
        $imageWriter.Write([UInt32]40)             # BITMAPINFOHEADER size
        $imageWriter.Write([Int32]$size)           # width
        $imageWriter.Write([Int32]($size * 2))     # height: XOR + AND mask
        $imageWriter.Write([UInt16]1)              # planes
        $imageWriter.Write([UInt16]32)             # bit count
        $imageWriter.Write([UInt32]0)              # BI_RGB
        $imageWriter.Write([UInt32]($rowBytes * $size))
        $imageWriter.Write([Int32]0)               # XPelsPerMeter
        $imageWriter.Write([Int32]0)               # YPelsPerMeter
        $imageWriter.Write([UInt32]0)              # ClrUsed
        $imageWriter.Write([UInt32]0)              # ClrImportant
        $imageWriter.Write($pixelData)
        $imageWriter.Write($maskData)
        $imageBytes = $imageStream.ToArray()
      } finally {
        $imageWriter.Dispose()
        $imageStream.Dispose()
      }

      $entryWidth = if ($size -ge 256) { [byte]0 } else { [byte]$size }
      $entryHeight = if ($size -ge 256) { [byte]0 } else { [byte]$size }
      $entryColorCount = [byte]0
      $entryReserved = [byte]0
      $entryPlanes = [UInt16]1
      $entryBitCount = [UInt16]32

      $entries.Add([PSCustomObject]@{
        Width      = $entryWidth
        Height     = $entryHeight
        ColorCount = $entryColorCount
        Reserved   = $entryReserved
        Planes     = $entryPlanes
        BitCount   = $entryBitCount
        Bytes      = $imageBytes
      }) | Out-Null
    } finally {
      $bmp.Dispose()
    }
  }
} finally {
  $img.Dispose()
}

$fs = [System.IO.File]::Open($destinationPath, [System.IO.FileMode]::Create)
try {
  $bw = New-Object System.IO.BinaryWriter($fs)
  try {
    $bw.Write([UInt16]0)                 # reserved
    $bw.Write([UInt16]1)                 # type: icon
    $bw.Write([UInt16]$entries.Count)    # image count

    $offset = 6 + (16 * $entries.Count)
    foreach ($entry in $entries) {
      $bw.Write([byte]$entry.Width)
      $bw.Write([byte]$entry.Height)
      $bw.Write([byte]$entry.ColorCount)
      $bw.Write([byte]$entry.Reserved)
      $bw.Write([UInt16]$entry.Planes)
      $bw.Write([UInt16]$entry.BitCount)
      $bw.Write([UInt32]$entry.Bytes.Length)
      $bw.Write([UInt32]$offset)
      $offset += $entry.Bytes.Length
    }

    foreach ($entry in $entries) {
      $bw.Write($entry.Bytes)
    }
  } finally {
    $bw.Dispose()
  }
} finally {
  $fs.Dispose()
}
