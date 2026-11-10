import type { UsageTotals, UsageSnapshot } from "./usage-types";

/** A checked rate-card snapshot, not a reconstruction of historical invoices. */
export const deepseekPricingReference = {
  id: "deepseek-official-usd-2026-11-11",
  currency: "USD",
  checkedAt: "2026-11-11",
  source: "https://api-docs.deepseek.com/quick_start/pricing/",
  sourceCN: "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/",
  timezone: "Asia/Shanghai",
  calendarYears: [2026, 2027],
  basis:
    "日志明确记录的 costUSD 优先；其余按当前官网美元价格和请求时间估算 token 参考价。非历史账单，不含 Search/Fetch 独立请求费用。",
} as const;

// Published holiday breaks. Weekend make-up workdays remain off-peak under
// DeepSeek's rule: weekends are off-peak regardless of the work calendar.
// 2026: https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html
// 2027: https://chinajob.mohrss.gov.cn/h5/c/2026-11-09/635850.shtml
const holidays: Record<string, readonly (readonly [string, string])[]> = {
  "2026": [
    ["01-01", "01-03"],
    ["02-15", "02-23"],
    ["04-04", "04-06"],
    ["05-01", "05-05"],
    ["06-19", "06-21"],
    ["09-25", "09-27"],
    ["10-01", "10-07"],
  ],
  "2027": [
    ["01-01", "01-03"],
    ["02-05", "02-13"],
    ["04-03", "04-05"],
    ["05-01", "05-05"],
    ["06-09", "06-09"],
    ["09-15", "09-15"],
    ["10-01", "10-07"],
  ],
};
const aliases = new Map<string, "flash" | "pro">([
  ["deepseek-flash", "flash"],
  ["deepseek-v4-flash", "flash"],
  ["deepseek-v4-flash-vision-exp", "flash"],
  // DSH/provider spelling of the documented DeepSeek-V4.1-Flash family.
  ["deepseek-v4.1-flash", "flash"],
  ["deepseek-v4.1-flash-1017", "flash"],
  ["deepseek-v4-pro", "pro"],
  ["deepseek-v4-pro-0813", "pro"],
]);

/** Pricing always uses Beijing time, independently of the dashboard timezone. */
export function deepseekPricePeriod(at: Date): "peak" | "off-peak" | null {
  if (!Number.isFinite(at.getTime())) return null;
  const beijing = new Date(at.getTime() + 8 * 60 * 60 * 1000);
  const day = beijing.getUTCDay();
  const minutes = beijing.getUTCHours() * 60 + beijing.getUTCMinutes();
  if (
    day === 0 ||
    day === 6 ||
    !((minutes >= 540 && minutes < 720) || (minutes >= 840 && minutes < 1080))
  )
    return "off-peak";
  const date = beijing.toISOString();
  const calendar = holidays[date.slice(0, 4)];
  if (!calendar) return null; // No guessing whether an unknown-year weekday is a holiday.
  const monthDay = date.slice(5, 10);
  return calendar.some(([start, end]) => monthDay >= start && monthDay <= end)
    ? "off-peak"
    : "peak";
}

/** Official USD/token estimate; null means this rate card cannot safely price it. */
export function deepseekReferenceCostUSD(
  model: string,
  usage: Pick<
    UsageTotals,
    "inputTokens" | "cacheReadTokens" | "outputTokens" | "cacheCreationTokens"
  >,
  at: Date,
): number | null {
  const family = aliases.get(
    model
      .trim()
      .toLowerCase()
      .replace(/^deepseek\//, ""),
  );
  const period = deepseekPricePeriod(at);
  if (!family || !period || usage.cacheCreationTokens !== 0) return null;
  if (
    ![usage.inputTokens, usage.cacheReadTokens, usage.outputTokens].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    )
  )
    return null;
  // Integer nano-USD per token avoids rounding every small request to cents.
  // Equivalent off-peak USD/1M: Flash .15/.003/.6, Pro .66/.022/1.98.
  const rates =
    family === "flash"
      ? { input: 150, cache: 3, output: 600 }
      : { input: 660, cache: 22, output: 1980 };
  const nanoUSD =
    (usage.inputTokens * rates.input +
      usage.cacheReadTokens * rates.cache +
      usage.outputTokens * rates.output) *
    (period === "peak" ? 2 : 1);
  return Number.isSafeInteger(nanoUSD) ? nanoUSD / 1_000_000_000 : null;
}

export function dshPricingMetadata(
  snapshot: Pick<UsageSnapshot, "reader" | "activeDeviceIds">,
) {
  return snapshot.activeDeviceIds.includes("local") &&
    (snapshot.reader === "dsh" || snapshot.reader === "ccusage+dsh")
    ? deepseekPricingReference
    : undefined;
}
