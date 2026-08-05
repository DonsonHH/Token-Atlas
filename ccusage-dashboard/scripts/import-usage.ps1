[CmdletBinding()]
param(
  [ValidatePattern("^[a-z0-9][a-z0-9_-]*$")]
  [string]$DeviceId = "jetson-orin-nano",

  [string]$DeviceName = "NVIDIA Jetson Orin Nano",

  [string]$InputPath
)

$ErrorActionPreference = "Stop"

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

$usage | Add-Member -NotePropertyName "deviceName" -NotePropertyValue $DeviceName -Force

if ([string]::IsNullOrWhiteSpace([string]$usage.exportedAt)) {
  $usage | Add-Member -NotePropertyName "exportedAt" -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) -Force
}

$dashboardRoot = Split-Path -Parent $PSScriptRoot
$deviceDirectory = Join-Path $dashboardRoot "data\devices"
$targetPath = Join-Path $deviceDirectory ($DeviceId + ".json")
$temporaryPath = Join-Path $deviceDirectory ($DeviceId + "." + [guid]::NewGuid().ToString("N") + ".tmp")

New-Item -ItemType Directory -Force -Path $deviceDirectory | Out-Null

try {
  $serializedJson = $usage | ConvertTo-Json -Depth 100
  [IO.File]::WriteAllText(
    $temporaryPath,
    $serializedJson,
    [Text.UTF8Encoding]::new($false)
  )
  Move-Item -LiteralPath $temporaryPath -Destination $targetPath -Force
} finally {
  if (Test-Path -LiteralPath $temporaryPath) {
    Remove-Item -LiteralPath $temporaryPath -Force
  }
}

$latestDate = @($usage.daily | ForEach-Object { $_.date } | Sort-Object | Select-Object -Last 1)[0]

[PSCustomObject]@{
  Device = $DeviceName
  DailyEntries = @($usage.daily).Count
  LatestDate = $latestDate
  ImportedTo = $targetPath
} | Format-List
