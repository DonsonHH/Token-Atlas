# 原生计时实现 Review

> 历史记录。本文含已撤下的 DSH 计时；当前范围以 [实现与验收](native-request-timing-contract.md) 为准。

资源行为另见 [性能复查](native-request-performance-review.md)。本页保留当时的功能审查，不作为内存或 CPU 验收。

审查范围：从本地基线 `b7b2646` 到复审快照 `5f3cb56`。规格见 [实现与验收](native-request-timing-contract.md)，数据契约与 GitHub 备选见 [原生日志计时调研](native-request-timing-research.md)。

| Before | After | Why |
| --- | --- | --- |
| 另开独立「请求」页，统计依赖 CC Switch 数据库 | 概览紧凑计时条与模型列；用量分析用模型和近期样本两张表 | 在原有日期和 Agent 范围内查看，不维护第二套总量 |
| 宽表依赖横向滚动 | 窄屏优先保留模型、速度、首字；非核心列归为次级信息 | 手机端仍能直接比较两项核心指标 |
| 更新时间和样本的来源容易混淆 | 显示估算标识、速度／首字各自样本数、读入时间及待扫描覆盖 | 不把局部历史、缺失数据或回合级数据误当请求级实测 |
| 频繁读数可能反复出现状态反馈 | 可见时静默刷新，只在手动触发时用根部同一 Sonner 通知 | 保持布局稳定和键盘可操作，不打断阅读 |

前端沿用 [shadcn Table](https://ui.shadcn.com/docs/components/table)、[Tabs](https://ui.shadcn.com/docs/components/tabs) 和 [Tooltip](https://ui.shadcn.com/docs/components/tooltip)。高频刷新不增加入场动画，旋转反馈尊重减少动态效果的设定。

## Standards

初审 3 项 P2：DSH 空增量误当首字、Codex 相同用量的相邻响应被合并、多个 `CODEX_HOME` 根被当成一个路径。逐项合成复现、修正并复审，均关闭。

## Spec

初审 3 项 P2：相邻响应误合并（包括保留了错误结束时刻）、DSH 空增量、DSH 大历史未分批。与规范轴重叠的项目共用回归；共享有界索引补齐两种 Agent 的历史处理。最终无剩余阻塞。

## 验证

- `pnpm verify` 通过：lint、类型检查、80 项测试和生产构建。测试覆盖多个根、归档压缩、重复结算、继承序号、重试、空增量、分批索引、完整行与可见性暂停。
- 实际原生日志确认 Codex 和 DSH 均能生成速度、首字样本。第一次读取大型 Codex 历史时显示部分覆盖，不能和完整经费／token 口径相混。
- 浏览器核对概览、用量分析、DSH 最近请求、Jetson 无计时状态和窄屏关键列。DSH 定时读数间隔实测 60 秒，选中页签保持不变；手动刷新使用同一条通知。
- 请求接口仅本机启动器可用；外部设备不会读本机计时。接口样本没有正文、路径、请求 ID，构建追踪不含日志或数据库，旧请求接口已不存在。原有 Opus 5.5 参考价仍可读取。
