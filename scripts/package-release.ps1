param([switch]$VerifyOnly)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$runtime = Join-Path $root 'dist/chromium'
$output = Join-Path $root 'release'
$version = (Get-Content -Raw -LiteralPath (Join-Path $root 'package.json') | ConvertFrom-Json).version
$files = @(
  'background.js', 'browser.js', 'data/provenance.json', 'dictionary-data.js',
  'dictionary.js', 'honeycomb.js', 'icons/icon-128.png', 'icons/icon-16.png',
  'icons/icon-32.png', 'icons/icon-48.png', 'icons/mascot.png',
  'licenses/ESDB-Copyright.txt', 'licenses/ESDB-Sources.md', 'licenses/NOTICE.md',
  'manifest.json', 'pangram.js', 'persistence.js', 'popup.css', 'popup.html',
  'popup.js', 'results.js', 'state.js'
)

Add-Type -AssemblyName System.IO.Compression
New-Item -ItemType Directory -Path $output -Force | Out-Null
if ((Get-Item -LiteralPath $output).Attributes -band [IO.FileAttributes]::ReparsePoint) {
  throw 'Release output must be a regular directory.'
}

$runtimePaths = @(Get-ChildItem -LiteralPath $runtime -File -Recurse | ForEach-Object {
  $_.FullName.Substring($runtime.Length + 1).Replace('\', '/')
})
if (Compare-Object $files $runtimePaths) { throw 'Unexpected runtime file inventory.' }

$manifest = Get-Content -Raw -LiteralPath (Join-Path $runtime 'manifest.json') | ConvertFrom-Json
if ($manifest.version -ne $version -or $manifest.name -ne 'Pangram Solver' -or $manifest.manifest_version -ne 3) {
  throw 'Manifest identity mismatch.'
}
if ($manifest.permissions.Count -ne 1 -or $manifest.permissions[0] -ne 'storage' -or
    $manifest.host_permissions -or $manifest.content_scripts -or $manifest.background.type -ne 'module') {
  throw 'Unexpected permissions or background settings.'
}
$referenced = @($manifest.action.default_popup, $manifest.background.service_worker) +
  @($manifest.action.default_icon.PSObject.Properties.Value) + @($manifest.icons.PSObject.Properties.Value)
foreach ($path in $referenced) {
  if ($path -cnotin $files) { throw "Missing manifest resource: $path" }
}

$fileRecords = foreach ($file in $files) {
  $source = Join-Path $runtime $file
  [ordered]@{ path = $file; bytes = (Get-Item -LiteralPath $source).Length
    sha256 = (Get-FileHash -LiteralPath $source).Hash.ToLowerInvariant() }
}

$archiveRecords = foreach ($browser in @('chrome', 'edge')) {
  $name = "pangram-solver-$browser.zip"
  $destination = Join-Path $output $name
  if ((Test-Path -LiteralPath $destination) -and
      ((Get-Item -LiteralPath $destination).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "Archive must be a regular file: $name"
  }

  if (-not $VerifyOnly) {
    $stream = [IO.File]::Create($destination)
    try {
      $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
      try {
        foreach ($file in $files) {
          $entry = $archive.CreateEntry($file, [IO.Compression.CompressionLevel]::Optimal)
          $entry.LastWriteTime = [DateTimeOffset]::new(2000, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
          $entry.ExternalAttributes = 0
          $inputStream = [IO.File]::OpenRead((Join-Path $runtime $file))
          try {
            $entryStream = $entry.Open()
            try { $inputStream.CopyTo($entryStream) } finally { $entryStream.Dispose() }
          } finally { $inputStream.Dispose() }
        }
      } finally { $archive.Dispose() }
    } finally { $stream.Dispose() }
  }

  $stream = [IO.File]::OpenRead($destination)
  try {
    $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Read, $true)
    try {
      if (($archive.Entries.FullName -join '|') -cne ($files -join '|')) {
        throw "Wrong entries or ordering in $name."
      }
      foreach ($file in $fileRecords) {
        $entry = $archive.GetEntry($file.path)
        $entryStream = $entry.Open()
        try { $hash = (Get-FileHash -InputStream $entryStream).Hash.ToLowerInvariant() } finally { $entryStream.Dispose() }
        if ($entry.Length -ne $file.bytes -or $hash -cne $file.sha256) {
          throw "Invalid archive bytes: $name/$($file.path)"
        }
      }
    } finally { $archive.Dispose() }
  } finally { $stream.Dispose() }

  [ordered]@{ browser = $browser; path = "release/$name"; version = $version
    bytes = (Get-Item -LiteralPath $destination).Length
    sha256 = (Get-FileHash -LiteralPath $destination).Hash.ToLowerInvariant()
    files = $files.Count }
}
if ($archiveRecords[0].sha256 -cne $archiveRecords[1].sha256) { throw 'Shared runtime archives differ.' }

$inventory = [ordered]@{ version = $version; archives = $archiveRecords; runtime = @($fileRecords) }
$json = $inventory | ConvertTo-Json -Depth 6
$sums = ($archiveRecords | ForEach-Object { "$($_.sha256)  $([IO.Path]::GetFileName($_.path))" }) -join "`n"
if ($VerifyOnly) {
  if ((Get-Content -Raw -LiteralPath (Join-Path $output 'PACKAGE_INVENTORY.json')).TrimEnd() -cne $json.TrimEnd() -or
      (Get-Content -Raw -LiteralPath (Join-Path $output 'SHA256SUMS.txt')).TrimEnd() -cne $sums) {
    throw 'Stored release inventory differs from the verified archives.'
  }
} else {
  Set-Content -LiteralPath (Join-Path $output 'PACKAGE_INVENTORY.json') -Value $json -Encoding utf8
  Set-Content -LiteralPath (Join-Path $output 'SHA256SUMS.txt') -Value $sums -Encoding utf8
}
$archiveRecords | ForEach-Object { "$($_.path) | $($_.version) | $($_.bytes) bytes | $($_.sha256)" }
