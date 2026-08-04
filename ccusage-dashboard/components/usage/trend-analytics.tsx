"use client"

import { Activity, TrendingUp } from "lucide-react"
import { useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { formatCost, formatShortDate, formatTokens } from "@/lib/format"
import type { UsageSnapshot } from "@/lib/usage"

const trendChartConfig = {
  movingAverage: {
    color: "var(--chart-4)",
    label: "移动均值",
  },
  tokens: {
    color: "var(--chart-1)",
    label: "总 token",
  },
} satisfies ChartConfig

const cacheChartConfig = {
  cacheRate: {
    color: "var(--chart-2)",
    label: "缓存复用率",
  },
} satisfies ChartConfig

type Granularity = "daily" | "monthly" | "weekly"

const granularityLabel: Record<Granularity, string> = {
  daily: "每日",
  monthly: "每月",
  weekly: "每周",
}

function formatPeriodLabel(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatShortDate(value)
  if (/^\d{4}-\d{2}$/.test(value)) return value.slice(2).replace("-", "/")
  return value
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
  const periods = { daily, monthly, weekly }[granularity]
  const averageWindow = granularity === "daily" ? 7 : 4

  const trendData = useMemo(
    () =>
      periods.map((period, index) => {
        const start = Math.max(0, index - averageWindow + 1)
        const window = periods.slice(start, index + 1)
        const movingAverage =
          window.reduce((sum, item) => sum + item.totalTokens, 0) /
          Math.max(window.length, 1)

        return {
          cacheRate: period.totalTokens
            ? (period.cacheReadTokens / period.totalTokens) * 100
            : 0,
          cost: period.costUSD,
          date: period.label,
          label: formatPeriodLabel(period.label),
          movingAverage: Number((movingAverage / 1_000_000).toFixed(2)),
          tokens: Number((period.totalTokens / 1_000_000).toFixed(2)),
          totalTokens: period.totalTokens,
        }
      }),
    [averageWindow, periods]
  )

  const peakPeriod = useMemo(
    () =>
      trendData.reduce<(typeof trendData)[number] | null>(
        (current, period) =>
          !current || period.totalTokens > current.totalTokens ? period : current,
        null
      ),
    [trendData]
  )

  const averageTokens = trendData.length
    ? trendData.reduce((sum, period) => sum + period.totalTokens, 0) /
      trendData.length
    : 0
  const averageCacheRate = trendData.length
    ? trendData.reduce((sum, period) => sum + period.cacheRate, 0) /
      trendData.length
    : 0
  const totalCost = trendData.reduce((sum, period) => sum + period.cost, 0)

  return (
    <section className="grid gap-7 2xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.85fr)]">
      <Card className="bg-background/90 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 pt-5">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="size-4 text-muted-foreground" />
              用量节奏
            </CardTitle>
            <CardDescription className="mt-1.5 text-sm">
              在不同时间粒度下比较实际用量与移动均值。
            </CardDescription>
          </div>
          <Tabs
            className="contents"
            onValueChange={(value) => {
              if (value === "daily" || value === "weekly" || value === "monthly") {
                setGranularity(value)
              }
            }}
            value={granularity}
          >
            <TabsList className="h-9 border bg-muted/50 p-1">
              {(Object.keys(granularityLabel) as Granularity[]).map((value) => (
                <TabsTrigger className="px-2.5 text-xs" key={value} value={value}>
                  {granularityLabel[value]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {trendData.length ? (
            <ChartContainer className="h-[330px] w-full" config={trendChartConfig}>
              <AreaChart accessibilityLayer data={trendData} margin={{ bottom: 0, left: -18, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="fill-trend-tokens" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-tokens)" stopOpacity={0.36} />
                    <stop offset="95%" stopColor="var(--color-tokens)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  minTickGap={28}
                  tickLine={false}
                  tickMargin={10}
                />
                <YAxis
                  axisLine={false}
                  tickFormatter={(value) => `${Number(value).toFixed(0)}M`}
                  tickLine={false}
                  width={48}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => `${Number(value).toFixed(2)}M token`}
                      indicator="line"
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  dataKey="tokens"
                  fill="url(#fill-trend-tokens)"
                  fillOpacity={1}
                  stroke="var(--color-tokens)"
                  strokeWidth={2}
                  type="monotone"
                />
                <Area
                  dataKey="movingAverage"
                  fill="transparent"
                  stroke="var(--color-movingAverage)"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  type="monotone"
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <div className="flex h-[330px] items-center justify-center text-sm text-muted-foreground">
              当前筛选没有趋势数据。
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-background/90 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pt-5">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="size-4 text-muted-foreground" />
              缓存复用走势
            </CardTitle>
            <CardDescription className="mt-1.5 text-sm">缓存读取占总 token 的比例。</CardDescription>
          </div>
          <Badge variant="outline">平均 {averageCacheRate.toFixed(1)}%</Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          {trendData.length ? (
            <ChartContainer className="h-[205px] w-full" config={cacheChartConfig}>
              <AreaChart accessibilityLayer data={trendData} margin={{ bottom: 0, left: -10, right: 0, top: 8 }}>
                <defs>
                  <linearGradient id="fill-cache-rate" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-cacheRate)" stopOpacity={0.34} />
                    <stop offset="95%" stopColor="var(--color-cacheRate)" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="label"
                  minTickGap={22}
                  tickLine={false}
                  tickMargin={8}
                />
                <YAxis
                  axisLine={false}
                  domain={[0, 100]}
                  tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
                  tickLine={false}
                  width={42}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => `${Number(value).toFixed(1)}%`}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                    />
                  }
                />
                <Area
                  dataKey="cacheRate"
                  fill="url(#fill-cache-rate)"
                  fillOpacity={1}
                  stroke="var(--color-cacheRate)"
                  strokeWidth={2}
                  type="monotone"
                />
              </AreaChart>
            </ChartContainer>
          ) : null}
          <div className="grid grid-cols-2 gap-3 border-t pt-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{granularityLabel[granularity]}均值</p>
              <p className="mt-1 font-semibold tabular-nums">{formatTokens(averageTokens)}</p>
            </div>
            <div className="min-w-0 text-right">
              <p className="text-xs text-muted-foreground">区间估算费用</p>
              <p className="mt-1 truncate font-semibold tabular-nums" title={peakPeriod?.date}>
                {formatCost(totalCost)}
              </p>
            </div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">峰值{granularityLabel[granularity]}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {peakPeriod ? formatTokens(peakPeriod.totalTokens) : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{peakPeriod?.date ?? "暂无记录"}</p>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

export { TrendAnalytics }
