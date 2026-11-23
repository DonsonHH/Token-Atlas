"use client";

import { formatExactTokens } from "@/lib/format";
import type { TimingMetric } from "@/lib/performance-types";

export function TimingValue({
  metric,
  unit,
  showSamples = false,
}: {
  metric: TimingMetric | number | null | undefined;
  unit: "tok/s" | "s";
  showSamples?: boolean;
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
    <span className="whitespace-nowrap tabular-nums">
      {label.startsWith("<") ? label : "≈" + label}{" "}
      <span className="text-[0.75em] font-normal text-muted-foreground">
        {unit}
      </span>
      {showSamples && typeof metric !== "number" ? (
        <span className="block text-[11px] text-muted-foreground">
          {formatExactTokens(metric.samples)} 条样本
        </span>
      ) : null}
    </span>
  );
}
