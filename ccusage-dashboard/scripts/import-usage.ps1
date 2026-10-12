[CmdletBinding()]
param(
  [ValidatePattern("^[a-z0-9][a-z0-9_-]*$")]
  [ValidateLength(1, 64)]
  [string]$DeviceId = "jetson-orin-nano",

  [string]$DeviceName = "NVIDIA Jetson Orin Nano",

  [ValidateSet("all", "claude", "codex", "opencode", "amp", "droid", "codebuff", "hermes", "pi", "goose", "openclaw", "kilo", "kimi", "qwen", "copilot", "gemini", "antigravity", "grok", "zcode")]
  [string]$Source = "codex",

  [string]$InputPath
)

$ErrorActionPreference = "Stop"
if ($DeviceId -in @('local', 'all')) { throw 'DeviceId local and all are reserved.' }

function Read-UsageJson {
  param([string]$Path)

  if ($Path) {
    $resolvedPath = Resolve-Path -LiteralPath $Path -ErrorAction Stop
    return [IO.File]::ReadAllText($resolvedPath, [Text.UTF8Encoding]::new($false))
  }

  $clipboard = Get-Clipboard -Raw
  if ([string]::IsNullOrWhiteSpace($clipboard)) {
    throw "Clipboard is empty. Copy the complete JSON from Ubuntu / Jetson, or provide -InputPath."
  }

  return $clipboard.Trim()
}

$rawJson = Read-UsageJson -Path $InputPath

try {
  $usage = $rawJson | ConvertFrom-Json
} catch {
  throw "The import content is not valid JSON: $($_.Exception.Message)"
}

if ($null -eq $usage.daily -or @($usage.daily).Count -eq 0) {
  throw "The import JSON must contain a non-empty daily array."
}

if (-not $PSBoundParameters.ContainsKey('DeviceName') -and -not [string]::IsNullOrWhiteSpace([string]$usage.deviceName)) {
  $DeviceName = [string]$usage.deviceName
}
if (-not $PSBoundParameters.ContainsKey('Source') -and -not [string]::IsNullOrWhiteSpace([string]$usage.source)) {
  $knownSources = @('all','claude','codex','opencode','amp','droid','codebuff','hermes','pi','goose','openclaw','kilo','kimi','qwen','copilot','gemini','antigravity','grok','zcode')
  if ([string]$usage.source -notin $knownSources) { throw 'Unknown source in the report. Pass -Source explicitly.' }
  $Source = [string]$usage.source
}
$Source = $Source.ToLowerInvariant()
$normalizer = Join-Path $PSScriptRoot 'normalize-usage.mjs'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js is required. Install the dashboard dependencies with pnpm install first.'
}
# Windows PowerShell 5 otherwise sends non-ASCII clipboard text as ASCII.
$previousOutputEncoding = $OutputEncoding
$previousConsoleEncoding = [Console]::OutputEncoding
try {
  $OutputEncoding = [Text.UTF8Encoding]::new($false)
  [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
  $normalizedJson = $rawJson | & node $normalizer $DeviceName $Source
  if ($LASTEXITCODE -ne 0) { throw 'Usage import validation failed. No device file was changed.' }
} finally {
  $OutputEncoding = $previousOutputEncoding
  [Console]::OutputEncoding = $previousConsoleEncoding
}
$usage = ($normalizedJson -join "`n") | ConvertFrom-Json

$dashboardRoot = Split-Path -Parent $PSScriptRoot
$deviceDirectory = Join-Path $dashboardRoot "data\devices"
$targetPath = Join-Path $deviceDirectory ($DeviceId + ".json")
$temporaryPath = Join-Path $deviceDirectory ($DeviceId + "." + [guid]::NewGuid().ToString("N") + ".tmp")
$lockPath = Join-Path $deviceDirectory ($DeviceId + ".lock")

New-Item -ItemType Directory -Force -Path $deviceDirectory | Out-Null
$lockHandle = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
$lockHandle.Dispose()

try {
  $serializedJson = $normalizedJson -join "`n"
  [IO.File]::WriteAllText(
    $temporaryPath,
    $serializedJson,
    [Text.UTF8Encoding]::new($false)
  )
  if (Test-Path -LiteralPath $targetPath) {
    Copy-Item -LiteralPath $targetPath -Destination (Join-Path $deviceDirectory ($DeviceId + '.bak')) -Force
  }
  Move-Item -LiteralPath $temporaryPath -Destination $targetPath -Force
} finally {
  if (Test-Path -LiteralPath $temporaryPath) {
    Remove-Item -LiteralPath $temporaryPath -Force
  }
  if (Test-Path -LiteralPath $lockPath) { Remove-Item -LiteralPath $lockPath -Force }
}

$latestDate = @($usage.daily | ForEach-Object { if ($_.date) { $_.date } elseif ($_.period) { $_.period } else { $_.label } } | Sort-Object | Select-Object -Last 1)[0]

[PSCustomObject]@{
  Device = $DeviceName
  DailyEntries = @($usage.daily).Count
  LatestDate = $latestDate
  ImportedTo = $targetPath
} | Format-List
