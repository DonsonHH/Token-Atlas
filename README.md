# Usage Console

> 一个隐私优先的本地 `ccusage` 仪表盘，用来清晰分析 Codex 的 token、缓存、会话、模型、成本估算与多设备用量。

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-Base_UI-000000)
![License](https://img.shields.io/badge/license-MIT-green.svg)

Usage Console 是一个运行在**自己电脑上**的使用分析台。它通过 `ccusage` 的离线 JSON 报告读取本机 Codex 日志，不会把会话内容上传到第三方服务。除了本机实时分析，也可以手动导入 Ubuntu、Jetson 等设备导出的汇总 JSON，在一个界面里查看综合数据。

## 功能一览

- 读取真实本地 Codex 日志，并通过 `--offline` 模式完成统计。
- 查看 7 / 14 / 30 / 90 天的 token、输入输出、缓存读取、推理输出与成本估算。
- 支持本机、综合数据和导入设备之间的筛选；显示数据更新时间与设备信息。
- 提供每日、每周、每月的趋势、移动均值、缓存复用、工作日分布、成本轨迹与 token 组成图表。
- 展示模型分布、会话来源负荷、活跃时段、缓存复用率和最近会话明细。
- 支持深色 / 浅色主题，以及导出当前筛选结果或原始 `ccusage` JSON。
- 使用 Next.js、Recharts 与 shadcn/ui 构建，适合本地长期运行。

## 截图与数据范围

仪表盘只统计 `ccusage` 能从本地日志解析出的汇总字段：token、缓存、模型、会话目录、活动时间和本地估算成本。它**不会**上传、展示或复制对话正文。

成本由 `ccusage` 的本地定价表估算，仅用于趋势参考，不等同于 OpenAI 账单、额度或 credits。

## 项目结构

```text
.
├─ ccusage-dashboard/          # Next.js 应用根目录
│  ├─ app/                     # 页面和本地 API
│  ├─ components/              # shadcn/ui 与分析组件
│  ├─ data/devices/            # 手动导入的设备汇总（默认忽略）
│  ├─ lib/usage.ts             # ccusage 读取、归并和设备导入逻辑
│  └─ scripts/                 # Windows 一键启动脚本
└─ .github/workflows/ci.yml    # GitHub Actions 验证工作流
```

## 快速开始

### 前置条件

- Node.js 20 或更高版本。
- `pnpm` 9 或更高版本（推荐）。
- 已在本机使用 Codex，且存在可供 `ccusage` 读取的 `~/.codex` 日志。

```powershell
git clone https://github.com/DonsonHH/Usage-Console.git
cd Usage-Console\ccusage-dashboard

corepack enable
pnpm install
pnpm dev
```

打开 <http://localhost:3000> 即可。

### Windows 一键启动

在 `ccusage-dashboard` 目录运行：

```powershell
.\scripts\open-dashboard.ps1
```

该脚本会检测本地服务；未启动时会后台启动开发服务器，然后打开浏览器。若使用 Codex Desktop，它会优先寻找 Codex 随附的 Node.js 运行时；没有该运行时时，请先安装 Node.js 并执行 `pnpm install`。

### 常用开发命令

```powershell
cd ccusage-dashboard

pnpm dev       # 本地开发服务器
pnpm lint      # ESLint
pnpm build     # 生产构建与 TypeScript 检查
pnpm start     # 启动已构建的生产服务
```

## 导入另一台设备的数据

Usage Console 支持手动合并另一台设备的**汇总用量**。外部设备不会导入本机会话明细或日志正文。

### 1. 在 Ubuntu / Jetson 上导出

先在该设备上安装或使用 `ccusage`，然后运行：

```bash
pnpm exec ccusage codex daily --json --offline --last 90 > jetson-codex-usage.json
```

如果没有项目级 `pnpm`，也可以使用已安装的 `ccusage` 命令。将生成的 JSON 文件手动复制到运行仪表盘的 Windows 电脑。

### 2. 导入到仪表盘

在 Windows 的项目目录中执行：

```powershell
cd ccusage-dashboard
New-Item -ItemType Directory -Force .\data\devices
Copy-Item <复制过来的 JSON 文件路径> .\data\devices\jetson-orin-nano.json
```

刷新页面后，在顶部“设备”筛选中选择“综合数据”或该设备即可。导入文件可以附带可选元数据：

```json
{
  "deviceName": "NVIDIA Jetson Orin Nano",
  "exportedAt": "2026-08-04T12:00:00Z",
  "daily": []
}
```

只要根对象中存在 `daily` 数组，应用就能识别；`deviceName` 与 `exportedAt` 会用于界面展示。`data/devices/*.json` 默认被 Git 忽略，避免把个人用量提交到仓库。

## 数据、隐私与安全

- `/api/usage` 仅在本机 Node.js 进程中运行 `ccusage`，前端只请求这个本地接口。
- 默认使用 `--offline`，不需要把日志上传给 Usage Console 的任何服务器。
- “导出数据”仅在浏览器本地生成 JSON 下载文件。
- 导入设备数据应视为个人使用统计；仓库已忽略 `data/devices/*.json`。
- 不要把仪表盘直接暴露到公网。应用默认没有登录或权限控制。

## 部署建议

### 推荐：在日志所在机器本地运行

这是最合适的方式。`ccusage` 必须读取运行机器上的 `~/.codex` 日志，因此将应用部署到 Vercel、Netlify 等无状态云平台通常既看不到你的本地数据，也不符合隐私目标。

### 可选：可信局域网中的个人服务器

如果希望从同一家庭或办公网络的其他设备查看数据，可以在拥有日志的受信任主机上运行：

```bash
cd ccusage-dashboard
pnpm install
pnpm build
pnpm start -- --hostname 0.0.0.0 --port 3000
```

然后在局域网访问 `http://<主机 IP>:3000`。请只在防火墙、VPN 或反向代理鉴权已经保护好的网络中使用；不要公开暴露端口 3000。

## CI

每次推送和 Pull Request 都会通过 GitHub Actions 执行：

1. `pnpm install --frozen-lockfile`
2. `pnpm lint`
3. `pnpm build`

这确保 UI、类型检查和生产构建在干净环境中可通过。

## 故障排查

### 页面提示没有本地数据

确认命令能在应用目录中运行：

```bash
pnpm exec ccusage codex daily --json --offline --last 14
```

若该命令无记录，请先在本机完成至少一次 Codex 会话。若命令找不到依赖，请运行 `pnpm install`。

### 导入设备没有显示

- 文件必须位于 `ccusage-dashboard/data/devices/`。
- 扩展名必须为 `.json`。
- JSON 必须合法，且包含 `daily` 数组。
- 复制完成后点击仪表盘右上角的“刷新”。

### 成本数字与账单不同

这是预期行为。图表展示的是 `ccusage` 根据本地价格表得出的估算，不是官方结算数据。

## 发布

当前首个稳定版本为 `v0.1.0`。GitHub Release 会附带版本说明和自动生成的源码包；由于本项目是本地 Web 应用，不提供预编译安装包。

## 许可证

本项目采用 [MIT License](LICENSE)。

## 贡献

欢迎提交 Issue 或 Pull Request。提交前请在 `ccusage-dashboard` 目录运行：

```bash
pnpm lint
pnpm build
```

---

由 Donson 维护。使用时请始终以本地隐私和日志安全为先。
