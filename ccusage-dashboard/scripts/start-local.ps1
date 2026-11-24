param(
  [ValidateRange(1, 65535)]
  [int]$Port = 3000
)

$runtimeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$node = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $runtimeRoot "node\bin\node.exe" }
$next = Join-Path $PSScriptRoot "..\node_modules\next\dist\bin\next"
$launcher = Join-Path $PSScriptRoot "run-local.mjs"

if (-not (Test-Path -LiteralPath $node)) {
  Write-Error "未找到可用的 Node.js。请安装 Node.js 20.9+ 后运行 pnpm dev。"
  exit 1
}

if (-not (Test-Path -LiteralPath $next)) {
  Write-Error "缺少项目依赖。请先在此目录运行 pnpm install。"
  exit 1
}

$dashboardRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$readerManifest = Join-Path $dashboardRoot 'node_modules\ccusage\package.json'
try {
  $expectedReader = (Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $dashboardRoot 'package.json') -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop).dependencies.ccusage
  $installedReader = (Get-Content -Raw -Encoding UTF8 -LiteralPath $readerManifest -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop).version
} catch {
  Write-Error '读取器依赖不可用。请先在 ccusage-dashboard 运行 pnpm install --frozen-lockfile。'
  exit 1
}
if (-not $expectedReader -or $installedReader -ne $expectedReader) {
  Write-Error "ccusage 版本不匹配（已装 $installedReader，需要 $expectedReader）。请先运行 pnpm install --frozen-lockfile。"
  exit 1
}

$mutex = [System.Threading.Mutex]::new($false, "Local\TokenAtlas.Port.$Port")
$chosen = $false
try {
  try { $chosen = $mutex.WaitOne(0) }
  catch [System.Threading.AbandonedMutexException] { $chosen = $true }
  if (-not $chosen) { exit 0 }

  Push-Location -LiteralPath $dashboardRoot
  try {
    $built = Get-Item -LiteralPath (Join-Path $dashboardRoot '.next\BUILD_ID') -ErrorAction SilentlyContinue
    $mustBuild = -not $built
    if ($built) {
      $sources = foreach ($directory in 'app', 'components', 'hooks', 'lib', 'public') {
        Get-ChildItem -LiteralPath (Join-Path $dashboardRoot $directory) -Recurse -File
      }
      $sources += Get-ChildItem -LiteralPath $dashboardRoot -File |
        Where-Object { $_.Name -in 'next.config.ts','package.json','pnpm-lock.yaml','postcss.config.mjs','tsconfig.json' }
      $mustBuild = [bool]($sources | Where-Object { $_.LastWriteTimeUtc -gt $built.LastWriteTimeUtc } | Select-Object -First 1)
    }
    if ($mustBuild) {
      & $node $next build
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    # The desktop app is not a development environment. No bundler, file
    # watcher or HMR stays running after the one-off production build.
    & $node $launcher start --port $Port
    exit $LASTEXITCODE
  } finally {
    Pop-Location
  }
} finally {
  if ($chosen) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
