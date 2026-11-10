# DSH 官网计价与推送前审查

## 原始需求与审查范围

用户提供 [DeepSeek 中文官网价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)，要求“按照官网定价算就行。做完后 review 一下更新 push 到 github”。用户已确认 review 从上次推送的 `main`（2b8fe54）开始，覆盖全部待推送的 DSH 支持及本次计价。

本次需求来自本对话，不关联 Issue；使用仓库已有 CONTEXT.md、README、DSH 兼容记录及本文作为规范／规格依据，不新增 Issue 或 Release。

## 实现决策

- 页面统一保持美元。使用 [官网英文页直接公布的美元价格](https://api-docs.deepseek.com/quick_start/pricing/)，不是把人民币当作美元，也不是自行换汇。
- 价格快照核对于 2026-11-11，以当前官网价格按记录时间回算 API 参考值，不声称重建历史账单。日志已有合法 costUSD 时保留该值。
- Flash 对应 deepseek-flash、官方保留的旧 Flash 别名，以及 DSH 的 deepseek-v4.1-flash / DeepSeek-V4.1-Flash-1017 拼写；V4 Pro 对应 deepseek-v4-pro / DeepSeek-V4-Pro-0813。其他模型不凭名字猜价。
- 每百万 token 的空闲美元价，按“未缓存输入／缓存读取／输出”：Flash 为 0.15 / 0.003 / 0.6，Pro 为 0.66 / 0.022 / 1.98；高峰翻倍。逐条计价后汇总，不对整日用量套用某一个时段。推理输出不重复计费，不逐请求四舍五入到美分。
- 按北京时间工作日 9:00–12:00、14:00–18:00（开始包含、结束不含）判定高峰，与页面日期分组时区无关。周末即使调休上班仍按空闲。
- 已核对的假期：[2026 年国务院通知](https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html)、[2027 年国务院通知](https://chinajob.mohrss.gov.cn/h5/c/2026-11-09/635850.shtml)。未覆盖年份的工作日潜在高峰不猜节假日；未知模型与没有公布的缓存写入价继续待定价。
- 只估算模型 token 费用，不从工具调用名称推断 Search / Fetch 独立计费次数。第三方网关也只能得到官方 API 等价参考值，不等于其账单。
- 概览、趋势、会话、模型、日／周／月汇总共享同一条目成本。导出附带本机价格快照来源和口径；外部汇总不自动重新定价或冒称由当前价表重算。

## 模块与验证边界

`lib/deepseek-pricing.ts` 集中维护价格与计费日历；`lib/dsh-usage.ts` 仍是只读日志适配器，不读取凭据、不向 DeepSeek 或网关发送请求、不修改原始会话。

回归覆盖官网价格实例、所有峰谷边界、2026/2027 节假日、周末调休、别名、未知价格、时区、单位与溢出、DSH 完整读取路径和导出来源。已先复现旧实现将应为 $0.912 的用量记为零，再验证同一测试通过。

## Review 发现与修正

### Standards

规范审查没有发现硬性违反仓库规范的问题；发现 1 项维护性建议：数据源页面重复写死价格链接与核对日期，可能与导出元数据不同步。已改为读取同一份价格快照字段。

### Spec

需求审查发现 2 项兼容性问题，均已用合成日志先复现再修正：

1. DSH 原生字段为 `cacheWriteTokens` / `reasoningTokens`，原实现只识别仪表盘字段名。现映射为缓存写入／推理输出，缺失 totalTokens 时也正确包含缓存写入；官方没有公布缓存写入计价时不再错误套用已知输入价。
2. 普通恢复和继承历史都使用 `session/end-seed`，但只有 `data.inherited: true` 才是继承边界。现只在最后一个带标记的边界清除父历史，不会在普通恢复时抹去本会话已发生的用量。

语义依据：[DSH TokenUsage](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/src/types.ts)、[Session 继承边界](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/src/types.ts)、[已发布 v3 格式](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/persistence-changes/historical-formats/v3.md)。
