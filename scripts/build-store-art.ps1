param(
  [Parameter(Mandatory)][string]$MascotMaster
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root 'release'
$output = Join-Path $release 'store-assets'
$masterHash = '0fc2e606accdb4562c61706495c85623eb67f0c5676fdd5b1a395676d2ad40d3'
if ((Get-FileHash -LiteralPath $MascotMaster).Hash.ToLowerInvariant() -ne $masterHash) {
  throw 'Use the approved high-resolution smiling bee master.'
}
$bee = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $MascotMaster).Path)
$entries = [System.Collections.Generic.List[object]]::new()

function Get-Color([string]$hex) {
  [System.Drawing.ColorTranslator]::FromHtml($hex)
}

function Write-Picture([string]$name, [int]$width, [int]$height, [scriptblock]$paint, [switch]$Transparent) {
  $format = if ($Transparent) { 'Format32bppArgb' } else { 'Format24bppRgb' }
  $bitmap = [System.Drawing.Bitmap]::new($width, $height, $format)
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $g.SmoothingMode = 'AntiAlias'
    $g.PixelOffsetMode = 'HighQuality'
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.TextRenderingHint = 'AntiAliasGridFit'
    & $paint
    $bitmap.Save($name, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $g.Dispose()
    $bitmap.Dispose()
  }
}

function Draw-Text([string]$copy, [float]$x, [float]$y, [float]$size, [string]$color, [switch]$Bold) {
  $weight = if ($Bold) { 'Bold' } else { 'Regular' }
  $font = [System.Drawing.Font]::new('Segoe UI', $size, $weight, 'Pixel')
  $brush = [System.Drawing.SolidBrush]::new((Get-Color $color))
  try {
    $g.DrawString($copy, $font, $brush, $x, $y, [System.Drawing.StringFormat]::GenericTypographic)
  } finally {
    $brush.Dispose()
    $font.Dispose()
  }
}

function Draw-Grid([float]$x, [float]$y, [float]$r, [string]$rim, [string]$center, [string]$outer) {
  for ($i = 0; $i -lt 6; $i++) {
    $theta = ($i * 60 - 90) * [Math]::PI / 180
    $distance = 1.86 * $r
    Draw-Hexagon ($x + $distance * [Math]::Cos($theta)) ($y + $distance * [Math]::Sin($theta)) $r $outer $rim
  }
  Draw-Hexagon $x $y $r $center $rim
}

function Draw-Hexagon([float]$x, [float]$y, [float]$r, [string]$fill, [string]$rim, [float]$line = 1.6) {
  [System.Drawing.PointF[]]$points = for ($i = 0; $i -lt 6; $i++) {
    $theta = $i * [Math]::PI / 3
    [System.Drawing.PointF]::new($x + $r * [Math]::Cos($theta), $y + $r * [Math]::Sin($theta))
  }
  $brush = [System.Drawing.SolidBrush]::new((Get-Color $fill))
  $pen = [System.Drawing.Pen]::new((Get-Color $rim), $line)
  $pen.LineJoin = 'Round'
  try {
    $g.FillPolygon($brush, $points)
    $g.DrawPolygon($pen, $points)
  } finally {
    $pen.Dispose()
    $brush.Dispose()
  }
}

function Draw-Backdrop([int]$w, [int]$h, [string]$from, [string]$to) {
  $bounds = [System.Drawing.Rectangle]::new(0, 0, $w, $h)
  $wash = [System.Drawing.Drawing2D.LinearGradientBrush]::new($bounds, (Get-Color $from), (Get-Color $to), [float]24)
  try { $g.FillRectangle($wash, $bounds) } finally { $wash.Dispose() }
}

