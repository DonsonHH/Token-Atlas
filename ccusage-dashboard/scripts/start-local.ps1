param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3000
)

$runtimeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$node = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $runtimeRoot "node\bin\node.exe" }
$next = Join-Path $PSScriptRoot "..\node_modules\next\dist\bin\next"

if (-not (Test-Path -LiteralPath $node)) {
  Write-Error "未找到可用的 Node.js。请安装 Node.js 20.9+ 后运行 pnpm dev。"
  exit 1
}

if (-not (Test-Path -LiteralPath $next)) {
  Write-Error "缺少项目依赖。请先在此目录运行 pnpm install。"
  exit 1
}

$dashboardRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
Push-Location -LiteralPath $dashboardRoot
try {
  & $node $next dev --port $Port
} finally {
  Pop-Location
}
