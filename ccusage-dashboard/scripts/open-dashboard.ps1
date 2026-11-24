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

  $launcher = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`"" -WindowStyle Hidden -PassThru

  # First launch or an edited checkout may need a production build.
  $deadline = (Get-Date).AddSeconds(120)
  while ((Get-Date) -lt $deadline) {
    if (Test-TokenAtlasReady) {
      break
    }
    if ($launcher.HasExited -and $launcher.ExitCode -ne 0) {
      throw 'Token Atlas 启动失败。请在 ccusage-dashboard 运行 pnpm install --frozen-lockfile 后重试，或直接运行 scripts/start-local.ps1 查看错误。'
    }

    Start-Sleep -Seconds 1
  }
}

if (-not (Test-TokenAtlasReady)) {
  throw "Token Atlas did not start within 120 seconds. Check the production build and dependencies."
}

Start-Process $url
