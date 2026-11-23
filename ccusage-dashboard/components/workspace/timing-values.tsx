"use client";

import { formatExactTokens } from "@/lib/format";
import type { TimingMetric } from "@/lib/performance-types";

export function TimingValue({
  metric,
  unit,
}: {
  metric: TimingMetric | number | null | undefined;
  unit: "tok/s" | "s";
}) {
  if (metric == null)
    return (
      <span className="text-muted-foreground" title="没有可靠的计时">
        —
      </span>
    );
  const value = typeof metric === "number" ? metric : metric.value;
  const label =
    unit === "s"
      ? value < 100
        ? "<0.1"
        : (value / 1000).toFixed(1)
      : value < 10
        ? value.toFixed(1)
        : String(Math.round(value));
  return (
    <span
      className="whitespace-nowrap tabular-nums"
      title={
        typeof metric === "number"
          ? "日志估算"
          : `日志估算 · ${formatExactTokens(metric.samples)} 条样本`
      }
    >
      {label.startsWith("<") ? label : "≈" + label}{" "}
      <span className="text-[0.75em] font-normal text-muted-foreground">
        {unit}
      </span>
    </span>
  );
}
