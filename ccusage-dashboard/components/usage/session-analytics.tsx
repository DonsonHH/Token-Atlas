"use client"

import { BarChart3, Clock3, FolderKanban } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"

import { DashboardPanel } from "@/components/dashboard-panel"
import { Badge } from "@/components/ui/badge"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatProject, formatTokenMillions } from "@/lib/format"
import { getCategoricalColor } from "@/lib/model-colors"
import type { UsageSnapshot } from "@/lib/usage"

const projectChartConfig = {
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

const sizeChartConfig = {
  sessions: {
    color: "var(--chart-2)",
    label: "会话数",
  },
} satisfies ChartConfig

type ProjectSummary = {
  sessions: number
  source: string
  totalTokens: number
}

function formatSource(project: string) {
  const normalized = project.replace(/\\/g, "/")
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(normalized)) {
    return `${normalized.slice(5)} 日志`
  }
  return formatProject(project)
}

function SessionAnalytics({ sessions }: { sessions: UsageSnapshot["sessions"] }) {
  const [compactChart, setCompactChart] = useState(false)

  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)")
    const updateCompactChart = () => setCompactChart(query.matches)
    updateCompactChart()
    query.addEventListener("change", updateCompactChart)
    return () => query.removeEventListener("change", updateCompactChart)
  }, [])

  const projectData = useMemo(() => {
    const projects = new Map<string, ProjectSummary>()

    for (const session of sessions) {
      if (!session.project) continue
      const existing = projects.get(session.project)
      projects.set(session.project, {
        sessions: (existing?.sessions ?? 0) + 1,
        source: existing?.source ?? formatSource(session.project),
        totalTokens: (existing?.totalTokens ?? 0) + session.totalTokens,
      })
    }

    return [...projects.values()]
      .sort((left, right) => right.totalTokens - left.totalTokens)
      .slice(0, 5)
      .map((project) => ({
        ...project,
        tokens: Number((project.totalTokens / 1_000_000).toFixed(2)),
      }))
  }, [sessions])

  const hasProjectBreakdown = projectData.length >= 2
  const projectSessions = sessions.filter((session) => Boolean(session.project)).length

  const sessionSizeData = useMemo(() => {
    const buckets = [
      { label: "< 1M", sessions: 0 },
      { label: "1–10M", sessions: 0 },
      { label: "10–50M", sessions: 0 },
      { label: "50M+", sessions: 0 },
    ]

    for (const session of sessions) {
      const millions = session.totalTokens / 1_000_000
      const index = millions < 1 ? 0 : millions < 10 ? 1 : millions < 50 ? 2 : 3
      buckets[index].sessions += 1
    }

    return buckets
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
  const mostUsedModel = useMemo(() => {
    const modelCounts = new Map<string, number>()
    for (const session of sessions) {
      for (const model of session.models) {
        modelCounts.set(model, (modelCounts.get(model) ?? 0) + 1)
      }
    }
    return [...modelCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? null
  }, [sessions])
  const largestProject = projectData[0] ?? null
  const projectAxisWidth = compactChart ? 76 : 116

  return (
    <section className="grid gap-6 2xl:grid-cols-2">
      <DashboardPanel
        action={
          hasProjectBreakdown ? (
            <Badge variant="outline">{projectData.length} 个项目</Badge>
          ) : (
            <Badge variant="outline">{sessions.length} 个会话</Badge>
          )
        }
        description={
          hasProjectBreakdown
            ? "按已记录的项目聚合；只展示可比较的项目归属。"
            : "项目字段不足以做可信的对比，改用会话规模分布展示真实负载。"
        }
        icon={hasProjectBreakdown ? <FolderKanban className="size-4" /> : <BarChart3 className="size-4" />}
        title={hasProjectBreakdown ? "哪些项目消耗最多？" : "会话规模如何分布？"}
        tone="blue"
      >
        {hasProjectBreakdown ? (
          <div className="rounded-xl bg-muted/[0.16] px-1 pt-2">
            <ChartContainer className="h-[250px] w-full" config={projectChartConfig}>
              <BarChart
                accessibilityLayer
                data={projectData}
                layout="vertical"
                margin={{ bottom: 0, left: 8, right: 18, top: 6 }}
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <XAxis
                  axisLine={false}
                  tickFormatter={(value) => formatTokenMillions(Number(value))}
                  tickLine={false}
                  type="number"
                />
                <YAxis
                  axisLine={false}
                  dataKey="source"
                  tickLine={false}
                  tickFormatter={(value) =>
                    String(value).length > (compactChart ? 8 : 12)
                      ? `${String(value).slice(0, compactChart ? 8 : 12)}…`
                      : value
                  }
                  type="category"
                  width={projectAxisWidth}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => `${Number(value).toFixed(2)}M token`}
                      labelFormatter={(_, payload) => {
                        const project = payload?.[0]?.payload
                        return project ? `${project.source} · ${project.sessions} 个会话` : ""
                      }}
                    />
                  }
                />
                <Bar dataKey="tokens" radius={[0, 6, 6, 0]}>
                  {projectData.map((project, index) => (
                    <Cell fill={getCategoricalColor(index)} key={project.source} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        ) : (
          <div className="rounded-xl bg-muted/[0.16] px-1 pt-2">
            <ChartContainer className="h-[250px] w-full" config={sizeChartConfig}>
              <BarChart
                accessibilityLayer
                data={sessionSizeData}
                margin={{ bottom: 0, left: 8, right: 12, top: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis axisLine={false} dataKey="label" tickLine={false} tickMargin={10} />
                <YAxis axisLine={false} allowDecimals={false} tickLine={false} width={42} />
                <ChartTooltip
                  content={<ChartTooltipContent formatter={(value) => `${Number(value)} 个会话`} />}
                />
                <Bar dataKey="sessions" fill="var(--color-sessions)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </div>
        )}
        <dl className="mt-5 grid grid-cols-2 gap-4 border-t pt-5 text-sm sm:[&>div+div]:border-l sm:[&>div+div]:pl-4">
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">
              {hasProjectBreakdown ? "项目覆盖会话" : "已记录项目的会话"}
            </dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {projectSessions.toLocaleString("zh-CN")} / {sessions.length.toLocaleString("zh-CN")}
            </dd>
          </div>
          <div className="min-w-0 text-right">
            <dt className="text-xs text-muted-foreground">
              {hasProjectBreakdown ? "最大项目" : "最大会话规模"}
            </dt>
            <dd className="mt-1 truncate font-semibold" title={largestProject?.source}>
              {hasProjectBreakdown
                ? largestProject?.source ?? "—"
                : sessionSizeData.at(-1)?.sessions
                  ? `${sessionSizeData.at(-1)?.sessions} 个 50M+`
                  : "—"}
            </dd>
          </div>
        </dl>
      </DashboardPanel>

      <DashboardPanel
        action={<Badge variant="outline">峰值 {busiestHour.hour}:00</Badge>}
        description="按会话最后写入的本机时间分布，不代表会话持续时长或工作效率。"
        icon={<Clock3 className="size-4" />}
        title="最后活跃时间分布"
        tone="violet"
      >
        <div className="rounded-xl bg-muted/[0.16] px-1 pt-2">
          <ChartContainer className="h-[250px] w-full" config={activityChartConfig}>
            <BarChart
              accessibilityLayer
              data={activityData}
              margin={{ bottom: 0, left: 8, right: 12, top: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                axisLine={false}
                dataKey="label"
                interval={2}
                tickLine={false}
                tickMargin={8}
                tickFormatter={(value) => {
                  const hour = Number(value)
                  return hour % 6 === 0 ? `${hour}时` : ""
                }}
              />
              <YAxis axisLine={false} allowDecimals={false} tickLine={false} width={42} />
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
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-3 border-t pt-5 text-sm sm:grid-cols-3 sm:[&>div+div]:border-l sm:[&>div+div]:pl-3">
          <div>
            <dt className="text-xs text-muted-foreground">活跃峰值</dt>
            <dd className="mt-1 font-semibold tabular-nums">{busiestHour.sessions} 条</dd>
          </div>
          <div className="min-w-0 text-center">
            <dt className="text-xs text-muted-foreground">出现最多的模型</dt>
            <dd className="mt-1 truncate font-semibold" title={mostUsedModel?.[0]}>
              {mostUsedModel?.[0] ?? "—"}
            </dd>
          </div>
          <div className="text-right">
            <dt className="text-xs text-muted-foreground">推理输出占比</dt>
            <dd className="mt-1 font-semibold tabular-nums">{reasoningShare.toFixed(1)}%</dd>
          </div>
        </dl>
      </DashboardPanel>
    </section>
  )
}

export { SessionAnalytics }
