export type UsageRange = {
  start: string;
  end: string;
  days: number;
  timezone: string;
  allTime?: boolean;
};

export function dateKey(date: Date, timezone?: string): string {
  if (timezone) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function validDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function resolveUsageRange(
  options: {
    days?: number | "all";
    start?: string;
    end?: string;
    timezone?: string;
  },
  now = new Date(),
): UsageRange {
  const timezone =
    options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  let today: string;
  try {
    today = dateKey(now, timezone);
  } catch {
    throw new Error("时区无效。");
  }
  const requestedDays = options.days ?? 14;
  if (requestedDays === "all") {
    if (options.start || options.end)
      throw new Error("全部日期不能同时指定起止日期。");
    // The reader omits --since. The actual bounds are resolved from records.
    return { start: today, end: today, days: 1, timezone, allTime: true };
  }
  if (
    !Number.isInteger(requestedDays) ||
    requestedDays < 1 ||
    requestedDays > 366
  ) {
    throw new Error("请选择 1–366 天的范围。");
  }
  const end = options.end ?? today;
  if (!validDateKey(end)) throw new Error("日期无效。");
  const start = options.start ?? shiftDate(end, 1 - requestedDays);
  if (!validDateKey(start) || !validDateKey(end)) throw new Error("日期无效。");
  if (start > end) throw new Error("开始日期不能晚于结束日期。");
  if (end > today) throw new Error("结束日期不能晚于今天。");
  const days =
    Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  if (days > 366)
    throw new Error("单次最多查看 366 天；可以选择更早的历史日期。");
  return { start, end, days, timezone };
}

/** All-history bounds come from selected records, never an arbitrary lookback. */
export function recordedUsageRange(
  range: UsageRange,
  labels: string[],
): UsageRange {
  if (!range.allTime) return range;
  const dates = labels
    .filter((label) => validDateKey(label) && label <= range.end)
    .sort();
  const start = dates[0] ?? range.end;
  const end = dates.at(-1) ?? range.end;
  const days =
    Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  return { ...range, start, end, days };
}
