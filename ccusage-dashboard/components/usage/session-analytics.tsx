"use client"

import { Clock3, FolderKanban } from "lucide-react"
import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

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
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatProject, formatTokens } from "@/lib/format"
import type { UsageSnapshot } from "@/lib/usage"

const sourceChartConfig = {
  tokens: {
    color: "var(--chart-1)",
    label: "总 token",
  },
} satisfies ChartConfig

const activityChartConfig = {
  sessions: {
    color: "var(--chart-4)",
    label: "会话数",
  },
} satisfies ChartConfig

type SourceSummary = {
  cost: number
  source: string
  totalTokens: number
  sessions: number
}

function formatSource(project: string | null) {
  if (!project) return "未归类"
  const normalized = project.replace(/\\/g, "/")
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(normalized)) {
    return `${normalized.slice(5)} 日志`
  }
  return formatProject(project)
}

function SessionAnalytics({ sessions }: { sessions: UsageSnapshot["sessions"] }) {
  const sourceData = useMemo(() => {
    const sources = new Map<string, SourceSummary>()

    for (const session of sessions) {
      const key = session.project ?? "unassigned"
      const existing = sources.get(key)
      sources.set(key, {
        cost: (existing?.cost ?? 0) + session.costUSD,
        sessions: (existing?.sessions ?? 0) + 1,
        source: existing?.source ?? formatSource(session.project),
        totalTokens: (existing?.totalTokens ?? 0) + session.totalTokens,
      })
    }

    return [...sources.values()]
      .sort((left, right) => right.totalTokens - left.totalTokens)
      .slice(0, 6)
      .map((source) => ({
        ...source,
        tokens: Number((source.totalTokens / 1_000_000).toFixed(2)),
      }))
  }, [sessions])

  const activityData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: `${hour}`,
      sessions: 0,
    }))

    for (const session of sessions) {
      if (!session.lastActivity) continue
      const date = new Date(session.lastActivity)
      if (Number.isNaN(date.getTime())) continue
      hours[date.getHours()].sessions += 1
    }

    return hours
  }, [sessions])

  const topSource = sourceData[0] ?? null
  const busiestHour = activityData.reduce(
    (current, hour) => (hour.sessions > current.sessions ? hour : current),
    activityData[0] ?? { hour: 0, label: "0", sessions: 0 }
  )
  const totalTokens = sessions.reduce((sum, session) => sum + session.totalTokens, 0)
  const reasoningTokens = sessions.reduce(
    (sum, session) => sum + session.reasoningOutputTokens,
    0
  )
  const reasoningShare = totalTokens ? (reasoningTokens / totalTokens) * 100 : 0
  const modelsBySession = useMemo(() => {
    const modelCounts = new Map<string, number>()
    for (const session of sessions) {
      for (const model of session.models) {
        modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1)
      }
    }
    return [...modelCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? null
  }, [sessions])

  return (
    <section className="grid gap-7 2xl:grid-cols-2">
      <Card className="bg-background/90 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pt-5">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FolderKanban className="size-4 text-muted-foreground" />
              会话来源负荷
            </CardTitle>
            <CardDescription className="mt-1.5 text-sm">按 ccusage 提供的目录或项目字段聚合。</CardDescription>
          </div>
          <Badge variant="outline">{sourceData.length} 个来源</Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          {sourceData.length ? (
            <ChartContainer className="h-[250px] w-full" config={sourceChartConfig}>
              <BarChart
                accessibilityLayer
                data={sourceData}
                layout="vertical"
                margin={{ bottom: 0, left: -16, right: 20, top: 2 }}
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
                  dataKey="source"
                  tickLine={false}
                  type="category"
                  tickFormatter={(value) =>
                    String(value).length > 12 ? `${String(value).slice(0, 12)}…` : value
                  }
                  width={112}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => `${Number(value).toFixed(2)}M token`}
                      labelFormatter={(_, payload) => {
                        const source = payload?.[0]?.payload
                        return source
                          ? `${source.source} · ${source.sessions} 个会话`
                          : ""
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
          <div className="grid grid-cols-2 gap-3 border-t pt-4 text-sm">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">最重来源</p>
              <p className="mt-1 truncate font-semibold" title={topSource?.source}>{topSource?.source ?? "—"}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">来源总量</p>
              <p className="mt-1 font-semibold tabular-nums">{topSource ? formatTokens(topSource.totalTokens) : "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-background/90 shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4 pt-5">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Clock3 className="size-4 text-muted-foreground" />
              会话活跃时段
            </CardTitle>
            <CardDescription className="mt-1.5 text-sm">按本机时区汇总最后活动时间。</CardDescription>
          </div>
          <Badge variant="outline">峰值 {busiestHour.hour}:00</Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          <ChartContainer className="h-[250px] w-full" config={activityChartConfig}>
            <BarChart accessibilityLayer data={activityData} margin={{ bottom: 0, left: -12, right: 0, top: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="label"
                interval={2}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis axisLine={false} allowDecimals={false} tickLine={false} width={32} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => `${Number(value)} 个会话`}
                    labelFormatter={(label) => `${label}:00`}
                  />
                }
              />
              <Bar dataKey="sessions" fill="var(--color-sessions)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
          <div className="grid grid-cols-3 gap-3 border-t pt-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">活跃峰值</p>
              <p className="mt-1 font-semibold tabular-nums">{busiestHour.sessions} 次</p>
            </div>
            <div className="min-w-0 text-center">
              <p className="text-xs text-muted-foreground">常用模型</p>
              <p className="mt-1 truncate font-semibold" title={modelsBySession?.[0]}>{modelsBySession?.[0] ?? "—"}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">推理输出占比</p>
              <p className="mt-1 font-semibold tabular-nums">{reasoningShare.toFixed(1)}%</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

export { SessionAnalytics }
