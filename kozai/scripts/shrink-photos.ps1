# 写真を長辺 1568px の JPEG に縮小する（画面の縮小処理と同じ条件）。
# 使い方：pwsh scripts/shrink-photos.ps1 <元の写真フォルダ> <出力フォルダ>
param([Parameter(Mandatory)][string]$Source, [Parameter(Mandatory)][string]$Dest, [int]$MaxSide = 1568)

Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $Dest | Out-Null
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]85)

Get-ChildItem $Source -File | Where-Object Extension -in '.jpg', '.jpeg', '.png', '.webp' | ForEach-Object {
  $img = [System.Drawing.Image]::FromFile($_.FullName)
  try {
    # スマホ写真の向き（EXIF Orientation）を反映する
    if ($img.PropertyIdList -contains 0x0112) {
      switch ($img.GetPropertyItem(0x0112).Value[0]) {
        3 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
        6 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
        8 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
      }
    }
    $scale = [Math]::Min(1.0, $MaxSide / [Math]::Max($img.Width, $img.Height))
    $w = [int]($img.Width * $scale); $h = [int]($img.Height * $scale)
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $w, $h)
    $out = Join-Path $Dest ($_.BaseName + '.jpg')
    $bmp.Save($out, $codec, $params)
    $g.Dispose(); $bmp.Dispose()
    "{0} -> {1}x{2}" -f $_.Name, $w, $h
  } finally { $img.Dispose() }
}
