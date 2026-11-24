# Token Atlas

<p align="center">
  <img src="ccusage-dashboard/public/token-atlas-mark.svg" width="92" alt="Token Atlas logo">
</p>

<p align="center">
  一个以隐私为先的本地仪表盘：把 ccusage 可读取的 AI 编程 Agent 用量、缓存、模型与多设备汇总放到同一视图中。
</p>

<p align="center">
  <a href="https://github.com/DonsonHH/Token-Atlas/actions"><img src="https://img.shields.io/github/actions/workflow/status/DonsonHH/Token-Atlas/ci.yml?branch=main&label=checks" alt="Checks"></a>
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License">
</p>

![Token Atlas 仪表盘预览](docs/preview.png)

## 它解决什么问题

Token Atlas 用 ccusage 在本机汇总 Agent 用量。可以按日期、模型和设备查看 token、缓存与 API 参考价，也可以导入 Ubuntu / Jetson 的离线汇总。

它不上传会话正文，也不需要 API Key。浏览器仅请求本地服务；外部设备只通过你主动复制或导入的 JSON 汇总参与统计。

| 你想知道           | Token Atlas 提供的答案                                             |
| ------------------ | ------------------------------------------------------------------ |
| 总共用了多少？     | 概览：精确 token / 紧凑单位切换、输入输出、缓存占比和 API 参考价。 |
| 用量何时发生变化？ | 用量分析：日、周、月趋势，按总量或模型拆分，查看和导出周期明细。   |
| 哪次会话消耗较多？ | 会话：搜索、模型筛选、排序、分页、详情与结果导出。                 |
| Codex 响应有多快？ | 用量分析 → 请求性能：按模型比较速度、首字，查看近期样本。          |
| 外部设备更新了吗？ | 数据源：逐台查看覆盖日期、导出时间，并直接粘贴或上传 JSON。        |

## 支持的 Agent 与数据范围

界面可按 ccusage 识别的来源筛选，包括 Claude Code、OpenAI Codex、DeepSeek Harness（DSH）、OpenCode、Amp、Droid、Codebuff、Cline、Hermes、pi、Goose、OpenClaw、Kilo、Kimi、Qwen、GitHub Copilot CLI、Gemini CLI、Antigravity、Grok、ZCode 与 Junie。

