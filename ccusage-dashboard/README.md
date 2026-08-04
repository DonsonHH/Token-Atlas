# Usage Console

一个基于 [shadcn/ui](https://ui.shadcn.com/) 构建的本地 `ccusage` 仪表盘，用来查看 Codex（或全部已识别 coding agent）的 token、缓存、会话和费用估算。

## 功能

- 真实读取本机 `~/.codex` 日志，不使用示例历史数据兜底
- 最近 7 / 14 / 30 / 90 天的 token、输入输出、缓存、费用趋势
- shadcn/ui 的 Card、Tabs、Select、Table、Badge、Tooltip 与 Chart 组件
- Codex 专属与全部来源两种查看范围
- 日、周、月报表；Codex 的周报由真实每日 JSON 归并，并在界面明确标注
- 最近 10 条会话记录和完整原始 JSON 导出

## 启动

在 PowerShell 中进入项目目录后运行：

```powershell
.\scripts\start-local.ps1
```

然后打开 [http://localhost:3000](http://localhost:3000)。脚本会优先使用 Codex 桌面应用自带的 Node.js 运行时，因此不需要另行安装系统级 Node.js。

如果电脑已安装 Node.js 与 pnpm，也可使用：

```powershell
pnpm install
pnpm dev
```

## 数据与隐私

前端只请求本机的 `/api/usage`。该接口在本机执行 `ccusage` 的 JSON 报表命令，并使用 `--offline` 读取本地日志；不会上传对话内容。

“估算费用”来自 ccusage 的本地定价计算，不等同于 OpenAI 账户的官方额度、账单或 credits。Codex focused reports 当前没有原生 weekly 命令，应用会将 `ccusage codex daily --json` 的真实每日记录按周归并，并明确显示该来源。

## 验证

生产构建：

```powershell
node .\node_modules\next\dist\bin\next build
```
