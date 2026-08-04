# Usage Console

<p align="center">
  一个以隐私为先的本地 ccusage 仪表盘，用于清晰分析 Codex 的 token、缓存、会话、模型、成本估算与多设备用量。
</p>

<p align="center">
  <a href="https://github.com/DonsonHH/Usage-Console/actions"><img src="https://img.shields.io/github/actions/workflow/status/DonsonHH/Usage-Console/ci.yml?branch=main&label=checks" alt="Checks"></a>
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License">
</p>

Usage Console 只在你的机器上读取 ccusage 可解析的汇总数据。它将本机 Codex 日志与手动复制过来的 Ubuntu、Jetson 等设备 JSON 统一展示，同时避免把会话正文或个人使用数据上传到第三方服务。

## 为什么使用它

| 你想回答的问题 | 对应能力 |
| --- | --- |
| 最近 token 用在了哪里？ | 日、周、月趋势，输入输出构成，缓存复用率和模型占比 |
| 某台设备占了多少？ | 本机、综合数据、单个导入设备之间一键筛选 |
| 今天的峰值是否异常？ | 每日趋势、移动均线、工作日分布和会话活跃分析 |
| 导出的数据可靠吗？ | 当前筛选汇总与原始 ccusage JSON 分开导出，文件名会自动净化 |
| 能否长期保存自己的记录？ | 设备导入采用本地 JSON；仓库默认忽略你的个人导出文件 |

## 功能一览

- 读取真实本机 ccusage 离线报告，不依赖云端账户或 API Key。
- 展示 token、输入输出、缓存读写、推理输出和本地成本估算。
- 支持本机、综合、单台外部设备以及 Codex / 全部来源筛选。
- 提供模型分布、日周月趋势、移动均线、缓存复用、工作日与会话图表。
- 提供深色 / 浅色主题、响应式布局、可访问的图表与清晰的数据状态。
- 导出当前筛选视图或原始 ccusage JSON；不会因菜单组件状态而中断下载。
- 若仅浏览导入设备，应用不会再强制执行本机 ccusage，便于在没有本机 Codex 日志的电脑上查看汇总。

## 快速开始

### 前置条件

- Node.js 20 或更高版本。
- pnpm 10 或更高版本，推荐通过 Corepack 启用。
- 需要分析本机数据时，本机应有可被 ccusage 读取的 Codex 日志。

~~~powershell
git clone https://github.com/DonsonHH/Usage-Console.git
cd Usage-Console\ccusage-dashboard

corepack enable
pnpm install
pnpm dev
~~~

随后访问 <http://localhost:3000>。

### Windows 一键启动

在 <code>ccusage-dashboard</code> 目录执行：

~~~powershell
.\scripts\open-dashboard.ps1
~~~

脚本会检查本地服务；服务尚未启动时会在后台启动，再打开浏览器。首次运行或依赖更新后，仍需先执行一次 <code>pnpm install</code>。

## 从 Ubuntu / Jetson 导入数据

外部设备导入的是汇总用量，不会导入会话正文。适合没有 SSH、只能手动复制文件的场景。

### 1. 在 Ubuntu 或 Jetson 上生成 JSON

如果已经安装了 ccusage：

~~~bash
ccusage codex daily --json --offline --last 90 > jetson-codex-usage.json
~~~

如果没有全局安装，可使用 pnpm 临时执行：

~~~bash
pnpm dlx ccusage@20.0.19 codex daily --json --offline --last 90 > jetson-codex-usage.json
~~~

### 2. 手动复制到运行仪表盘的电脑

把 JSON 文件复制到项目中的下列位置，再点击页面右上角“刷新”：

~~~powershell
cd Usage-Console\ccusage-dashboard
New-Item -ItemType Directory -Force .\data\devices
Copy-Item <复制过来的 JSON 文件路径> .\data\devices\jetson-orin-nano.json
~~~

文件至少需要包含 <code>daily</code> 数组。可以加上用于界面展示的元数据：

~~~json
{
  "deviceName": "NVIDIA Jetson Orin Nano",
  "exportedAt": "2026-08-04T12:00:00Z",
  "daily": []
}
~~~

