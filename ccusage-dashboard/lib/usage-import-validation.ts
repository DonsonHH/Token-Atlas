import { usagePeriodsFrom } from "./usage-domain";
import { usageSourceOptions, type UsageSource } from "./usage-types";
import { validDateKey } from "./usage-range";

export const importLimit = 5 * 1024 * 1024;
const numericFields = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheCreationTokens",
  "reasoningOutputTokens",
  "totalTokens",
  "costUSD",
  "totalCost",
  "cost",
];

function validateNumbers(record: Record<string, unknown>, label: string) {
  for (const field of numericFields) {
    const value = record[field];
    if (value === undefined) continue;
    const number = Number(value);
    if (
      (typeof value !== "number" && typeof value !== "string") ||
      String(value).trim() === "" ||
      !Number.isFinite(number) ||
      number < 0 ||
      (field.endsWith("Tokens") && !Number.isSafeInteger(number))
    ) {
      throw new Error(`${label} 的 ${field} 无效。`);
    }
  }
}

export function validateUsageImport(
  value: unknown,
  name: string,
  source: UsageSource,
) {
  if (!name.trim() || name.length > 100)
    throw new Error("设备名称需为 1–100 个字符。");
  if (!usageSourceOptions.some((item) => item.value === source))
    throw new Error("Agent 来源无效。");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("请粘贴 ccusage 的 JSON 对象。");
  const record = value as Record<string, unknown>;
  if (
    Array.isArray(record.activeDeviceIds) &&
    record.activeDeviceIds.length > 1
  )
    throw new Error(
      "这是多设备合并报表。请导入单台设备的 ccusage 报告，以免重复计数。",
    );
  if (
    !Array.isArray(record.daily) ||
    !record.daily.length ||
    record.daily.length > 10_000
  )
    throw new Error("JSON 需要包含 1–10000 条 daily 记录。");
  const dates = new Set<string>();
  const canonicalRows: Record<string, unknown>[] = [];
  for (const row of record.daily) {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new Error("daily 记录格式无效。");
    const date = row.date ?? row.period ?? row.label;
    if (typeof date !== "string" || !validDateKey(date))
      throw new Error("daily 中包含无效日期。");
    if (dates.has(date))
      throw new Error(`日期 ${date} 重复，请使用单台设备的 daily 报告。`);
    dates.add(date);
    if (!numericFields.some((field) => row[field] !== undefined))
      throw new Error(`${date} 缺少用量字段。`);
    validateNumbers(row, date);
    const models = [
      ...(Array.isArray(row.modelBreakdowns) ? row.modelBreakdowns : []),
      ...(Array.isArray(row.models)
        ? row.models
        : row.models && typeof row.models === "object"
          ? Object.values(row.models)
          : []),
    ];
    for (const model of models) {
      if (!model || typeof model !== "object" || Array.isArray(model))
        throw new Error(`${date} 的模型明细无效。`);
      validateNumbers(model as Record<string, unknown>, date);
    }
    // The parser must use the same date validated above, even when a report
    // also includes unrelated week/month labels.
    canonicalRows.push({ ...row, date });
  }
  const daily = usagePeriodsFrom(
    { daily: canonicalRows, totals: record.totals },
    "daily",
  );
  for (const day of daily) {
    const modelTotal = Object.values(day.models).reduce(
      (sum, model) => sum + model.totalTokens,
      0,
    );
    if (modelTotal > day.totalTokens)
      throw new Error(`${day.label} 的模型用量超过当日总量，请检查报告口径。`);
  }
  const reportedTime = record.exportedAt ?? record.generatedAt;
  const exportedAt =
    typeof reportedTime === "string" &&
    Number.isFinite(Date.parse(reportedTime))
      ? reportedTime
      : null;
  // Persist only usage fields. Never store conversation content from a pasted payload.
  return {
    deviceName: name.trim(),
    source,
    exportedAt,
    ...(typeof record.readerVersion === "string" &&
    /^\d+\.\d+\.\d+$/.test(record.readerVersion)
      ? { readerVersion: record.readerVersion }
      : {}),
    daily: daily.map((row) => ({ ...row, date: row.label })),
  };
}

export function validDeviceId(id: string) {
  return (
    /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) && id !== "local" && id !== "all"
  );
}
