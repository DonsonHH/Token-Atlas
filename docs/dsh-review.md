# DSH 用量兼容

## 复现与原因

本机存在 4 份 `session.v4.jsonl.zstd`，但旧页面请求 `source=dsh` 返回 400（Agent 来源无效）。ccusage 20.0.40 以及核对时的最新 20.0.48 均没有 DSH 原生来源，因此只升级依赖不能解决漏读。

## 实现

- ccusage 与 Jetson 脚本同步固定 20.0.48；新增独立 DSH 只读适配器，支持本机默认目录与 `DSH_HOME`。
- v3/v4 普通或 Zstandard 日志按会话选择最高格式代次的一份副本；旧代次不会重复计数，未知新代次不会偷偷回退。流式读取，不落盘解压后的正文。
- 只累计已完成消息的 usage，按消息标识去重，排除最后一个 `session/end-seed` 前的继承历史；兼容旧的数字 seedLength。
- 顶部 Agent 筛选、模型分布、趋势、会话、导出与导入均识别 DSH。单一 Agent 读取不会混入其他来源。
- 全部 Agent 合并时，某个读取器失败会保留其他读取器的有效结果，并显示数据提示。
- DSH 只使用明确的 costUSD；没有费用时保留 token，显示待定价／已知价格小计。不读取凭据或余额，不猜测模型别名对应的网关价格。

## 依据

[DSH 官方持久化说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-persistence-jsonl/README.md)记录了日志代次、压缩与继承边界；[v4 格式说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/persistence-changes/2026-09-16-session-format-v4.md)用于核对当前消息结构。这里只投影统计字段，不运行格式迁移或启动 DSH 服务。

## 验证

回归测试使用合成日志，不提交真实会话。覆盖筛选、完成消息与重复消息、连续压缩帧、分支继承、时区与自定义范围、格式代次、损坏文件、未知格式、部分读取失败与导入分类。

实际日志持续增长，执行时已读取到 4 个会话、约 1,970 万 token，模型为 deepseek-v4.1-flash；费用因日志未提供美元价格而保留为待定价。验证以当次 API／网页返回值为准，不把该快照当作固定示例数据。

最终 `pnpm verify` 通过（lint、类型检查、43 项测试、生产构建），部署追踪清单不包含 `.dsh` 或私人设备报告。

固定 2026-11-10 的范围后，原生读取器为 1,274,527,233 token，DSH 为 19,722,146，合并结果为 1,294,249,379；日、周、月及会话汇总相等。跨午夜继续记录后的网页导出快照为 20,308,517 个 DSH token、4 个会话，导出后的重新导入保留 DSH 分类与缺价信息。

浏览器实测概览、模型、会话来源标签与搜索、汇总下载；控制台无错误。Jetson 脚本通过旧版本／无 pnpm 的 npx 回退测试，DSH 参数会提示使用网页适配器，不会误传给不支持的 ccusage 命令。没有在远端设备执行操作，也没有新建 Release 或推送仓库。