<code>data/devices/*.json</code> 已被 Git 忽略，请不要将自己的用量数据提交到仓库。

## 数据范围与隐私

Usage Console 处理的是 ccusage 输出中的聚合字段：日期、token、模型、会话目录、活跃时间和本地成本估算。

- 不上传、不展示、不复制会话正文。
- 默认使用 <code>--offline</code>；浏览器只访问本地的 <code>/api/usage</code>。
- “估算费用”来自 ccusage 本地定价表，仅用于趋势参考，不等同于 OpenAI 账单、额度或 credits。
- 导出发生在浏览器本地，导入文件也只保存在你的设备上。

## 架构概览

应用的对外接口保持简单：页面只请求 <code>/api/usage</code>，路由只调用 <code>readUsageSnapshot</code>。CLI、文件系统与兼容性处理被收敛在内部模块中，便于定位问题和编写回归测试。

~~~mermaid
flowchart LR
  Browser["浏览器仪表盘"] --> Route["/api/usage"]
  Route --> Reader["readUsageSnapshot"]
  Reader --> Cli["ccusage CLI 适配"]
  Cli --> Local["本机 ~/.codex 日志"]
  Reader --> Imports["设备导入适配"]
  Imports --> Json["data/devices/*.json"]
  Reader --> Domain["纯数据归一化与聚合"]
  Domain --> Snapshot["UsageSnapshot"]
  Snapshot --> Browser
~~~

~~~text
ccusage-dashboard/
├── app/                     Next.js 页面与本地路由
├── components/usage/        图表、洞察与会话展示
├── hooks/                   浏览器端请求生命周期
├── lib/
│   ├── usage.ts             读取快照的编排入口
│   ├── usage-domain.ts      纯归一化、聚合与设备选择逻辑
│   ├── usage-imports.ts     导入 JSON 的文件系统适配
│   ├── usage-export.ts      可测试的导出视图与安全文件名
│   └── download.ts          浏览器下载副作用
├── tests/                   Node 原生回归测试
└── scripts/                 Windows 启动脚本
~~~

其中 <code>usage-domain.ts</code> 不访问进程、文件系统或浏览器，可独立测试；<code>usage.ts</code> 负责把 CLI 与导入设备的结果组合成一个稳定的 <code>UsageSnapshot</code>。这种划分让解析兼容、聚合规则和 I/O 故障更容易分别维护。

## 开发、验证与发布

在 <code>ccusage-dashboard</code> 目录运行：

| 命令 | 用途 |
| --- | --- |
| <code>pnpm dev</code> | 启动本地开发服务器 |
| <code>pnpm lint</code> | ESLint 代码质量检查 |
| <code>pnpm typecheck</code> | TypeScript 严格类型检查 |
| <code>pnpm test</code> | 编译并运行数据归一化、聚合、设备选择和导出命名回归测试 |
| <code>pnpm build</code> | 生产构建 |
| <code>pnpm verify</code> | 依次运行 lint、typecheck、test 和 build |

GitHub Actions 会在每次 push 与 Pull Request 上执行同样的 lint、类型检查、测试和生产构建。

## 部署建议

### 推荐：日志所在机器本地运行

这是最适合本项目的部署方式。ccusage 需要读取运行机器上的 <code>~/.codex</code> 日志，因此部署到无状态云平台通常既无法看到你的数据，也不符合本项目的隐私目标。

~~~powershell
cd ccusage-dashboard
pnpm install
pnpm build
pnpm start
~~~

### 可选：受信任局域网查看

只在防火墙、VPN 或反向代理鉴权已经妥善配置的受信任网络中使用：

~~~bash
cd ccusage-dashboard
pnpm install
pnpm build
pnpm start -- --hostname 0.0.0.0 --port 3000
~~~

然后通过 <code>http://主机-IP:3000</code> 访问。不要把端口 3000 直接暴露到公网；应用本身不提供登录或权限控制。

## 故障排查

### 页面提示没有本机数据

先在应用目录执行：

~~~bash
pnpm exec ccusage codex daily --json --offline --last 14
~~~

若没有记录，请先在该机器完成至少一次 Codex 会话；若命令找不到依赖，请执行 <code>pnpm install</code>。

### 导入设备没有显示

1. 文件必须位于 <code>ccusage-dashboard/data/devices/</code>。
2. 扩展名必须是 <code>.json</code>，且 JSON 合法。
3. 根对象必须包含非空的 <code>daily</code> 数组。
4. 复制完成后点击“刷新”；选择“综合数据”或该设备即可查看。

### 成本数字与账单不一致

这是预期行为。仪表盘显示的是 ccusage 按本地定价表推导的估算，不是官方结算数据。

## 贡献与许可

欢迎提交 Issue 或 Pull Request。提交前请在 <code>ccusage-dashboard</code> 目录执行 <code>pnpm verify</code>。

本项目使用 [MIT License](LICENSE) 发布。首个公开版本为 [v0.1.0](https://github.com/DonsonHH/Usage-Console/releases/tag/v0.1.0)。
