"use client";

import { useId, useMemo, useState } from "react";
import {
  Area,
  Bar,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  formatCost,
  formatExactTokens,
  formatShortDate,
  formatTokens,
} from "@/lib/format";
import { buildTrend, metrics, type Metric } from "@/lib/usage-analytics";
import type { UsagePeriod } from "@/lib/usage-types";
import { cn } from "@/lib/utils";

export function TrendChart({
  periods,
  metric = "tokens",
  split = false,
  average = false,
  compact = false,
}: {
  periods: UsagePeriod[];
  metric?: Metric;
  split?: boolean;
  average?: boolean;
  compact?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [focus, setFocus] = useState<string | null>(null);
  const { rows, series } = useMemo(
    () => buildTrend(periods, metric, split),
    [periods, metric, split],
  );
  const config: ChartConfig = {
    value: metrics[metric],
    average: { label: "7 日均值", color: "var(--muted-foreground)" },
    ...Object.fromEntries(
      series.map((item) => [item.key, { label: item.name, color: item.color }]),
    ),
  };
  const activeName = series.some((item) => item.name === focus) ? focus : null;
  const singlePeriod = rows.length === 1;
  return (
    <div>
      <ChartContainer
        config={config}
        className={cn(
          "aspect-auto h-[330px] w-full sm:h-[370px]",
          compact && "h-[250px] sm:h-[285px]",
        )}
      >
        <ComposedChart
          accessibilityLayer
          data={rows}
          margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
        >
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={metrics[metric].color}
                stopOpacity={0.28}
              />
              <stop
                offset="100%"
                stopColor={metrics[metric].color}
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            vertical={false}
            strokeDasharray="3 5"
            stroke="var(--border)"
          />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tickMargin={12}
            minTickGap={36}
            tickFormatter={formatShortDate}
            height={36}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            width={64}
            tickMargin={8}
            tickFormatter={(value) =>
              metric === "cost"
                ? `$${formatTokens(Number(value))}`
                : formatTokens(Number(value), 0)
            }
          />
          <ChartTooltip
            cursor={{
              stroke: "var(--muted-foreground)",
              strokeDasharray: "4 4",
            }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="min-w-48 max-w-[min(320px,85vw)] rounded-xl border bg-popover p-3 text-xs shadow-xl">
                  <p className="mb-2 font-medium">{label}</p>
                  <div className="space-y-2">
                    {payload.map((item) => (
                      <div
                        key={String(item.dataKey)}
                        className="flex items-center justify-between gap-4"
                      >
                        <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                          <i
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: item.color }}
                          />
                          <span className="truncate">
                            {config[String(item.dataKey)]?.label}
                          </span>
                        </span>
                        <span className="shrink-0 font-medium tabular-nums">
                          {metric === "cost"
                            ? formatCost(Number(item.value))
                            : formatExactTokens(Number(item.value))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            }
          />
          {series.length ? (
            series.map((item) =>
              singlePeriod ? (
                <Bar
                  key={item.key}
                  dataKey={item.key}
                  name={item.name}
                  stackId="models"
                  maxBarSize={72}
                  fill={item.color}
                  fillOpacity={
                    activeName && activeName !== item.name ? 0.2 : 0.8
                  }
                  isAnimationActive={false}
                />
              ) : (
                <Area
                  key={item.key}
                  dataKey={item.key}
                  name={item.name}
                  type="monotone"
                  stackId="models"
                  isAnimationActive={false}
                  fill={item.color}
                  fillOpacity={
                    activeName && activeName !== item.name ? 0.06 : 0.26
                  }
                  stroke={item.color}
                  strokeWidth={activeName === item.name ? 2.8 : 1.8}
                  strokeOpacity={
                    activeName && activeName !== item.name ? 0.25 : 1
                  }
                />
              ),
            )
          ) : singlePeriod ? (
            <Bar
              dataKey="value"
              fill={metrics[metric].color}
              fillOpacity={0.8}
              radius={[6, 6, 0, 0]}
              maxBarSize={72}
              isAnimationActive={false}
            />
          ) : (
            <Area
              dataKey="value"
              type="monotone"
              isAnimationActive={false}
              fill={`url(#${id})`}
              stroke={metrics[metric].color}
              strokeWidth={2.3}
            />
          )}
          {!series.length && average && !singlePeriod ? (
            <Area
              dataKey="average"
              type="monotone"
              isAnimationActive={false}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeWidth={1.4}
              strokeDasharray="4 5"
            />
          ) : null}
        </ComposedChart>
      </ChartContainer>
      {series.length ? (
        <div
          className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
          aria-label="模型图例"
        >
          {series.map((item) => (
            <button
              type="button"
              key={item.key}
              aria-pressed={activeName === item.name}
              onClick={() =>
                setFocus(activeName === item.name ? null : item.name)
              }
              className={cn(
                "flex min-h-8 max-w-full items-center gap-2 rounded-md px-2 text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                activeName === item.name && "bg-muted text-foreground",
              )}
            >
              <i
                className="size-2 shrink-0 rounded-full"
                style={{ background: item.color }}
              />
              <span className="truncate">{item.name}</span>
            </button>
          ))}
        </div>
      ) : average && !singlePeriod ? (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          虚线 · 7 日均值
        </p>
      ) : null}
    </div>
  );
}
