"use client"

import { BarChart3, CalendarDays, TrendingUp } from "lucide-react"
import { type ReactNode, useMemo, useState } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { DashboardPanel } from "@/components/dashboard-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatCost, formatShortDate, formatTokenMillions, formatTokens } from "@/lib/format"
import { getModelColor } from "@/lib/model-colors"
import type { UsageSnapshot } from "@/lib/usage"

type Granularity = "daily" | "monthly" | "weekly"
type TrendGrouping = "models" | "total"
type TrendMetric = "cacheRead" | "cost" | "inputOutput" | "tokens"

const trendChartConfig = {
  cacheRead: {
    color: "var(--chart-2)",
    label: "缓存读取",
  },
  cost: {
    color: "var(--chart-5)",
    label: "API 参考价",
  },
  inputOutput: {
    color: "var(--chart-4)",
    label: "请求 token",
  },
  movingAverage: {
    color: "var(--chart-3)",
    label: "7 日均值",
  },
  tokens: {
    color: "var(--chart-1)",
    label: "总 token",
  },
} satisfies ChartConfig

const weekdayChartConfig = {
  tokens: {
    color: "var(--chart-1)",
    label: "总 token",
  },
} satisfies ChartConfig

const granularityLabel: Record<Granularity, string> = {
  daily: "每日",
  monthly: "每月",
  weekly: "每周",
}

const weekdayLabels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

function formatPeriodLabel(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatShortDate(value)
  if (/^\d{4}-\d{2}$/.test(value)) return value.slice(2).replace("-", "/")
  return value
}

function rawMetricValue(
  period: UsageSnapshot["daily"][number],
  metric: TrendMetric
) {
  if (metric === "cacheRead") return period.cacheReadTokens
  if (metric === "cost") return period.costUSD
  if (metric === "inputOutput") return period.inputTokens + period.outputTokens
  return period.totalTokens
}

function chartMetricValue(value: number, metric: TrendMetric) {
  return metric === "cost"
    ? Number(value.toFixed(2))
    : Number((value / 1_000_000).toFixed(2))
}

function SegmentedControl<T extends string>({
  ariaLabel,
  disabled,
  onValueChange,
  options,
  value,
}: {
  ariaLabel: string
  disabled?: Partial<Record<T, boolean>>
  onValueChange: (value: T) => void
  options: ReadonlyArray<{ label: string; value: T }>
  value: T
}) {
  return (
    <div aria-label={ariaLabel} className="inline-flex max-w-full items-center rounded-lg border bg-muted/35 p-1" role="group">
      {options.map((option) => (
        <Button
          aria-pressed={value === option.value}
          className="h-7 px-2.5 text-xs"
          disabled={disabled?.[option.value]}
          key={option.value}
          onClick={() => onValueChange(option.value)}
          size="sm"
          variant={value === option.value ? "secondary" : "ghost"}
        >
          {option.label}
        </Button>
      ))}
    </div>
  )
}