function Add-Inventory([string]$path, [int]$w, [int]$h, [string]$kind, [hashtable]$detail) {
  $item = Get-Item -LiteralPath $path
  $picture = [System.Drawing.Bitmap]::new($item.FullName)
  try {
    if ($picture.Width -ne $w -or $picture.Height -ne $h -or
        $picture.RawFormat.Guid -ne [System.Drawing.Imaging.ImageFormat]::Png.Guid) {
      throw "Incorrect asset format or dimensions for $path."
    }
  } finally { $picture.Dispose() }
  $entry = [ordered]@{
    path = [System.IO.Path]::GetRelativePath($root, $item.FullName).Replace('\', '/')
    type = $kind
    format = 'PNG'
    width = $w
    height = $h
    bytes = $item.Length
    sha256 = (Get-FileHash -LiteralPath $path).Hash.ToLowerInvariant()
  }
  foreach ($key in ($detail.Keys | Sort-Object)) { $entry[$key] = $detail[$key] }
  $entries.Add($entry)
}

$views = @(
  @{ Name = '01-hints-only'; Capture = '14-golden-first-hints'; Mode = 'Hints Only'; Count = 7; Revealed = 0; Puzzle = 'COATING'; Title = @('Start with', 'a hint.'); Body = @('Get a pangram''s first two letters', 'and its length. Keep the answer', 'covered while you think.') },
  @{ Name = '02-reveal-one'; Capture = '15-one-answer-revealed'; Mode = 'Hints Only'; Count = 7; Revealed = 1; Puzzle = 'COATING'; Title = @('Reveal one', 'at a time.'); Body = @('Show a single pangram when', 'you''re ready. The others', 'stay covered.') },
  @{ Name = '03-full-answers'; Capture = '03-golden'; Mode = 'Full Answers'; Count = 7; Revealed = $null; Puzzle = 'COATING'; Title = @('See all the', 'matches.'); Body = @('Switch to Full Answers for the', 'alphabetical list of matching', 'dictionary pangrams.') },
  @{ Name = '04-resume-puzzle'; Capture = '10-restored-reveal'; Mode = 'Hints Only'; Count = 7; Revealed = 1; Puzzle = 'COATING'; Title = @('Pick up where', 'you left off.'); Body = @('Reopen the popup to see your', 'letters, mode and the answers', 'you''ve already revealed.') },
  @{ Name = '05-long-results'; Capture = '05-long-scrolled'; Mode = 'Full Answers'; Count = 42; Revealed = $null; Puzzle = 'AEINRST'; Title = @('Scroll longer', 'pangram lists.'); Body = @('Browse more matches and their', 'word lengths in the results panel.') }
)

try {
  foreach ($browser in @('chrome', 'edge')) {
    $directory = Join-Path $output $browser
    $captures = Join-Path $root "private/phase5/$browser-native-1.25"
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $report = Get-Content -LiteralPath (Join-Path $captures 'report.json') -Raw | ConvertFrom-Json
    $archive = Join-Path $release "pangram-solver-$browser.zip"
    $archiveHash = (Get-FileHash -LiteralPath $archive).Hash.ToLowerInvariant()
    if ($report.status -ne 'PASS' -or $report.mode -ne 'native action' -or
        $report.browser -ne $browser -or $report.scale -ne 1.25 -or $report.archive.sha256 -ne $archiveHash) {
      throw "$browser screenshots require a passing native report for the current ZIP."
    }

    foreach ($view in $views) {
      $source = Join-Path $captures ($view.Capture + '.png')
      $picture = [System.Drawing.Bitmap]::new($source)
      $path = Join-Path $directory ($view.Name + '.png')
      try {
        if ($picture.Width -gt 480 -or $picture.Height -gt 760) { throw "Unexpected native capture size for $source." }
        Write-Picture $path 1280 800 {
          Draw-Backdrop 1280 800 '#fffdf7' '#fff2cc'
          Draw-Grid 1143 30 103 '#e6c978' '#ffe29b' '#fff1c5'
          Draw-Grid 37 755 64 '#ead4a1' '#ffe5a1' '#fff6dc'
          $g.DrawImage($bee, 81, 93, 78, 78)
          Draw-Text 'Pangram Solver' 176 112 30 '#332315' -Bold
          Draw-Text $view.Title[0] 85 245 65 '#332315' -Bold
          Draw-Text $view.Title[1] 85 322 65 '#332315' -Bold
          for ($i = 0; $i -lt $view.Body.Length; $i++) {
            Draw-Text $view.Body[$i] 88 (437 + 43 * $i) 30 '#655037'
          }
          $x = 763
          $y = [int][Math]::Floor((800 - $picture.Height) / 2)
          $shadow = [System.Drawing.SolidBrush]::new((Get-Color '#e5c98b'))
          try { $g.FillRectangle($shadow, $x - 6, $y - 6, $picture.Width + 12, $picture.Height + 12) }
          finally { $shadow.Dispose() }
          $g.DrawImageUnscaled($picture, $x, $y)
        }
      } finally { $picture.Dispose() }
      Add-Inventory $path 1280 800 'screenshot' @{
        browser = $browser; browserVersion = $report.version; archiveSha256 = $archiveHash
        capture = [System.IO.Path]::GetRelativePath($root, $source).Replace('\', '/')
        captureSha256 = (Get-FileHash -LiteralPath $source).Hash.ToLowerInvariant()
        captureMethod = 'Native action popup from the extracted release ZIP at 125% device scale. CDP PNG drawn at original size.'
        popupX = 763
        center = $view.Puzzle.Substring(0, 1); outer = $view.Puzzle.Substring(1); mode = $view.Mode
        expectedResultCount = $view.Count; capturedResultCount = $view.Count; revealed = $view.Revealed
      }
    }

    $small = Join-Path $directory 'promo-440x280.png'
    Write-Picture $small 440 280 {
      Draw-Backdrop 440 280 '#fff9e8' '#ffdb76'
      Draw-Grid 341 138 46 '#edd497' '#ffc63b' '#fff3ce'
      $g.DrawImage($bee, 259, 52, 165, 165)
      Draw-Text 'Pangram' 31 63 44 '#342415' -Bold
      Draw-Text 'Solver' 31 111 44 '#342415' -Bold
      Draw-Text 'Made for Spelling' 34 180 23 '#5b4224'
      Draw-Text 'Bee games.' 34 210 23 '#5b4224'
    }
    Add-Inventory $small 440 280 'small promotional tile' @{ browser = $browser; source = 'Approved bee master and original geometric artwork' }
    $large = Join-Path $directory 'marquee-1400x560.png'
    Write-Picture $large 1400 560 {
      Draw-Backdrop 1400 560 '#fff9e8' '#ffd45d'
      Draw-Grid 1123 278 112 '#e8be60' '#ffc437' '#fff1c2'
      $g.DrawImage($bee, 911, 65, 430, 430)
      Draw-Text 'Pangram Solver' 98 141 92 '#342415' -Bold
      Draw-Text 'Made for Spelling Bee games.' 103 270 43 '#5b4224'
      Draw-Text 'Find pangrams. Reveal them at your pace.' 104 351 30 '#5b4224'
    }
    Add-Inventory $large 1400 560 'marquee' @{ browser = $browser; source = 'Approved bee master and original geometric artwork' }

    if ($browser -eq 'chrome') {
      $icon = Join-Path $directory 'icon-128.png'
      Copy-Item -LiteralPath (Join-Path $root 'assets/bee/icon-128.png') -Destination $icon -Force
      Add-Inventory $icon 128 128 'store icon' @{ browser = $browser; source = 'Approved Pangram Solver action icon' }
    } else {
      $logo = Join-Path $directory 'logo-300.png'
      Write-Picture $logo 300 300 {
        $g.Clear([System.Drawing.Color]::Transparent)
        Draw-Hexagon 150 150 132 '#35271b' '#ffcb40' 12
        $g.DrawImage($bee, 48, 46, 204, 204)
      } -Transparent
      Add-Inventory $logo 300 300 'store logo' @{ browser = $browser; source = 'Approved bee master in Pangram Solver''s honey-yellow rim and cocoa hexagon' }
    }
  }

  $inventory = Join-Path $output 'ASSET_INVENTORY.json'
  [ordered]@{ version = $report.archive.version; mascotMasterSha256 = $masterHash; assets = @($entries.ToArray()) } |
    ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $inventory -Encoding utf8
  Write-Output "Verified $($entries.Count) PNG assets. Inventory at $inventory"
} finally {
  $bee.Dispose()
}
