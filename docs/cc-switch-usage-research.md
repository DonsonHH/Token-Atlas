# CC Switch 用量方案调研

此页记录初次方案评估。最终实现已改为[直接读原生日志](native-request-timing-research.md)，不依赖本机 CC Switch 的数据库。

2026-11-23 核对。[CC Switch v4.0.39](https://github.com/farion1231/cc-switch/releases/tag/v4.0.39) 是核对时 GitHub 的最新正式版；下文引用固定在这个版本。本次对照的两张截图分别打开「请求日志」和「模型」标签。两处的速度和首字有 `≈` 前缀，明细来源是「会话日志」：这些数字可以来自已有本地会话，不要求开启代理。

## 它比汇总报告多了什么

CC Switch 把**已完成请求的明细**和**日汇总**存到 SQLite。会话增量扫描可以覆盖未走代理的使用；已启用用量记录的本地路由还会记录请求状态、供应商与实测计时。日志导入的供应商往往是应用对应的占位项，不能从会话记录推知实际是哪家网关。页面把同一筛选范围下的请求数、费用、token 与输入缓存命中率放在上方，加按周排列的日热力图，再用「请求日志／供应商／模型」三种视图查看细项。参见 [官方用量手册](https://github.com/farion1231/cc-switch/blob/v4.0.39/docs/user-manual/zh/4-proxy/4.4-usage.md)、[三类页签](https://github.com/farion1231/cc-switch/blob/v4.0.39/src/components/usage/UsageDashboard.tsx#L99-L115)、[53 周热力图](https://github.com/farion1231/cc-switch/blob/v4.0.39/src/components/usage/UsageHeatmap.tsx#L89-L111)。

| 指标 | 读数口径 |
| --- | --- |
| 实测首字 | 路由侧从请求起点计至第一个符合探测规则的 SSE 输出事件，而非首个带 token 统计的事件；Antigravity 原生库也有原生计时。它是采集端的时间，不等于屏幕渲染时间。 |
| 实测输出速度 | 对路由或 Antigravity 原生记录，输出 ≥ 100 token 且 `latency_ms - first_token_ms ≥ 100`，用输出 token 除以该生成窗口（秒）。 |
| 会话估算速度 | 输出 ≥ 200 token、记录的估算耗时 ≥ 1 秒时，用输出 token 除以总耗时（含等首字）。即使有估算首字也不从分母扣除。显示 `≈`。 |
| 会话估算首字 | DSH 用同一 `(turn, step)` 的 `step/start` 到 `assistant/message` 的最早 `stream.time/time0`；Codex 按 rollout 里的请求边界、首个输出和完成用量事件推导。没有可靠的起点或首个输出事件时留空。 |
| 模型／供应商性能 | 分开累计精确与估算样本。速度为 Σ输出 ÷ Σ对应时长；首字取各自样本的中位数。优先展示实测，只有估算时加 `≈`。无明细计时的归档不参与。 |

计时细节见 [路由对 SSE 的采集](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/proxy/response_processor.rs#L431-L500)、[DSH 会话解析](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/services/session_usage_dsh.rs#L485-L608)、[Codex 计时推导](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/services/session_usage_codex.rs#L419-L463)、[前端显示门槛](https://github.com/farion1231/cc-switch/blob/v4.0.39/src/components/usage/format.ts#L260-L382)和[后端聚合口径](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/services/usage_stats.rs#L148-L249)。DSH / Codex 的推导耗时有 100 ms 至 1 小时的合理区间，首字须落在请求区间内。见[共享估算校验](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/services/session_usage.rs#L228-L243)与[首字范围校验](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/services/session_usage.rs#L393-L401)。

## 自动更新与数据边界

- CC Switch 用量页默认 **60 秒扫描本地会话**（亦可选 5 / 10 / 30 秒），进入即扫描，隐藏时暂停、重新聚焦时补扫，同一时间只跑一次。全应用后台的兜底扫描默认 10 分钟。数据写入后通过 `usage-log-recorded` 事件使查询失效；滚动时间范围每分钟也会重新取数。这与「每 60 秒重新导入或重算所有日志」不同。见 [手册](https://github.com/farion1231/cc-switch/blob/v4.0.39/docs/user-manual/zh/4-proxy/4.4-usage.md#L53-L61)、[前台扫描](https://github.com/farion1231/cc-switch/blob/v4.0.39/src/hooks/useUsageAutoRefresh.ts)、[事件桥接](https://github.com/farion1231/cc-switch/blob/v4.0.39/src/hooks/useUsageEventBridge.ts)、[后台扫描](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/lib.rs#L1444-L1494)。
- 默认库是 `~/.cc-switch/cc-switch.db`，也允许 CC Switch 自己使用另一配置目录。Token Atlas 可只读默认库或显式配置的绝对路径，无须读取 CC Switch 的配置内容。建议使用 Node 的 [`DatabaseSync` 只读模式](https://nodejs.org/docs/latest-v22.x/api/sqlite.html#new-databasesyncpath-options)，只投影少数统计列，加超时和分页；不运行上游的同步、迁移、回填、代理或重建操作。见 [数据库初始化](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/database/mod.rs#L146-L161)、[目录定位](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/config.rs#L313-L351)。
- 请求表 `proxy_request_logs` 里 `created_at` 是 Unix **秒**；`latency_ms`、`first_token_ms` 是毫秒（未知总耗时在会话行里可能为 0，未知首字为 NULL），不要用 `duration_ms` 替代速度分母。代理 `status_code` 反映网关记录的响应，会话导入中的 200 是占位，不足以推知该应用完整的成功率。输入、输出、缓存命中、写入分列；归一后真实总量是四项之和，命中率分母只含输入与缓存。见 [明细 schema](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/database/schema.rs#L241-L265)、[代理写入](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/proxy/usage/logger.rs#L134-L224)、[Codex 会话写入](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/services/session_usage_codex.rs#L2694-L2729)。
- 输入语义：`input_token_semantics=2` 为新增输入，直接采用；`codex / gemini / grokbuild` 中 `1` 表示含缓存读写、从输入减两项，`0` 是旧格式、只减缓存读；仅扣除不超过存储输入的数量。其余应用按已分离输入。DSH 属于分离输入，不能二次扣缓存。见[共享 SQL 口径](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/services/sql_helpers.rs#L9-L82)。
- 明细与供应商使用 `(app_type, provider_id)` 关联，一些用户自定义名称和通用「会话日志」可重名。上游的 `_session` 是 Claude Code，`_codex_session` 是 Codex，`_dsh_session` 是 DSH 会话，`_dsh_account_session` 则是 DSH 账号登录（仍来自会话）。如展示已命名的网关，只读取 `providers.name`，别读取连接设置。见[占位供应商映射](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/services/usage_stats.rs#L406-L427)及 [DSH 两类记录](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/services/session_usage_dsh.rs#L58-L69)。
- `total_cost_usd` 本身是文本存储的已记录估算，可能受 CC Switch 的价格表与用户倍率影响。成功且有 token、金额为零的记录通常仍未定价，显式零倍率除外。CC Switch 自己的取明细命令还可能就地回填价格，只读接入不触发它。对齐前端口径并标注价格来源，避免拿这里的金额替换 Token Atlas 原有官方参考价。见[零价判断](https://github.com/farion1231/cc-switch/blob/v4.0.39/src/types/usage.ts#L290-L313)、[回填入口](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/services/usage_stats.rs#L2184-L2191)。
- `usage_daily_rollups` 把过期明细折叠为日统计（归档日期按 CC Switch 当时的系统本地自然日）。归档留下请求数、输入、输出、缓存、费用与平均延迟，没有逐请求速度或首字。CC Switch 在查询中还会用 app、模型、token 与窄时间窗去掉部分「代理＋会话」重复。不能把原始明细与 `ccusage` 和独立 DSH 报告再次叠加；如果只展示「保留明细」，标清覆盖边界。见[归档实现](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/database/dao/usage_rollup.rs#L116-L188)、[跨源去重](https://github.com/farion1231/cc-switch/blob/v4.0.39/src-tauri/src/services/usage_stats.rs#L696-L824)。

## Token Atlas 接入建议

先保留现有的离线汇总、Jetson 导入和 DSH 官方价；在本机提供可独立筛选的 CC Switch 请求与模型／供应商性能视图。刷新只重读 CC Switch **已同步**的数据，参考 60 秒可见时轮询、恢复可见立即重读、不叠发，显式区分读取时间与最新记录时间。不会促使后台 CC Switch 加速扫描；未安装、没有同步、写锁或 schema 不兼容时保留原用量视图及明确状态。单次 API 仅投影统计所需列，不返回正文、路径、凭据、原始异常消息或完整数据库。热力图可以从现有逐日聚合派生，不需要把全部请求记录送到浏览器。

本机以 Node SQLite 只读连接核对过 schema v27：明细、计时字段、供应商连接键和日归档均存在；Codex / DSH 有实际可显示的**会话估算**样本，未观察到实测路由样本。本调研未修改 CC Switch 库、配置或日志。实际金额与规模未写入这份可提交的文档。后续验证应覆盖只读、范围／分页、来源标记、测量与估算分开、未知计时不补 0、归档不产生明细、本机与外部设备隔离、可见期间刷新。

CC Switch 采用 [MIT 许可证（Copyright © 2025 Jason Young）](https://github.com/farion1231/cc-switch/blob/v4.0.39/LICENSE)。这些链接用于说明独立实现的互操作约定；如果以后复制其源码或实质部分，需随分发保留版权与许可声明。
