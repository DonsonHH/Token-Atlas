"use client"

import { BrainCircuit, ReceiptText, Workflow } from "lucide-react"
import { useMemo } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts"

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
import { formatCost, formatDate, formatProject, formatShortDate, formatTokens } from "@/lib/format"
import type { UsageSnapshot } from "@/lib/usage"

const compositionChartConfig = {
  cacheCreation: {
    color: "var(--chart-5)",
    label: "缓存创建",
  },
  cacheRead: {
    color: "var(--chart-3)",
    label: "缓存读取",
  },
  input: {
    color: "var(--chart-1)",
    label: "输入",
  },
  output: {
    color: "var(--chart-2)",
    label: "输出",
  },
  reasoning: {
    color: "var(--chart-4)",
    label: "推理输出",
  },
} satisfies ChartConfig

const costChartConfig = {
  cost: {
    color: "var(--chart-2)",
    label: "估算费用",
  },
} satisfies ChartConfig

const sessionChartConfig = {
  tokens: {
    color: "var(--chart-1)",
    label: "总 token",
  },
} satisfies ChartConfig

type CompositionKey = keyof typeof compositionChartConfig

const compositionKeys = Object.keys(compositionChartConfig) as CompositionKey[]

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`
}

function UsageInsights({
  daily,
  sessions,
}: {
  daily: UsageSnapshot["daily"]
  sessions: UsageSnapshot["sessions"]
}) {
  const compositionData = useMemo(
    () =>
      daily.map((period) => ({
        cacheCreation: period.cacheCreationTokens,
        cacheRead: period.cacheReadTokens,
        date: period.label,
        input: period.inputTokens,
        label: formatShortDate(period.label),
        output: period.outputTokens,
        reasoning: period.reasoningOutputTokens,
      })),
    [daily]
  )

  const visibleCompositionKeys = useMemo(
    () =>
      compositionKeys.filter((key) =>
        compositionData.some((period) => period[key] > 0)
      ),
    [compositionData]
  )

  const costData = useMemo(
    () =>
      daily.map((period) => ({
        cost: Number(period.costUSD.toFixed(2)),
        date: period.label,
        label: formatShortDate(period.label),
      })),
    [daily]
  )

  const mostExpensiveDay = useMemo(
    () =>
      costData.reduce<(typeof costData)[number] | null>(
        (current, period) => (!current || period.cost > current.cost ? period : current),
        null
      ),
    [costData]
  )

  const totalCost = costData.reduce((sum, period) => sum + period.cost, 0)
  const averageDailyCost = costData.length ? totalCost / costData.length : 0

  const sessionData = useMemo(
    () =>
      sessions
        .slice()
        .sort((left, right) => right.totalTokens - left.totalTokens)
        .slice(0, 6)
        .map((session, index) => ({
          activity: formatDate(session.lastActivity),
          label: `#${index + 1}`,
          project: formatProject(session.project),
          tokens: Number((session.totalTokens / 1_000_000).toFixed(2)),
          totalTokens: session.totalTokens,
        })),
    [sessions]
  )

  const peakSession = sessionData[0] ?? null
  const totalSessionTokens = sessions.reduce(
    (sum, session) => sum + session.totalTokens,
    0
  )
  const totalSessionCacheRead = sessions.reduce(
    (sum, session) => sum + session.cacheReadTokens,
    0
  )
  const averageSessionTokens = sessions.length
    ? totalSessionTokens / sessions.length
    : 0
  const sessionCacheRate = totalSessionTokens
    ? (totalSessionCacheRead / totalSessionTokens) * 100
    : 0

  return (
    <>
      <section className="grid gap-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.85fr)]">
        <Card className="bg-background/90 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pt-5">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BrainCircuit className="size-4 text-muted-foreground" />
                Token 构成趋势
              </CardTitle>
              <CardDescription className="mt-1.5 text-sm">
                按天归一化，比较输入、输出、推理与缓存所占比例。
              </CardDescription>
            </div>
            <Badge variant="outline">组成占比</Badge>
          </CardHeader>
          <CardContent>
            {compositionData.length && visibleCompositionKeys.length ? (
              <ChartContainer className="h-[310px] w-full" config={compositionChartConfig}>
                <AreaChart
                  accessibilityLayer
                  data={compositionData}
                  margin={{ bottom: 0, left: 8, right: 12, top: 12 }}
                  stackOffset="expand"
                >
                  <defs>
                    {visibleCompositionKeys.map((key) => (
                      <linearGradient id={`fill-composition-${key}`} key={key} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor={`var(--color-${key})`} stopOpacity={0.82} />
                        <stop offset="95%" stopColor={`var(--color-${key})`} stopOpacity={0.32} />
                      </linearGradient>
                    ))}
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
                    domain={[0, 1]}
                    tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`}
                    tickLine={false}
                    width={52}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatPercent(Number(value))}
                        indicator="line"
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  {visibleCompositionKeys.map((key) => (
                    <Area
                      dataKey={key}
                      fill={`url(#fill-composition-${key})`}
                      fillOpacity={1}
                      key={key}
                      stackId="tokens"
                      stroke={`var(--color-${key})`}
                      strokeWidth={1.25}
                      type="monotone"
                    />
                  ))}
                </AreaChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[310px] items-center justify-center text-sm text-muted-foreground">
                所选范围内没有可拆分的 token 组成数据。
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-background/90 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pt-5">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ReceiptText className="size-4 text-muted-foreground" />
                每日成本轨迹
              </CardTitle>
              <CardDescription className="mt-1.5 text-sm">来自 ccusage 本地定价估算。</CardDescription>
            </div>
            <Badge variant="outline">{formatCost(totalCost)}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {costData.length ? (
              <ChartContainer className="h-[205px] w-full" config={costChartConfig}>
                <BarChart
                  accessibilityLayer
                  data={costData}
                  margin={{ bottom: 0, left: 8, right: 8, top: 8 }}
                >
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
                    tickFormatter={(value) => `$${Number(value).toFixed(0)}`}
                    tickLine={false}
                    width={52}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => formatCost(Number(value))}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                      />
                    }
                  />
                  <Bar dataKey="cost" fill="var(--color-cost)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[205px] items-center justify-center text-sm text-muted-foreground">暂无成本数据</div>
            )}
            <div className="grid grid-cols-2 gap-3 border-t pt-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">日均估算</p>
                <p className="mt-1 font-semibold tabular-nums">{formatCost(averageDailyCost)}</p>
              </div>
              <div className="min-w-0 text-right">
                <p className="text-xs text-muted-foreground">最高日</p>
                <p className="mt-1 truncate font-semibold tabular-nums" title={mostExpensiveDay?.date}>
                  {mostExpensiveDay ? `${formatShortDate(mostExpensiveDay.date)} · ${formatCost(mostExpensiveDay.cost)}` : "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="bg-background/90 shadow-sm">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pt-5">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Workflow className="size-4 text-muted-foreground" />
                会话工作负荷
              </CardTitle>
              <CardDescription className="mt-1.5 text-sm">
                按总 token 排名前六的本机会话；导入设备只保留其聚合用量。
              </CardDescription>
            </div>
            <Badge variant="outline">{sessions.length} 个会话</Badge>
          </CardHeader>
          <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
            {sessionData.length ? (
              <ChartContainer className="h-[250px] w-full" config={sessionChartConfig}>
                <BarChart
                  accessibilityLayer
                  data={sessionData}
                  layout="vertical"
                  margin={{ bottom: 0, left: 8, right: 20, top: 6 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis
                    axisLine={false}
                    tickFormatter={(value) => `${Number(value).toFixed(0)}M`}
                    tickLine={false}
                    type="number"
                  />
                  <YAxis
                    axisLine={false}
                    dataKey="label"
                    tickLine={false}
                    type="category"
                    width={38}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => `${Number(value).toFixed(2)}M token`}
                        labelFormatter={(_, payload) => {
                          const session = payload?.[0]?.payload
                          return session ? `${session.project} · ${session.activity}` : ""
                        }}
                      />
                    }
                  />
                  <Bar dataKey="tokens" fill="var(--color-tokens)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="flex h-[250px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
                当前筛选没有本机会话明细。
              </div>
            )}
            <div className="grid content-start gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">峰值会话</p>
                <p className="mt-1 truncate text-lg font-semibold tabular-nums" title={peakSession?.project}>
                  {peakSession ? formatTokens(peakSession.totalTokens) : "—"}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{peakSession?.project ?? "暂无记录"}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">平均会话</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{formatTokens(averageSessionTokens)}</p>
                <p className="mt-1 text-xs text-muted-foreground">按全部本机会话</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">会话缓存复用</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{sessionCacheRate.toFixed(1)}%</p>
                <p className="mt-1 text-xs text-muted-foreground">缓存读取 ÷ 总 token</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  )
}

export { UsageInsights }
