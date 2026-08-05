$ErrorActionPreference = "Stop"

$port = 3000
$url = "http://localhost:$port"
$startScript = Join-Path $PSScriptRoot "start-local.ps1"

function Test-TokenAtlasReady {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2
    return $response.StatusCode -eq 200 -and $response.Content -match "Token Atlas"
  } catch {
    return $false
  }
}

if (-not (Test-TokenAtlasReady)) {
  if (-not (Test-Path -LiteralPath $startScript)) {
    throw "Start script not found: $startScript"
  }

  Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`"" -WindowStyle Hidden

  $deadline = (Get-Date).AddSeconds(35)
  while ((Get-Date) -lt $deadline) {
    if (Test-TokenAtlasReady) {
      break
    }

    Start-Sleep -Seconds 1
  }
}

if (-not (Test-TokenAtlasReady)) {
  throw "Token Atlas did not start within 35 seconds. Check the script and dependencies."
}

Start-Process $url
