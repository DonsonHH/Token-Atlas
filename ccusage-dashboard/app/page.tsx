"use client";

import {
  Activity,
  BarChart3,
  CalendarDays,
  Check,
  CircleAlert,
  Database,
  Download,
  Gauge,
  History,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Table2,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import type { UsageSnapshot, UsageSource, UsageTotals } from "@/lib/usage";

const chartConfig = {
  tokens: {
    color: "var(--chart-1)",
    label: "Token",
  },
} satisfies ChartConfig;

const emptyTotals: UsageTotals = {
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  costUSD: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
};

const emptyPeriods: UsageSnapshot["daily"] = [];
const emptySessions: UsageSnapshot["sessions"] = [];
const emptyModels: UsageSnapshot["models"] = [];

const navigation = [
  { icon: LayoutDashboard, label: "概览", value: "overview" },
  { icon: BarChart3, label: "用量趋势", value: "usage" },
  { icon: History, label: "会话记录", value: "sessions" },
  { icon: Table2, label: "原始数据", value: "raw" },
] as const;

function formatTokens(value: number, digits = 1) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(digits)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(digits)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(digits)}K`;
  return value.toLocaleString("zh-CN");
}

function formatCost(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return "暂无活动记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function formatShortDate(value: string) {
  const pieces = value.split("-");
  return pieces.length === 3 ? `${Number(pieces[1])}/${Number(pieces[2])}` : value;
}

function formatProject(value: string | null) {
  if (!value) return "未归类";
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? value;
}

function StatCard({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: typeof Activity;
  label: string;
  tone: "blue" | "emerald" | "orange" | "violet";
  value: string;
}) {
  const toneClasses = {
    blue: {
      card: "border-blue-500/15 from-blue-500/12 via-blue-500/[0.035] to-transparent",
      icon: "border-blue-500/15 bg-blue-500/10 text-blue-700 dark:text-blue-300",
    },
    emerald: {
      card: "border-emerald-500/15 from-emerald-500/12 via-emerald-500/[0.035] to-transparent",
      icon: "border-emerald-500/15 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    orange: {
      card: "border-orange-500/15 from-orange-500/12 via-orange-500/[0.035] to-transparent",
      icon: "border-orange-500/15 bg-orange-500/10 text-orange-700 dark:text-orange-300",
    },
    violet: {
      card: "border-violet-500/15 from-violet-500/12 via-violet-500/[0.035] to-transparent",
      icon: "border-violet-500/15 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    },
  }[tone];

  return (
    <Card className={`relative overflow-hidden border bg-gradient-to-br shadow-sm ${toneClasses.card}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardDescription className="text-sm font-semibold tracking-tight text-foreground/75">
          {label}
        </CardDescription>
        <div className={`flex size-10 items-center justify-center rounded-xl border ${toneClasses.icon}`}>
          <Icon className="size-4.5" strokeWidth={1.9} />
        </div>
      </CardHeader>
      <CardContent className="pb-5">
        <div className="text-3xl font-semibold tracking-[-0.04em] tabular-nums">{value}</div>
        <p className="mt-1.5 text-sm text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton className="h-36 rounded-2xl" key={index} />
        ))}
      </div>
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Skeleton className="h-[27rem] rounded-2xl" />
        <Skeleton className="h-[27rem] rounded-2xl" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-full border bg-muted/50 text-muted-foreground">
          <CircleAlert className="size-5" />
        </div>
        <h2 className="text-base font-semibold">没有可展示的本地数据</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const [days, setDays] = useState("14");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<UsageSnapshot | null>(null);
  const [source, setSource] = useState<UsageSource>("codex");
  const [tab, setTab] = useState("overview");

  const requestUsage = useCallback(async () => {
    const response = await fetch(`/api/usage?source=${source}&days=${days}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as UsageSnapshot & { error?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? "读取数据失败。");
    }

    return payload;
  }, [days, source]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitialUsage() {
      try {
        const payload = await requestUsage();
        if (!cancelled) {
          setSnapshot(payload);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setSnapshot(null);
          setError(loadError instanceof Error ? loadError.message : "读取数据失败。");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitialUsage();
    return () => {
      cancelled = true;
    };
  }, [requestUsage]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await requestUsage();
      setSnapshot(payload);
      setError(null);
    } catch (loadError) {
      setSnapshot(null);
      setError(loadError instanceof Error ? loadError.message : "读取数据失败。");
    } finally {
      setLoading(false);
    }
  }, [requestUsage]);

  const totals = snapshot?.totals ?? emptyTotals;
  const daily = snapshot?.daily ?? emptyPeriods;
  const weekly = snapshot?.weekly ?? emptyPeriods;
  const monthly = snapshot?.monthly ?? emptyPeriods;
  const sessions = snapshot?.sessions ?? emptySessions;
  const models = snapshot?.models ?? emptyModels;
  const devices = snapshot?.devices ?? [];
  const importedDevices = devices.filter((device) => device.kind === "imported");

  const chartData = useMemo(
    () =>
      daily.map((item) => ({
        date: item.label,
        label: formatShortDate(item.label),
        tokens: Number((item.totalTokens / 1_000_000).toFixed(2)),
      })),
    [daily]
  );

  const cacheHitRate =
    totals.totalTokens > 0
      ? ((totals.cacheReadTokens / totals.totalTokens) * 100).toFixed(1)
      : "0.0";
  const latestDay = daily.at(-1);
  const recentSessions = sessions.slice(0, 10);

  function downloadRawData() {
    if (!snapshot) return;

    const blob = new Blob([JSON.stringify(snapshot.raw, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ccusage-${source}-${snapshot.generatedAt.slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function selectTab(value: string) {
    setTab(value);
    setMenuOpen(false);
  }

  return (
    <main className="min-h-svh bg-[radial-gradient(circle_at_70%_-10%,color-mix(in_oklab,var(--chart-1)_12%,transparent),transparent_32rem)] bg-muted/25 text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r bg-background/95 lg:flex">
        <div className="flex h-[72px] items-center gap-3 border-b px-6">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Gauge className="size-5" />
          </div>
          <div>
            <p className="text-base font-semibold tracking-tight">Usage Console</p>
            <p className="text-xs text-muted-foreground">本地 token 分析</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1.5 px-4 py-6" aria-label="仪表盘导航">
          {navigation.map(({ icon: Icon, label, value }) => (
            <Button
              className="h-11 w-full justify-start gap-3 rounded-xl px-3 text-sm"
              key={value}
              onClick={() => selectTab(value)}
              variant={tab === value ? "secondary" : "ghost"}
            >
              <Icon className="size-[18px]" />
              {label}
            </Button>
          ))}
        </nav>
        <div className="m-4 rounded-2xl border bg-gradient-to-br from-muted/60 to-transparent p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Database className="size-3.5 text-muted-foreground" />
            本地读取模式
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            日志只在本机由 ccusage 解析，不会上传对话内容。
          </p>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b bg-background/95 px-5 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-8">
          <Button
            aria-label="打开导航"
            className="lg:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            size="icon"
            variant="ghost"
          >
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold sm:text-lg">ccusage 使用分析</h1>
          </div>
          <Badge className="hidden gap-1.5 sm:flex" variant="secondary">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            本地实时数据
          </Badge>
          {importedDevices.length ? (
            <Badge className="hidden gap-1.5 md:flex" variant="outline">
              <Database className="size-3" />
              已汇总 {devices.length} 台设备
            </Badge>
          ) : null}
          <Button className="h-9 gap-2 px-3" onClick={() => void loadData()} size="sm" variant="outline">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">刷新</span>
          </Button>
        </header>

        {menuOpen ? (
          <nav className="border-b bg-background p-3 lg:hidden" aria-label="移动端仪表盘导航">
            <div className="grid grid-cols-2 gap-2">
              {navigation.map(({ icon: Icon, label, value }) => (
                <Button
                  className="justify-start gap-2"
                  key={value}
                  onClick={() => selectTab(value)}
                  variant={tab === value ? "secondary" : "ghost"}
                >
                  <Icon className="size-4" />
                  {label}
                </Button>
              ))}
            </div>
          </nav>
        ) : null}

        <div className="mx-auto max-w-[1800px] px-5 py-8 sm:px-8 lg:px-10 xl:py-10">
          <div className="mb-8 flex flex-col gap-5 rounded-2xl border bg-background/75 px-5 py-5 shadow-sm backdrop-blur-sm xl:flex-row xl:items-end xl:justify-between xl:px-6">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge className="gap-1.5" variant="outline">
                  <Check className="size-3" />
                  {snapshot?.mode === "live" ? "LIVE" : "等待连接"}
                </Badge>
                <Badge variant="secondary">{snapshot?.reader ?? "ccusage"}</Badge>
                <Badge variant="secondary">{snapshot?.offline ? "--offline" : "本地模式"}</Badge>
                {importedDevices.length ? (
                  <Badge className="gap-1" variant="secondary">
                    <Database className="size-3" />
                    +{importedDevices.length} 台外部设备
                  </Badge>
                ) : null}
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.04em]">用量概览</h2>
              <p className="mt-1.5 text-base text-muted-foreground">
                直接汇总本机 Codex 会话日志；金额为 ccusage 的本地估算值。
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select
                onValueChange={(value) => value && setSource(value as UsageSource)}
                value={source}
              >
                <SelectTrigger className="h-10 w-full bg-background sm:w-40">
                  <span>{source === "codex" ? "仅 Codex" : "全部来源"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="codex">仅 Codex</SelectItem>
                  <SelectItem value="all">全部来源</SelectItem>
                </SelectContent>
              </Select>
              <Select onValueChange={(value) => value && setDays(value)} value={days}>
                <SelectTrigger className="h-10 w-full bg-background sm:w-40">
                  <span>最近 {days} 天</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">最近 7 天</SelectItem>
                  <SelectItem value="14">最近 14 天</SelectItem>
                  <SelectItem value="30">最近 30 天</SelectItem>
                  <SelectItem value="90">最近 90 天</SelectItem>
                </SelectContent>
              </Select>
              <Button className="h-10 gap-2 px-4" disabled={!snapshot} onClick={downloadRawData} variant="outline">
                <Download className="size-4" />
                导出 JSON
              </Button>
            </div>
          </div>

          {loading ? <DashboardSkeleton /> : null}
          {!loading && error ? <EmptyState message={error} /> : null}

          {!loading && snapshot ? (
            <Tabs className="space-y-8" onValueChange={setTab} value={tab}>
              <TabsContent className="space-y-8" value="overview">
                <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    detail={`最近 ${days} 天 · ${daily.length} 个活跃日${devices.length > 1 ? ` · ${devices.length} 台设备` : ""}`}
                    icon={Activity}
                    label="总 token"
                    tone="blue"
                    value={formatTokens(totals.totalTokens)}
                  />
                  <StatCard
                    detail={`${formatTokens(totals.inputTokens)} 输入 · ${formatTokens(totals.outputTokens)} 输出`}
                    icon={Zap}
                    label="输入与输出"
                    tone="violet"
                    value={formatTokens(totals.inputTokens + totals.outputTokens)}
                  />
                  <StatCard
                    detail={`${cacheHitRate}% 占总用量`}
                    icon={Database}
                    label="缓存读取"
                    tone="orange"
                    value={formatTokens(totals.cacheReadTokens)}
                  />
                  <StatCard
                    detail="仅供本地成本参考"
                    icon={Gauge}
                    label="估算费用"
                    tone="emerald"
                    value={formatCost(totals.costUSD)}
                  />
                </section>

                <section className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_25rem]">
                  <Card className="border-blue-500/10 bg-background/90 shadow-sm">
                    <CardHeader className="pt-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg">每日 token 趋势</CardTitle>
                          <CardDescription className="mt-1.5 text-sm">最近 {days} 天的真实日志汇总</CardDescription>
                        </div>
                        <Badge variant="outline">单位：百万 token</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {chartData.length ? (
                        <ChartContainer className="h-[350px] w-full" config={chartConfig}>
                          <AreaChart accessibilityLayer data={chartData} margin={{ left: -18, right: 8, top: 8 }}>
                            <defs>
                              <linearGradient id="fillTokens" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="5%" stopColor="var(--color-tokens)" stopOpacity={0.3} />
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
                              tickFormatter={(value) => `${value}M`}
                              tickLine={false}
                              width={48}
                            />
                            <ChartTooltip
                              content={
                                <ChartTooltipContent
                                  formatter={(value) => `${Number(value).toFixed(2)}M token`}
                                  labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                                />
                              }
                            />
                            <Area
                              dataKey="tokens"
                              fill="url(#fillTokens)"
                              fillOpacity={1}
                              stroke="var(--color-tokens)"
                              strokeWidth={2}
                              type="monotone"
                            />
                          </AreaChart>
                        </ChartContainer>
                      ) : (
                        <div className="flex h-[350px] items-center justify-center text-sm text-muted-foreground">
                          所选范围内没有日志记录。
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-background/90 shadow-sm">
                    <CardHeader className="pt-5">
                      <CardTitle className="text-lg">模型分布</CardTitle>
                      <CardDescription className="mt-1.5 text-sm">按 token 总量排序</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {models.length ? (
                        models.slice(0, 5).map((model) => {
                          const share = totals.totalTokens
                            ? (model.totalTokens / totals.totalTokens) * 100
                            : 0;
                          return (
                            <div className="space-y-2" key={model.name}>
                              <div className="flex items-center justify-between gap-3 text-sm">
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{model.name}</p>
                                  <p className="text-xs text-muted-foreground">{formatTokens(model.totalTokens)}</p>
                                </div>
                                <span className="text-xs font-medium tabular-nums text-muted-foreground">
                                  {share.toFixed(1)}%
                                </span>
                              </div>
                              <div className="h-2 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full rounded-full bg-primary transition-[width]"
                                  style={{ width: `${Math.max(share, 1)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <p className="text-sm text-muted-foreground">没有模型聚合数据。</p>
                      )}
                    </CardContent>
                  </Card>
                </section>

                <section className="grid gap-7 xl:grid-cols-2">
                  <Card className="bg-background/90 shadow-sm">
                    <CardHeader className="pt-5">
                      <CardTitle className="text-lg">数据来源</CardTitle>
                      <CardDescription className="mt-1.5 text-sm">每次刷新均重新运行本地 ccusage。</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">读取器</span>
                        <Badge variant="secondary">{snapshot.reader} CLI</Badge>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">数据源</span>
                        <span className="font-medium">{snapshot.source === "codex" ? "Codex" : "全部已识别来源"}</span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">读取方式</span>
                        <span className="font-mono text-xs">--offline</span>
                      </div>
                      <Separator />
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">日志目录</span>
                        <span className="max-w-52 truncate font-mono text-xs" title={snapshot.dataPath}>
                          {snapshot.dataPath}
                        </span>
                      </div>
                      {devices.length > 1 ? (
                        <>
                          <Separator />
                          <div className="space-y-2">
                            <span className="text-muted-foreground">已汇总设备</span>
                            <div className="flex flex-wrap gap-2">
                              {devices.map((device) => (
                                <Badge key={device.id} variant={device.kind === "local" ? "secondary" : "outline"}>
                                  {device.kind === "local" ? "本机" : "导入"} · {device.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : null}
                    </CardContent>
                  </Card>

                  <Card className="bg-background/90 shadow-sm">
                    <CardHeader className="pt-5">
                      <CardTitle className="text-lg">当前数据状态</CardTitle>
                      <CardDescription className="mt-1.5 text-sm">没有以示例数据代替读取失败的数据。</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      <div className="flex items-center gap-3 rounded-lg border bg-emerald-500/5 p-3 text-emerald-800 dark:text-emerald-300">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                          <Check className="size-4" />
                        </div>
                        <div>
                          <p className="font-medium">真实本地日志已加载</p>
                          <p className="mt-0.5 text-xs opacity-80">
                            最近刷新：{formatDate(snapshot.generatedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>最近一日用量</span>
                        <span className="font-medium text-foreground">
                          {latestDay ? formatTokens(latestDay.totalTokens) : "—"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>已解析会话</span>
                        <span className="font-medium text-foreground">{sessions.length.toLocaleString("zh-CN")}</span>
                      </div>
                    </CardContent>
                  </Card>
                </section>
              </TabsContent>

              <TabsContent className="space-y-6" value="usage">
                <section className="grid gap-6 xl:grid-cols-2">
                  <PeriodTable periods={daily} subtitle="每日用量" title="按日汇总" />
                  <PeriodTable
                    periods={weekly}
                    subtitle={
                      snapshot.weeklyMethod === "daily-derived"
                        ? "由 ccusage 每日 JSON 按周归并"
                        : "ccusage 每周用量"
                    }
                    title="按周汇总"
                  />
                </section>
                <PeriodTable periods={monthly} subtitle="每月用量" title="按月汇总" />
              </TabsContent>

              <TabsContent value="sessions">
                <Card className="shadow-none">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle>会话记录</CardTitle>
                      <CardDescription className="mt-1">按最后活动时间倒序，展示最近 10 条本机真实记录；外部设备仅导入汇总用量。</CardDescription>
                    </div>
                    <Badge variant="outline">{sessions.length} 条</Badge>
                  </CardHeader>
                  <CardContent>
                    <SessionTable sessions={recentSessions} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="raw">
                <Card className="shadow-none">
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div>
                      <CardTitle>原始 ccusage JSON</CardTitle>
                      <CardDescription className="mt-1">展示接口使用的真实结构；可导出完整 JSON 文件。</CardDescription>
                    </div>
                    <Button className="gap-2" onClick={downloadRawData} size="sm" variant="outline">
                      <Download className="size-4" /> 导出
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-[38rem] overflow-auto rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-5 text-muted-foreground">
                      {JSON.stringify(snapshot.raw, null, 2)}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function PeriodTable({
  periods,
  subtitle,
  title,
}: {
  periods: UsageSnapshot["daily"];
  subtitle: string;
  title: string;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-1">{subtitle}，来自 ccusage JSON 报告。</CardDescription>
        </div>
        <CalendarDays className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="max-h-[27rem] overflow-auto rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead>周期</TableHead>
                <TableHead className="text-right">总 token</TableHead>
                <TableHead className="text-right">缓存</TableHead>
                <TableHead className="text-right">费用</TableHead>
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
      </CardContent>
    </Card>
  );
}

function SessionTable({ sessions }: { sessions: UsageSnapshot["sessions"] }) {
  return (
    <div className="overflow-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>最后活动</TableHead>
            <TableHead>模型</TableHead>
            <TableHead>项目</TableHead>
            <TableHead className="text-right">总 token</TableHead>
            <TableHead className="text-right">费用</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.length ? (
            sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="whitespace-nowrap text-sm">{formatDate(session.lastActivity)}</TableCell>
                <TableCell>
                  <div className="max-w-44 truncate text-sm" title={session.models.join(", ")}>
                    {session.models.join(", ") || "—"}
                  </div>
                </TableCell>
                <TableCell className="max-w-36 truncate text-sm text-muted-foreground" title={session.project ?? ""}>
                  {formatProject(session.project)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">
                  {formatTokens(session.totalTokens)}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {formatCost(session.costUSD)}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="h-24 text-center text-muted-foreground" colSpan={5}>
                没有可用会话记录。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
