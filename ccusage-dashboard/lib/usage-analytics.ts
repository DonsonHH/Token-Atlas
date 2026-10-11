import {
  createEmptyTotals,
  monthlyUsagePeriods,
  usageModelsFrom,
  weeklyUsagePeriods,
} from "./usage-domain";
import { aggregateModelColor, assignModelColors } from "./model-colors";
import { shiftDate, type UsageRange } from "./usage-range";
import type { UsagePeriod, UsageTotals } from "./usage-types";

export type Metric = "tokens" | "inputOutput" | "cacheRead" | "cost";
export type Grain = "daily" | "weekly" | "monthly";
export const metrics: Record<Metric, { label: string; color: string }> = {
  tokens: { label: "总 token", color: "var(--chart-1)" },
  inputOutput: { label: "输入 / 输出", color: "var(--model-4)" },
  cacheRead: { label: "缓存读取", color: "var(--model-2)" },
  cost: { label: "API 参考价", color: "var(--model-3)" },
};
export const grains: Record<Grain, string> = {
  daily: "日",
  weekly: "周",
  monthly: "月",
};

export function metricValue(totals: UsageTotals, metric: Metric): number {
  if (metric === "cost") return totals.costUSD;
  if (metric === "cacheRead") return totals.cacheReadTokens;
  if (metric === "inputOutput") return totals.inputTokens + totals.outputTokens;
  return totals.totalTokens;
}

export function calendarPeriods(
  daily: UsagePeriod[],
  range: UsageRange,
  grain: Grain,
): UsagePeriod[] {
  const lookup = new Map(daily.map((item) => [item.label, item]));
  const calendar = Array.from({ length: range.days }, (_, i) => {
    const label = shiftDate(range.start, i);
    return lookup.get(label) ?? { ...createEmptyTotals(), label, models: {} };
  });
  return grain === "weekly"
    ? weeklyUsagePeriods(calendar)
    : grain === "monthly"
      ? monthlyUsagePeriods(calendar)
      : calendar;
}

export type ModelSeries = {
  key: string;
  name: string;
  color: string;
  total: number;
  members: string[];
  residual?: boolean;
};

/** Select the main models, preserve the tail and unassigned tokens, then stack low to high. */
export function modelSeries(
  periods: UsagePeriod[],
  metric: Exclude<Metric, "cost">,
): ModelSeries[] {
  const models = usageModelsFrom(periods);
  const colors = assignModelColors(models.map((item) => item.name));
  const ranked = models
    .filter((model) => metricValue(model, metric) > 0)
    .sort(
      (a, b) =>
        metricValue(b, metric) - metricValue(a, metric) ||
        a.name.localeCompare(b.name),
    );
  const series: ModelSeries[] = ranked.slice(0, 5).map((model, index) => ({
    key: `model${index}`,
    name: model.name,
    color: colors[model.name],
    total: metricValue(model, metric),
    members: [model.name],
  }));
  if (ranked.length > 5) {
    const rest = ranked.slice(5);
    series.push({
      key: "others",
      name: `其他 ${rest.length} 个模型`,
      color: aggregateModelColor,
      total: rest.reduce((sum, model) => sum + metricValue(model, metric), 0),
      members: rest.map((model) => model.name),
    });
  }
  const residual = periods.reduce(
    (sum, period) =>
      sum +
      Math.max(
        0,
        metricValue(period, metric) -
          Object.values(period.models).reduce(
            (n, model) => n + metricValue(model, metric),
            0,
          ),
      ),
    0,
  );
  if (residual > 0)
    series.push({
      key: "unassigned",
      name: "未归类",
      color: "var(--model-unassigned)",
      total: residual,
      members: [],
      residual: true,
    });
  return series.sort(
    (a, b) => a.total - b.total || a.name.localeCompare(b.name),
  );
}

export function buildTrend(
  periods: UsagePeriod[],
  metric: Metric,
  split: boolean,
) {
  const series = split && metric !== "cost" ? modelSeries(periods, metric) : [];
  const rows = periods.map((period, index) => {
    const window = periods.slice(Math.max(0, index - 6), index + 1);
    return {
      label: period.label,
      value: metricValue(period, metric),
      average:
        window.reduce((sum, row) => sum + metricValue(row, metric), 0) /
        window.length,
      ...Object.fromEntries(
        series.map((item) => [
          item.key,
          item.residual
            ? Math.max(
                0,
                metricValue(period, metric) -
                  Object.values(period.models).reduce(
                    (sum, model) => sum + metricValue(model, metric),
                    0,
                  ),
              )
            : item.members.reduce(
                (sum, name) =>
                  sum +
                  (Object.hasOwn(period.models, name)
                    ? metricValue(period.models[name], metric)
                    : 0),
                0,
              ),
        ]),
      ),
    };
  });
  return { rows, series };
}