function ControlGroup({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function TrendAnalytics({
  daily,
  monthly,
  weekly,
}: {
  daily: UsageSnapshot["daily"]
  monthly: UsageSnapshot["monthly"]
  weekly: UsageSnapshot["weekly"]
}) {
  const [granularity, setGranularity] = useState<Granularity>("daily")
  const [metric, setMetric] = useState<TrendMetric>("tokens")
  const [trendGrouping, setTrendGrouping] = useState<TrendGrouping>("total")
  const periods = { daily, monthly, weekly }[granularity]
  const averageWindow = granularity === "daily" ? 7 : 0
  const showMovingAverage = averageWindow > 0 && trendGrouping === "total" && metric !== "cost"

  const trendData = useMemo(
    () =>
      periods.map((period, index) => {
        const start = averageWindow ? Math.max(0, index - averageWindow + 1) : index
        const window = periods.slice(start, index + 1)
        const movingAverage = window.length
          ? window.reduce((sum, item) => sum + item.totalTokens, 0) / window.length
          : 0

        return {
          cacheRead: chartMetricValue(period.cacheReadTokens, "cacheRead"),
          cacheRate: period.totalTokens
            ? (period.cacheReadTokens / period.totalTokens) * 100
            : 0,
          cost: chartMetricValue(period.costUSD, "cost"),
          date: period.label,
          inputOutput: chartMetricValue(period.inputTokens + period.outputTokens, "inputOutput"),
          label: formatPeriodLabel(period.label),
          movingAverage: chartMetricValue(movingAverage, "tokens"),
          tokens: chartMetricValue(period.totalTokens, "tokens"),
        }
      }),
    [averageWindow, periods]
  )

  const modelNames = useMemo(() => {
    const totals = new Map<string, number>()
    for (const period of periods) {
      for (const [name, totalsForModel] of Object.entries(period.models)) {
        totals.set(name, (totals.get(name) ?? 0) + totalsForModel.totalTokens)
      }
    }

    // Select the five largest series, then render from smallest to largest.
    // Recharts stacks areas in declaration order, so this keeps low-volume
    // models as the foundation instead of burying them below the dominant one.
    return [...totals.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
      .map(([name]) => name)
  }, [periods])

  const modelTrendConfig = useMemo(
    () =>
      Object.fromEntries(
        modelNames.map((name, index) => [
          `model${index}`,
          { color: getModelColor(name), label: name },
        ])
      ) satisfies ChartConfig,
    [modelNames]
  )

  const modelTrendData = useMemo(
    () =>
      periods.map((period) => ({
        date: period.label,
        label: formatPeriodLabel(period.label),
        ...Object.fromEntries(
          modelNames.map((name, index) => [
            `model${index}`,
            Number(((period.models[name]?.totalTokens ?? 0) / 1_000_000).toFixed(2)),
          ])
        ),
      })),
    [modelNames, periods]
  )

  const rawValues = useMemo(
    () => periods.map((period) => rawMetricValue(period, metric)),
    [metric, periods]
  )
  const peakIndex = rawValues.reduce(
    (current, value, index) => (value > (rawValues[current] ?? 0) ? index : current),
    0
  )
  const peakPeriod = periods[peakIndex]
  const averageMetric = rawValues.length
    ? rawValues.reduce((sum, value) => sum + value, 0) / rawValues.length
    : 0
  const totalCost = periods.reduce((sum, period) => sum + period.costUSD, 0)
  const totalInputOutput = periods.reduce(
    (sum, period) => sum + period.inputTokens + period.outputTokens,
    0
  )
  const activePeriods = periods.filter((period) => period.totalTokens > 0).length
  const averageCacheRate = periods.length
    ? periods.reduce(
        (sum, period) =>
          sum + (period.totalTokens ? (period.cacheReadTokens / period.totalTokens) * 100 : 0),
        0
      ) / periods.length
    : 0
  const rankedModelTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const period of periods) {
      for (const [name, model] of Object.entries(period.models)) {
        totals.set(name, (totals.get(name) ?? 0) + model.totalTokens)
      }
    }
    return [...totals.entries()].sort((left, right) => right[1] - left[1])
  }, [periods])
  const topModel = rankedModelTotals[0] ?? null
  const modelsTotal = rankedModelTotals.reduce((sum, [, value]) => sum + value, 0)
  const topModelShare = modelsTotal && topModel ? (topModel[1] / modelsTotal) * 100 : 0
  const topTwoModelShare = modelsTotal
    ? (rankedModelTotals.slice(0, 2).reduce((sum, [, value]) => sum + value, 0) / modelsTotal) * 100
    : 0

  const weekdayData = useMemo(() => {
    const buckets = weekdayLabels.map((label) => ({
      activeDays: 0,
      label,
      totalTokens: 0,
    }))

    for (const period of daily) {
      const date = new Date(`${period.label}T12:00:00`)
      if (Number.isNaN(date.getTime())) continue
      const weekdayIndex = (date.getDay() + 6) % 7
      buckets[weekdayIndex].activeDays += 1
      buckets[weekdayIndex].totalTokens += period.totalTokens
    }

    return buckets.map((bucket) => ({
      ...bucket,
      tokens: Number((bucket.totalTokens / 1_000_000).toFixed(2)),
    }))
  }, [daily])
  const weekdayPeak = weekdayData.reduce<(typeof weekdayData)[number] | null>(
    (current, weekday) =>
      !current || weekday.totalTokens > current.totalTokens ? weekday : current,
    null
  )
  const weekdayTotal = weekdayData.reduce((sum, weekday) => sum + weekday.totalTokens, 0)
  const weekendShare = weekdayData.reduce(
    (sum, weekday, index) => sum + (index >= 5 ? weekday.totalTokens : 0),
    0
  )

  function changeMetric(nextMetric: TrendMetric) {
    setMetric(nextMetric)
    if (nextMetric !== "tokens") setTrendGrouping("total")
  }

  const trendSummary = (() => {
    if (trendGrouping === "models") {
      return [
        {
          detail: topModel ? formatTokens(topModel[1]) : "暂无记录",
          label: "主力模型",
          value: topModel?.[0] ?? "—",
        },
        {
          detail: "主力模型占总 token",
          label: "主力占比",
          value: `${topModelShare.toFixed(1)}%`,
        },
        {
          detail: "前两名模型合计",
          label: "Top 2 集中度",
          value: `${topTwoModelShare.toFixed(1)}%`,
        },
        {
          detail: "当前筛选范围",
          label: "已识别模型",
          value: `${rankedModelTotals.length} 个`,
        },
      ]
    }

    if (metric === "cost") {
      return [
        {
          detail: "本地 ccusage 定价估算",
          label: "区间参考价",
          value: formatCost(totalCost),
        },
        {
          detail: peakPeriod?.label ?? "暂无记录",
          label: "单周期峰值",
          value: peakPeriod ? formatCost(rawMetricValue(peakPeriod, metric)) : "—",
        },
        {
          detail: `${granularityLabel[granularity]}口径`,
          label: "单周期均价",
          value: formatCost(averageMetric),
        },
        {
          detail: "有用量的周期数",
          label: "活跃周期",
          value: `${activePeriods} 个`,
        },
      ]
    }

    if (metric === "cacheRead") {
      return [
        {
          detail: "当前筛选范围",
          label: "缓存读取合计",
          value: formatTokens(rawValues.reduce((sum, value) => sum + value, 0)),
        },
        {
          detail: peakPeriod?.label ?? "暂无记录",
          label: "单周期峰值",
          value: peakPeriod ? formatTokens(rawMetricValue(peakPeriod, metric)) : "—",
        },
        {
          detail: "各周期的算术平均",
          label: "平均复用占比",
          value: `${averageCacheRate.toFixed(1)}%`,
        },
        {
          detail: "有用量的周期数",
          label: "活跃周期",
          value: `${activePeriods} 个`,
        },
      ]
    }

    if (metric === "inputOutput") {
      const outputTokens = periods.reduce((sum, period) => sum + period.outputTokens, 0)
      return [
        {
          detail: "输入与输出的合计",
          label: "请求 token 合计",
          value: formatTokens(totalInputOutput),
        },
        {
          detail: peakPeriod?.label ?? "暂无记录",
          label: "单周期峰值",
          value: peakPeriod ? formatTokens(rawMetricValue(peakPeriod, metric)) : "—",
        },
        {
          detail: "输出 ÷ 请求 token",
          label: "输出占比",
          value: totalInputOutput ? `${((outputTokens / totalInputOutput) * 100).toFixed(1)}%` : "—",
        },
        {
          detail: `${granularityLabel[granularity]}口径`,
          label: "单周期均值",
          value: formatTokens(averageMetric),
        },
      ]
    }

    return [
      {
        detail: peakPeriod?.label ?? "暂无记录",
        label: "总 token 峰值",
        value: peakPeriod ? formatTokens(rawMetricValue(peakPeriod, metric)) : "—",
      },
      {
        detail: `${granularityLabel[granularity]}口径`,
        label: "单周期均值",
        value: formatTokens(averageMetric),
      },
      {
        detail: "缓存读取 ÷ 总 token",
        label: "缓存复用占比",
        value: `${averageCacheRate.toFixed(1)}%`,
      },
      {
        detail: "本地 ccusage 定价估算",
        label: "区间 API 参考价",
        value: formatCost(totalCost),
      },
    ]
  })()

  return (
    <div className="space-y-6">
      <DashboardPanel
        action={<Badge variant="outline">{periods.length} 个周期</Badge>}
        description="选择一个指标，再决定按总量或模型拆分。按模型时展示总量前五模型，并从低用量到高用量逐层绘制。"
        icon={<TrendingUp className="size-4" />}
        title="用量趋势"
        tone="blue"
      >
        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3 border-b pb-5">
          <ControlGroup label="粒度">
            <SegmentedControl
              ariaLabel="统计粒度"
              onValueChange={setGranularity}
              options={[
                { label: "每日", value: "daily" },
                { label: "每周", value: "weekly" },
                { label: "每月", value: "monthly" },
              ]}
              value={granularity}
            />
          </ControlGroup>
          <ControlGroup label="指标">
            <SegmentedControl
              ariaLabel="统计指标"
              onValueChange={changeMetric}
              options={[
                { label: "总 token", value: "tokens" },
                { label: "请求", value: "inputOutput" },
                { label: "缓存", value: "cacheRead" },
                { label: "参考价", value: "cost" },
              ]}
              value={metric}
            />
          </ControlGroup>
          {metric === "tokens" ? (
            <ControlGroup label="拆分">
              <SegmentedControl
                ariaLabel="趋势分组方式"
                disabled={{ models: !modelNames.length }}
                onValueChange={setTrendGrouping}
                options={[
                  { label: "总量", value: "total" },
                  { label: "按模型", value: "models" },
                ]}
                value={trendGrouping}
              />
            </ControlGroup>
          ) : null}
        </div>

        {trendData.length && trendGrouping === "total" ? (
          <div className="rounded-xl bg-muted/[0.16] px-1 pt-2">
            <ChartContainer className="h-[340px] w-full" config={trendChartConfig}>
              <AreaChart
                accessibilityLayer
                data={trendData}
                margin={{ bottom: 0, left: 10, right: 14, top: 12 }}
              >
                <defs>
                  <linearGradient id="fill-trend-metric" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor={`var(--color-${metric})`} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={`var(--color-${metric})`} stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis axisLine={false} dataKey="label" minTickGap={28} tickLine={false} tickMargin={10} />
                <YAxis
                  axisLine={false}
                  tickFormatter={(value) =>
                    metric === "cost" ? `$${Number(value).toFixed(0)}` : formatTokenMillions(Number(value))
                  }
                  tickLine={false}
                  width={62}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        metric === "cost"
                          ? formatCost(Number(value))
                          : `${Number(value).toFixed(2)}M token`
                      }
                      indicator="line"
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                    />
                  }
                />
                <Area
                  dataKey={metric}
                  fill="url(#fill-trend-metric)"
                  fillOpacity={1}
                  stroke={`var(--color-${metric})`}
                  strokeWidth={2}
                  type="monotone"
                />
                {showMovingAverage ? (
                  <Area
                    dataKey="movingAverage"
                    fill="transparent"
                    stroke="var(--color-movingAverage)"
                    strokeDasharray="5 5"
                    strokeWidth={1.75}
                    type="monotone"
                  />
                ) : null}
                {showMovingAverage ? <ChartLegend content={<ChartLegendContent />} /> : null}
              </AreaChart>
            </ChartContainer>
          </div>
        ) : trendGrouping === "models" && modelNames.length ? (
          <div className="rounded-xl bg-muted/[0.16] px-1 pt-2">
            <ChartContainer className="h-[340px] w-full" config={modelTrendConfig}>
              <AreaChart
                accessibilityLayer
                data={modelTrendData}
                margin={{ bottom: 0, left: 10, right: 14, top: 12 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis axisLine={false} dataKey="label" minTickGap={28} tickLine={false} tickMargin={10} />
                <YAxis axisLine={false} tickFormatter={(value) => formatTokenMillions(Number(value))} tickLine={false} width={62} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => `${Number(value).toFixed(2)}M token`}
                      indicator="dot"
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-3 gap-y-1 text-xs" />} />
                {modelNames.map((_, index) => (
                  <Area
                    dataKey={`model${index}`}
                    fill={`var(--color-model${index})`}
                    fillOpacity={0.26}
                    key={index}
                    stackId="models"
                    stroke={`var(--color-model${index})`}
                    strokeWidth={2.25}
                    type="monotone"
                  />
                ))}
              </AreaChart>
            </ChartContainer>
          </div>
        ) : (
          <div className="flex h-[340px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
            当前范围没有可绘制的趋势数据。
          </div>
        )}

        <dl className="mt-5 grid gap-3 border-t pt-5 sm:grid-cols-2 sm:[&>div+div]:border-l sm:[&>div+div]:pl-4 lg:grid-cols-4">
          {trendSummary.map((item) => (
            <div className="min-w-0" key={item.label}>
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 truncate font-semibold tabular-nums" title={item.value}>{item.value}</dd>
              <p className="mt-1 truncate text-xs text-muted-foreground" title={item.detail}>{item.detail}</p>
            </div>
          ))}
        </dl>
      </DashboardPanel>

      {daily.length >= 14 ? (
        <DashboardPanel
          action={<Badge variant="outline">{daily.length} 个活跃日</Badge>}
          description="按星期归并所有活动日，用来识别稳定的高负荷日，而不是推断工作效率。"
          icon={<BarChart3 className="size-4" />}
          title="一周中的使用分布"
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="rounded-xl bg-muted/[0.16] px-1 pt-2">
              <ChartContainer className="h-[220px] w-full" config={weekdayChartConfig}>
                <BarChart
                  accessibilityLayer
                  data={weekdayData}
                  margin={{ bottom: 0, left: 10, right: 14, top: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis axisLine={false} dataKey="label" tickLine={false} tickMargin={10} />
                  <YAxis
                    axisLine={false}
                    tickFormatter={(value) => formatTokenMillions(Number(value))}
                    tickLine={false}
                    width={62}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => `${Number(value).toFixed(2)}M token`}
                        labelFormatter={(_, payload) => {
                          const weekday = payload?.[0]?.payload
                          return weekday ? `${weekday.label} · ${weekday.activeDays} 个活跃日` : ""
                        }}
                      />
                    }
                  />
                  <Bar dataKey="tokens" fill="var(--color-tokens)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>
            <dl className="grid grid-cols-2 gap-4 border-t pt-4 text-sm lg:grid-cols-1 lg:border-t-0 lg:border-l lg:pl-6 lg:pt-0">
              <div>
                <dt className="text-xs text-muted-foreground">最高负荷日</dt>
                <dd className="mt-1 font-semibold">{weekdayPeak?.label ?? "—"}</dd>
                <p className="mt-1 text-xs text-muted-foreground">
                  {weekdayPeak ? formatTokens(weekdayPeak.totalTokens) : "暂无记录"}
                </p>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">周末占比</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {weekdayTotal ? `${((weekendShare / weekdayTotal) * 100).toFixed(1)}%` : "—"}
                </dd>
                <p className="mt-1 text-xs text-muted-foreground">周六与周日的合计</p>
              </div>
            </dl>
          </div>
        </DashboardPanel>
      ) : null}

      <DashboardPanel
        action={<Badge variant="outline">{periods.length} 条</Badge>}
        description={`${granularityLabel[granularity]}口径与上方图表保持一致，可用于核对具体周期。`}
        icon={<CalendarDays className="size-4" />}
        title={`${granularityLabel[granularity]}明细`}
      >
        <div className="max-h-[28rem] overflow-auto rounded-xl border bg-background">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>周期</TableHead>
                <TableHead className="text-right">总 token</TableHead>
                <TableHead className="text-right">缓存读取</TableHead>
                <TableHead className="text-right">API 参考价</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.length ? (
                periods
                  .slice()
                  .reverse()
                  .map((period) => (
                    <TableRow key={period.label}>
                      <TableCell className="font-medium">{period.label}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {formatTokens(period.totalTokens)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {formatTokens(period.cacheReadTokens)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {formatCost(period.costUSD)}
                      </TableCell>
                    </TableRow>
                  ))
              ) : (
                <TableRow>
                  <TableCell className="h-24 text-center text-muted-foreground" colSpan={4}>
                    没有可用记录。
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DashboardPanel>
    </div>
  )
}

export { TrendAnalytics }
