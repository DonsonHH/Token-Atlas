param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3000
)

$runtimeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$node = Join-Path $runtimeRoot "node\bin\node.exe"
$next = Join-Path $PSScriptRoot "..\node_modules\next\dist\bin\next"

if (-not (Test-Path -LiteralPath $node)) {
  Write-Error "未找到可用的 Node.js。请安装 Node.js 20+ 后运行 pnpm dev。"
  exit 1
}

if (-not (Test-Path -LiteralPath $next)) {
  Write-Error "缺少项目依赖。请先在此目录运行 pnpm install。"
  exit 1
}

& $node $next dev --port $Port
