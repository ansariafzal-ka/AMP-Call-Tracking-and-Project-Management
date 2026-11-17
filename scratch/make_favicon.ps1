Add-Type -AssemblyName System.Drawing

$srcPath = Resolve-Path "client\public\amp-short-logo.png"
$src = [System.Drawing.Bitmap]::FromFile($srcPath)

# 1. Create a 128x128 transparent square canvas (1:1 ratio)
$size = 128
$bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# Prepare pure white version of the logo
$whiteLogo = New-Object System.Drawing.Bitmap($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $src.Height; $y++) {
    for ($x = 0; $x -lt $src.Width; $x++) {
        $pixel = $src.GetPixel($x, $y)
        if ($pixel.A -gt 0) {
            # Keep original alpha for smooth anti-aliased edges, make color pure white
            $whitePixel = [System.Drawing.Color]::FromArgb($pixel.A, 255, 255, 255)
            $whiteLogo.SetPixel($x, $y, $whitePixel)
        }
    }
}

# Scale preserving aspect ratio: full width with modest padding (e.g. 120px wide, centered vertically)
$targetW = 120
$targetH = [int]([double]$src.Height / [double]$src.Width * $targetW)
$destX = [int](($size - $targetW) / 2)
$destY = [int](($size - $targetH) / 2)

$destRect = New-Object System.Drawing.Rectangle($destX, $destY, $targetW, $targetH)
$g.DrawImage($whiteLogo, $destRect)

# Save high-res favicon.png with transparent background
$outPath = Resolve-Path "client\public"
$bmp.Save("$outPath\favicon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Save 32x32 transparent version
$bmp32 = New-Object System.Drawing.Bitmap(32, 32, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g32 = [System.Drawing.Graphics]::FromImage($bmp32)
$g32.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g32.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g32.Clear([System.Drawing.Color]::Transparent)
$g32.DrawImage($bmp, 0, 0, 32, 32)
$bmp32.Save("$outPath\favicon-32x32.png", [System.Drawing.Imaging.ImageFormat]::Png)

$g32.Dispose()
$bmp32.Dispose()
$g.Dispose()
$bmp.Dispose()
$whiteLogo.Dispose()
$src.Dispose()

Write-Output "Transparent pure-white favicons successfully generated!"