ccusage 从 [20.1.0](https://github.com/ccusage/ccusage/releases/tag/v20.1.0) 开始原生支持 DSH。选择 **DSH · DeepSeek Harness** 可单独查看用量与会话；选「全部 Agent」时，DSH 由综合报表计入一次。Token Atlas 不再单独读取或补算 DSH。

可用来源取决于本机实际日志。导入表单和命令行脚本优先使用报告中已有的来源；没有来源元数据的旧报告默认按 Codex 处理，导入其他 Agent 时请显式选择真实来源。

## 核心功能

- 概览依次展示四个紧凑 KPI、每日面积图与模型环图 / 数据表。
- 总 token 默认显示完整整数；点击数字即可在精确数值与 `4.4B` 这类紧凑单位之间切换。
- 日期支持 7 / 14 / 30 天、全部日期和自定义范围；全部日期读取所有可用历史，自定义窗口单次最多 366 天。
- 平滑面积图保留前五模型、其他模型和未归类用量，从少到多堆叠；点击图例可以突出一个系列。
- 周、月汇总与会话读取使用同一日期范围；7 日均值按所选指标和连续自然日计算。
- 页面、日期、设备、Agent 和分析选项保存在 URL 中，刷新或前进 / 后退可恢复。
- 会话只来自本机，手机端显示为卡片。搜索后的导出仅包含匹配记录。
- 采用浅色 / 深色主题；刷新、导入、导出和复制通过 Sonner 显示简短反馈。
- 单一 Agent 筛选不会把无法拆分的混合来源导入文件当作该 Agent 的用量。
- 缺少价格的用量显示“待定价”；部分缺价的汇总显示 `≥` 已定价小计，费用曲线留空，不把未知价格画成零费用。

## 快速开始

### 前置条件

- Node.js 20.9 或更高版本。
- pnpm 10 或更高版本；CI 使用 pnpm 10。若 pnpm 11 提示新依赖未达到默认发布年龄门槛，请等待门槛通过，无需关闭保护。
- 如需分析本机数据，至少有一种受 ccusage 支持的 Agent 日志。

```powershell
git clone https://github.com/DonsonHH/Token-Atlas.git
cd Token-Atlas\ccusage-dashboard

corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

打开 <http://localhost:3000> 即可查看仪表盘。

### Windows 一键启动

首次安装依赖后，可在 `ccusage-dashboard` 目录执行：

```powershell
.\scripts\open-dashboard.ps1
```

脚本会检查本地服务；未运行时只启动一个生产实例，再打开浏览器。首次或源码更新时构建一次，平时不运行开发监听器。依赖升级后请重新执行 `pnpm install`。

### 输出速度与首字

进入「用量分析 → 请求性能」，可按模型查看本机 Codex 的速度、首字中位数和近期样本。「概览 → 模型分布」里的入口会保留日期和筛选。即使选择「全部 Agent」，计时也只覆盖 Codex；DSH 和外部汇总不提供请求计时。无需安装 CC Switch，也不改代理配置。

`≈` 表示日志估算。速度按有效样本的总输出除以总耗时（含等首字），首字取首个有效输出的中位数，可能包括思考或工具输出。没有可靠锚点的记录显示「—」。「计时说明」解释口径，按模型看时也可开启各指标的样本数；报告不完整时显示「部分覆盖」，不堆叠扫描文件数。

只在打开「请求性能」时读计时，页面可见时每约 60 秒静默更新；离开页签或隐藏时暂停。概览与趋势不扫描计时。手动刷新只更新当前视图需要的数据。相同范围的并发读取共享结果，不会为每个标签页重扫。

计时最多选 128 份候选文件、每份保留 256 条；每批最多解码 24 MiB、每份最多 8 MiB。过大的明文读尾段，压缩日志读有界前段。压缩计时需要支持原生 Zstandard 的 Node.js（推荐 24 LTS）。触及上限时显示「部分覆盖」，可缩小日期范围查询。这些限制不影响 token、参考价或导出。

## 从 Ubuntu / Jetson 导入数据

外部设备导入的是按日聚合用量，不包含会话正文。最省事的方式是：在 Ubuntu / Jetson 生成并打开 JSON，复制全部内容，然后在 Windows 端从剪贴板导入。

### 1. 在 Ubuntu 或 Jetson 导出

将 `ccusage-dashboard/scripts/export-jetson-usage.sh` 复制到设备后执行：

```bash
bash export-jetson-usage.sh
```

默认导出全部可用日期的 Codex 数据。脚本和网页均固定 ccusage `20.1.1`；已安装版本不匹配时，脚本尝试用 `pnpm dlx` 或 `npx` 运行固定版本。

如需指定文件、设备名称或来源：

```bash
bash export-jetson-usage.sh ~/jetson-dsh.json "NVIDIA Jetson Orin Nano" dsh
```

最后一项可用 `codex`、`dsh` 或 `all`。`all` 包含 ccusage 识别的 DSH 用量，是混合来源汇总，不能当成某个 Agent 的数据。导出非 Codex 或混合报表时需要 Python 3 写入来源标签。如果手动运行 `ccusage dsh daily --json --offline`，请在导入时选 DSH。

### 2. 在网页导入（推荐）

打开 **数据源 → 导入数据**，粘贴 JSON 或选择文件（最大 5 MB），确认设备名称和 Agent 来源后导入。更新同一设备时，在对应卡片选择 **更新数据**，避免把同一份日志重复计入不同设备。

导入前会检查日期和数值，拒绝多设备合并导出文件。更新以临时文件原子替换，并把上一份保存为 `data/devices/<id>.bak`。导入只保存用量字段，不保存对话内容。外部数据已经按日聚合，使用导出端的日期口径；要精确比较两台设备，请在 ccusage 导出时使用相同的时区。

### 3. 在命令行导入（兼容原工作流）

复制 JSON 全文后，在 `ccusage-dashboard` 目录运行：

```powershell
.\scripts\import-usage.ps1
```

脚本与网页复用同一校验器，剔除正文及无关字段，补齐设备与来源元数据，并以原子方式写入 `data/devices/jetson-orin-nano.json`。首次运行前需执行 `pnpm install`；不需要提前启动网页服务。回到页面点击“刷新”，再选择“综合数据”或该设备即可查看。

已有文件可直接导入，也可指定来源：

```powershell
.\scripts\import-usage.ps1 -Source codex -InputPath C:\path\to\jetson-usage.json
```

`data/devices/*.json` 默认被 Git 忽略。请不要提交自己的用量导出文件。

## 隐私与数据说明

Token Atlas 处理的是 ccusage 输出中的日期、token、模型、会话目录、活跃时间和本地成本估算。它不会上传、展示或复制会话正文。

“API 参考价”来自 ccusage 的离线报表，不是服务商账单、额度或 credits。网页和 Jetson 导出均关闭 ccusage 遥测。完全缺价显示“待定价”，部分缺价显示已定价小计。图表对缺价日期留空；无用量日期才显示零。

ccusage `20.1.1` 已收录 `gpt-6.2-astra` 和 `gpt-6.2-sol` 的原生离线价表。网页只为本机 Codex 补入该版本缺少的 [OpenAI 官方 Fast 2 倍倍率](https://developers.openai.com/api/docs/pricing)，不改 token 费率、自定义价格、模型别名或用户配置。临时设置不可用时仍可按 CLI 原生口径读取。长上下文、Ultrafast 和不同缓存时长未逐档核对，不作为账单依据。Jetson 脚本沿用其 CLI 原生口径，外部汇总保留导出时金额，不自动回算。

### DSH 本地日志

ccusage 默认从 `~/.dsh/sessions/` 读取日志，支持 `DSH_HOME`。日志格式、模型识别和参考价由 ccusage 决定。显示结果可能与旧版独立读取器不同；上游未确认的模型和金额保持未确认，不补推测价格。

界面将 `deepseek-v4.1-flash` 和 `deepseek-flash` 归为一组，不改变金额。

已有导入仍保留原金额。需要换用新版口径时，从原设备重新导出并更新同一份数据源。自定义价格请使用 ccusage 的 [`pricingOverrides`](https://ccusage.com/guide/config-files)。

推理输出包含在输出 token 中，不重复累加。导出在浏览器本地完成，导入文件也只保留在你的设备上。

## 架构

`/api/usage` 读取 ccusage 报表并合并外部汇总；`/api/import` 校验和保存本地 JSON；`/api/performance` 单独读取有上限的本机 Codex 计时。

```mermaid
flowchart LR
  Browser["浏览器仪表盘"] --> Route["/api/usage"]
  Route --> Reader["readUsageSnapshot"]
  Reader --> Cli["ccusage 离线报告"]
  Reader --> Imports["data/devices/*.json"]
  Cli --> Local["本机 Agent 日志（含 DSH）"]
  Imports --> Reader
  Reader --> Domain["精确日期范围与统一聚合"]
  Domain --> Snapshot["UsageSnapshot"]
  Snapshot --> Browser
```

| 模块                          | 职责                                                   |
| ----------------------------- | ------------------------------------------------------ |
| `lib/usage-range.ts`          | 日期、时区与范围校验                                   |
| `lib/usage.ts`                | ccusage 读取编排                                       |
| `lib/ccusage-reader.ts`       | 调用固定版本的离线 CLI，包含 DSH                       |
| `lib/native-performance.ts`   | 本机 Codex 请求计时、范围过滤与聚合                    |
| `lib/usage-snapshot.ts`       | 合并本机 / 导入，统一日、周、月与模型汇总              |
| `lib/usage-analytics.ts`      | 补齐日期、按指标求均值、无遗漏模型堆叠                 |
| `lib/usage-pricing.ts`        | 区分完整价格、已知小计与未确认价格，统一页面诊断与文案 |
| `hooks/use-usage-snapshot.ts` | 请求取消、范围身份与失败状态                           |
| `components/workspace/`       | 页面外壳、范围控件、用量及请求页面与导入交互           |

本机读取失败时，仍可使用有效的导入数据，并显式显示数据提示。切换筛选时不展示上一范围的结果。详细审查记录见 [重构 review](docs/redesign-review.md)、[价格与读取器复查](docs/pricing-review.md) 与 [压缩日志兼容复查](docs/compressed-history-review.md)。

## 开发与验证

在 `ccusage-dashboard` 目录运行：

| 命令             | 用途                                         |
| ---------------- | -------------------------------------------- |
| `pnpm dev`       | 启动开发服务器                               |
| `pnpm lint`      | 执行 ESLint 检查                             |
| `pnpm typecheck` | 执行 TypeScript 严格类型检查                 |
| `pnpm test`      | 运行数据归一化、聚合、设备选择与导出回归测试 |
| `pnpm build`     | 构建生产版本                                 |
| `pnpm verify`    | 依次运行 lint、typecheck、test 和 build      |

GitHub Actions 会在主分支推送与 Pull Request 时，在 Windows 和 Ubuntu 上执行同样的验证。

## 部署

推荐在日志所在机器本地运行。ccusage 需要读取本机 Agent 日志，部署到无状态云平台通常既无法访问数据，也违背本项目的隐私目标。

```powershell
cd ccusage-dashboard
pnpm install
pnpm build
pnpm start
```

默认只绑定 `127.0.0.1`。如要在受信任局域网查看汇总，可显式绑定到局域网地址并关闭本机计时接口。请仅在防火墙、VPN 或反向代理鉴权已配置的网络中使用，切勿直接将端口暴露到公网。

```bash
TOKEN_ATLAS_DISABLE_PERFORMANCE=1 pnpm exec next start --hostname 0.0.0.0 --port 3000
```

## 故障排查

### 页面没有本机数据

在应用目录运行 `pnpm exec ccusage daily --json --offline`。若没有记录，请确认这台机器已有受支持 Agent 的本地日志，并已完成 `pnpm install`。需要缩小范围时，可添加 `--since YYYY-MM-DD --until YYYY-MM-DD`。

### 导入设备没有显示

确认文件位于 `ccusage-dashboard/data/devices/`，扩展名为 `.json`，根对象中包含非空 `daily` 数组。导入完成后刷新页面，并切换到“综合数据”或目标设备。

### 全部日期中的历史用量突然减少

先检查数据源页面的读取器版本。Codex 的历史日志可能保存为 `.jsonl.zst`；ccusage 20.0.30 不支持该格式，直到 [20.0.33](https://github.com/ccusage/ccusage/releases/tag/v20.0.33) 才加入支持。项目现使用 20.1.1，可直接读取 `sessions/` 和 `archived_sessions/` 下的普通与压缩日志，无需手动解压或修改原日志。

拉取新版项目后运行 `pnpm install`，重启正在运行的网页服务，再刷新全部日期。外部设备若曾用旧版生成报告，需要使用新版导出脚本重新导出并更新对应设备；旧汇总本身无法补出漏读的用量。

### 成本数字与账单不一致

这是预期行为。Token Atlas 展示的是 ccusage 根据本地定价表推导的参考值，不是官方结算金额。

### 有 token，但近期参考价为零或“待定价”

先在数据源页面确认读取器版本，再检查数据提示中的模型名称。老版本可能尚未包含新模型价格，升级网页依赖后刷新：

```powershell
pnpm install
```

本项目已固定新版依赖；如果以后需要升级，请同时更新 `package.json`、锁文件和 Jetson 导出脚本，并运行 `pnpm verify`。外部设备的数据需要在原设备重新导出并导入，不能仅靠刷新本机修复。新版依然缺价时，请核实模型与服务商，再参考 ccusage 的定价覆盖配置；不要自行填入猜测价格。

## 贡献与许可

欢迎提交 Issue 或 Pull Request。提交前请在 `ccusage-dashboard` 目录执行 `pnpm verify`。

项目以 [MIT License](LICENSE) 发布。查看 [Releases](https://github.com/DonsonHH/Token-Atlas/releases) 获取最新版本。
