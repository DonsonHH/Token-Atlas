"use client";

import {
  Activity,
  ArrowDownToLine,
  BarChart3,
  Check,
  CircleAlert,
  CircleDollarSign,
  CircleHelp,
  Database,
  Download,
  FileJson,
  History,
  LayoutDashboard,
  Layers3,
  Menu,
  RefreshCw,
  Search,
  Server,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { BrandMark } from "@/components/brand-mark";
import { DashboardPanel } from "@/components/dashboard-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SessionAnalytics } from "@/components/usage/session-analytics";
import { ModelDistribution } from "@/components/usage/model-distribution";
import { ScopeToolbar } from "@/components/usage/scope-toolbar";
import { TrendAnalytics } from "@/components/usage/trend-analytics";
import { useUsageSnapshot } from "@/hooks/use-usage-snapshot";
import { downloadJsonFile } from "@/lib/download";
import {
  formatCost,
  formatDate,
  formatExactTokens,
  formatProject,
  formatShortDate,
  formatTokenMillions,
  formatTokens,
} from "@/lib/format";
import {
  buildUsageViewExport,
  usageExportFileName,
} from "@/lib/usage-export";
import type {
  UsageDeviceFilter,
  UsageSnapshot,
  UsageSource,
  UsageTotals,
} from "@/lib/usage";
import { usageSourceLabel } from "@/lib/usage-types";

const chartConfig = {
  cacheRead: {
    color: "var(--chart-3)",
    label: "缓存读取",
  },
  inputOutput: {
    color: "var(--chart-2)",
    label: "请求 token",
  },
  tokens: {
    color: "var(--chart-1)",
    label: "总 token",
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

type DateRangeMode = "7" | "14" | "30" | "90" | "custom";
type Page = "overview" | "sessions" | "usage";
type SessionSort = "activity" | "cost" | "tokens";

const navigation: ReadonlyArray<{
  icon: typeof LayoutDashboard;
  label: string;
  value: Page;
}> = [
  { icon: LayoutDashboard, label: "概览", value: "overview" },
  { icon: BarChart3, label: "趋势", value: "usage" },
  { icon: History, label: "会话", value: "sessions" },
];

const pageCopy: Record<Page, { description: string; title: string }> = {
  overview: {
    description: "回答当前使用规模、主要模型与数据范围。",
    title: "用量概览",
  },
  sessions: {
    description: "通过本机会话明细了解使用来自哪里、何时最后活跃。",
    title: "会话记录",
  },
  usage: {
    description: "用同一套范围追溯使用变化的时间与模型来源。",
    title: "趋势分析",
  },
};

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function customRangeDays(startDate: string, endDate: string) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 14;
  return Math.min(Math.max(Math.floor((end - start) / 86_400_000) + 1, 1), 365);
}

function lookbackDaysFor(startDate: string) {
  return customRangeDays(startDate, dateInputValue(new Date()));
}

function sessionActivityTime(value: string | null) {
  const timestamp = value ? Date.parse(value) : 0;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function StatCard({
  detail,
  hint,
  icon: Icon,
  label,
  tone,
  value,
  valueClassName,
  onValueClick,
  valueClickLabel,
}: {
  detail: string;
  hint: string;
  icon: typeof Activity;
  label: string;
  tone: "blue" | "emerald" | "orange" | "violet";
  value: string;
  valueClassName?: string;
  onValueClick?: () => void;
  valueClickLabel?: string;
}) {
  const toneClasses = {
    blue: {
      accent: "bg-blue-500",
      card: "ring-blue-500/20 bg-gradient-to-br from-blue-500/[0.10] via-blue-500/[0.025] to-card dark:from-blue-500/[0.16] dark:via-blue-500/[0.045]",
      icon: "bg-blue-500/10 text-blue-700 ring-1 ring-inset ring-blue-500/15 dark:text-blue-300",
    },
    emerald: {
      accent: "bg-emerald-500",
      card: "ring-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.10] via-emerald-500/[0.025] to-card dark:from-emerald-500/[0.16] dark:via-emerald-500/[0.045]",
      icon: "bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/15 dark:text-emerald-300",
    },
    orange: {
      accent: "bg-orange-500",
      card: "ring-orange-500/20 bg-gradient-to-br from-orange-500/[0.10] via-orange-500/[0.025] to-card dark:from-orange-500/[0.16] dark:via-orange-500/[0.045]",
      icon: "bg-orange-500/10 text-orange-700 ring-1 ring-inset ring-orange-500/15 dark:text-orange-300",
    },
    violet: {
      accent: "bg-violet-500",
      card: "ring-violet-500/20 bg-gradient-to-br from-violet-500/[0.10] via-violet-500/[0.025] to-card dark:from-violet-500/[0.16] dark:via-violet-500/[0.045]",
      icon: "bg-violet-500/10 text-violet-700 ring-1 ring-inset ring-violet-500/15 dark:text-violet-300",
    },
  }[tone];

  return (
    <Card className={`relative isolate min-h-0 gap-2 overflow-hidden rounded-2xl py-0 shadow-sm transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md ${toneClasses.card}`}>
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-px opacity-80 ${toneClasses.accent}`} />
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5 pt-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <CardDescription className="truncate text-sm font-semibold tracking-tight text-foreground/80">
            {label}
          </CardDescription>
          <Tooltip>
            <TooltipTrigger aria-label={`${label}说明`} className="shrink-0 text-muted-foreground transition-colors hover:text-foreground">
              <CircleHelp className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        </div>
        <div className={`flex size-9 items-center justify-center rounded-lg ${toneClasses.icon}`}>
          <Icon className="size-4.5" strokeWidth={1.9} />
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        {onValueClick ? (
          <button
            aria-label={valueClickLabel}
            className={`-ml-1 rounded-md px-1 text-left text-3xl font-semibold tracking-[-0.04em] tabular-nums transition-colors hover:bg-background/45 hover:underline hover:decoration-dotted hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ${valueClassName ?? ""}`}
            onClick={onValueClick}
            title={valueClickLabel}
            type="button"
          >
            {value}
          </button>
        ) : (
          <div className={`truncate text-3xl font-semibold tracking-[-0.04em] tabular-nums ${valueClassName ?? ""}`}>
            {value}
          </div>
        )}
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton className="h-36 rounded-xl" key={index} />
        ))}
      </div>
      <Skeleton className="h-[29rem] rounded-xl" />
      <Skeleton className="h-[24rem] rounded-xl" />
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

function ChartMetricToggle({
  onChange,
  value,
}: {
  onChange: (value: keyof typeof chartConfig) => void;
  value: keyof typeof chartConfig;
}) {
  const options: ReadonlyArray<{ label: string; value: keyof typeof chartConfig }> = [
    { label: "总量", value: "tokens" },
    { label: "请求", value: "inputOutput" },
    { label: "缓存", value: "cacheRead" },
  ];

  return (
    <div aria-label="概览图表指标" className="inline-flex items-center rounded-lg border bg-muted/35 p-1" role="group">
      {options.map((option) => (
        <Button
          aria-pressed={option.value === value}
          className="h-7 px-2.5 text-xs"
          key={option.value}
          onClick={() => onChange(option.value)}
          size="sm"
          variant={option.value === value ? "secondary" : "ghost"}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export default function Home() {
  const [rangeMode, setRangeMode] = useState<DateRangeMode>("14");
  const [customRange, setCustomRange] = useState<DateRange>(() => {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 13);
    return { from: start, to: end };
  });
  const [deviceFilter, setDeviceFilter] = useState<UsageDeviceFilter>("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [source, setSource] = useState<UsageSource>("all");
  const [page, setPage] = useState<Page>("overview");
  const [chartMetric, setChartMetric] = useState<keyof typeof chartConfig>("tokens");
  const [showExactTotalTokens, setShowExactTotalTokens] = useState(true);
  const [sessionLimit, setSessionLimit] = useState(25);
  const [sessionModel, setSessionModel] = useState("all");
  const [sessionQuery, setSessionQuery] = useState("");
  const [sessionSort, setSessionSort] = useState<SessionSort>("activity");
  const customStartDate = customRange.from ? dateInputValue(customRange.from) : "";
  const customEndDate = customRange.to ? dateInputValue(customRange.to) : customStartDate;
  const days = rangeMode === "custom" ? String(lookbackDaysFor(customStartDate)) : rangeMode;
  const { error, loading, refresh, snapshot } = useUsageSnapshot({
    days,
    device: deviceFilter,
    endDate: rangeMode === "custom" ? customEndDate : undefined,
    source,
    startDate: rangeMode === "custom" ? customStartDate : undefined,
  });

  const totals = snapshot?.totals ?? emptyTotals;
  const daily = snapshot?.daily ?? emptyPeriods;
  const weekly = snapshot?.weekly ?? emptyPeriods;
  const monthly = snapshot?.monthly ?? emptyPeriods;
  const sessions = snapshot?.sessions ?? emptySessions;
  const models = snapshot?.models ?? emptyModels;
  const devices = snapshot?.devices ?? [];
  const activeDeviceIds = snapshot?.activeDeviceIds ?? [];
  const selectedDevices = devices.filter((device) => activeDeviceIds.includes(device.id));
  const importedDevices = selectedDevices.filter((device) => device.kind === "imported");
  const selectedDeviceLabel =
    deviceFilter === "all"
      ? "综合数据"
      : devices.find((device) => device.id === deviceFilter)?.name ?? "本机";
  const activePageCopy = pageCopy[page];

  const chartData = useMemo(
    () =>
      daily.map((item) => ({
        cacheRead: Number((item.cacheReadTokens / 1_000_000).toFixed(2)),
        date: item.label,
        inputOutput: Number(((item.inputTokens + item.outputTokens) / 1_000_000).toFixed(2)),
        label: formatShortDate(item.label),
        tokens: Number((item.totalTokens / 1_000_000).toFixed(2)),
      })),
    [daily]
  );
  const cacheReuseRate = totals.totalTokens
    ? ((totals.cacheReadTokens / totals.totalTokens) * 100).toFixed(1)
    : "0.0";
  const latestDay = daily.at(-1);
  const averagePerActiveDay = daily.length ? totals.totalTokens / daily.length : 0;
  const latestDeviceUpdate = selectedDevices
    .map((device) => device.updatedAt)
    .filter((updatedAt): updatedAt is string => Boolean(updatedAt))
    .sort()
    .at(-1);
  const sessionModels = useMemo(
    () => [...new Set(sessions.flatMap((session) => session.models))].sort((left, right) => left.localeCompare(right)),
    [sessions]
  );
  const effectiveSessionModel = sessionModel === "all" || sessionModels.includes(sessionModel)
    ? sessionModel
    : "all";
  const filteredSessions = useMemo(() => {
    const query = sessionQuery.trim().toLocaleLowerCase();
    return sessions
      .filter((session) => {
        if (effectiveSessionModel !== "all" && !session.models.includes(effectiveSessionModel)) return false;
        if (!query) return true;
        return [session.id, session.models.join(" "), session.project ?? ""]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
      })
      .slice()
      .sort((left, right) => {
        if (sessionSort === "tokens") return right.totalTokens - left.totalTokens;
        if (sessionSort === "cost") return right.costUSD - left.costUSD;
        return sessionActivityTime(right.lastActivity) - sessionActivityTime(left.lastActivity);
      });
  }, [effectiveSessionModel, sessionQuery, sessionSort, sessions]);
  const visibleSessions = filteredSessions.slice(0, sessionLimit);
  const selectedExternalOnly =
    selectedDevices.length === 1 && selectedDevices[0]?.kind === "imported";
  const selectedImportedCount = selectedDevices.filter((device) => device.kind === "imported").length;

  function downloadRawData() {
    if (!snapshot) return;
    downloadJsonFile(
      usageExportFileName("ccusage", source, snapshot.generatedAt),
      snapshot.raw
    );
  }

  function downloadCurrentView() {
    if (!snapshot) return;
    downloadJsonFile(
      usageExportFileName("usage-view", deviceFilter, snapshot.generatedAt),
      buildUsageViewExport(snapshot, source)
    );
  }

  function resetScope() {
    const end = new Date();
    const start = new Date(end);
    start.setDate(start.getDate() - 13);
    setDeviceFilter("all");
    setSource("all");
    setRangeMode("14");
    setCustomRange({ from: start, to: end });
  }

  function selectPage(nextPage: Page) {
    setPage(nextPage);
    setMenuOpen(false);
  }

  return (
    <TooltipProvider delay={180}>
      <main className="min-h-svh bg-muted/25 text-foreground">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r bg-background/95 xl:flex">
          <div className="flex h-[72px] items-center border-b px-6">
            <div className="flex items-center gap-3">
              <BrandMark className="size-10 shrink-0" />
              <div>
                <p className="text-base font-semibold tracking-tight">Token Atlas</p>
                <p className="text-xs text-muted-foreground">本地 token 情报图谱</p>
              </div>
            </div>
          </div>
          <nav aria-label="仪表盘导航" className="flex-1 space-y-1.5 px-4 py-6">
            {navigation.map(({ icon: Icon, label, value }) => (
              <Button
                className="h-11 w-full justify-start gap-3 rounded-xl px-3 text-sm"
                key={value}
                onClick={() => selectPage(value)}
                variant={page === value ? "secondary" : "ghost"}
              >
                <Icon className="size-[18px]" />
                {label}
              </Button>
            ))}
          </nav>
          <div className="m-4 rounded-2xl border bg-muted/[0.18] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Database className="size-3.5 text-muted-foreground" />
              本地读取模式
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              日志只在本机由 ccusage 解析，不会上传对话内容。
            </p>
          </div>
        </aside>

        <div className="xl:pl-72">
          <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b bg-background/95 px-5 backdrop-blur supports-[backdrop-filter]:bg-background/75 sm:px-8">
            <Button
              aria-label="打开导航"
              className="xl:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
              size="icon"
              variant="ghost"
            >
              <Menu className="size-5" />
            </Button>
            <div className="min-w-0 flex-1 xl:hidden">
              <h1 className="truncate text-base font-semibold sm:text-lg">Token Atlas</h1>
            </div>
            <div aria-hidden="true" className="hidden flex-1 xl:block" />
            <Badge className="hidden gap-1.5 sm:flex" variant="secondary">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {snapshot?.mode === "live" ? "数据已同步" : "等待读取"}
            </Badge>
            {selectedDevices.length > 1 ? (
              <Badge className="hidden gap-1.5 md:flex" variant="outline">
                <Database className="size-3" />
                已汇总 {selectedDevices.length} 台设备
              </Badge>
            ) : null}
            <ThemeToggle />
            <Button className="h-9 gap-2 px-3" onClick={() => void refresh()} size="sm" variant="outline">
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">刷新</span>
            </Button>
          </header>

          <Sheet onOpenChange={setMenuOpen} open={menuOpen}>
            <SheetContent className="w-[min(22rem,88vw)] gap-0 p-0" side="left">
              <SheetHeader className="border-b px-5 py-5 pr-12 text-left">
                <SheetTitle className="flex items-center gap-2">
                  <BrandMark className="size-5" />
                  Token Atlas
                </SheetTitle>
                <SheetDescription>选择要查看的分析页面。</SheetDescription>
              </SheetHeader>
              <nav aria-label="移动端仪表盘导航" className="space-y-1 p-3">
                {navigation.map(({ icon: Icon, label, value }) => (
                  <Button
                    className="h-11 w-full justify-start gap-3 rounded-xl"
                    key={value}
                    onClick={() => selectPage(value)}
                    variant={page === value ? "secondary" : "ghost"}
                  >
                    <Icon className="size-[18px]" />
                    {label}
                  </Button>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <Sheet onOpenChange={setAuditOpen} open={auditOpen}>
            <SheetContent className="w-[min(58rem,100vw)] gap-0 p-0 sm:max-w-none" side="right">
              <SheetHeader className="border-b px-6 py-6 pr-14 text-left">
                <SheetTitle className="flex items-center gap-2 text-lg">
                  <FileJson className="size-5 text-muted-foreground" />
                  数据审计
                </SheetTitle>
                <SheetDescription className="mt-1.5">
                  用于确认来源、覆盖范围与导入状态；原始 JSON 只在排错或归档时展开。
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-auto p-6">
                <div className="space-y-6">
                  <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                        <Check className="size-4" />
                      </span>
                      <div>
                        <p className="font-medium">
                          {selectedDevices.length > 1 ? "已汇总多台设备的数据" : "当前范围已读取真实数据"}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          最近生成：{formatDate(snapshot?.generatedAt ?? null)} · 不会上传对话内容。
                        </p>
                      </div>
                    </div>
                    <Button className="gap-2 self-start sm:self-auto" disabled={!snapshot} onClick={downloadRawData} size="sm" variant="outline">
                      <Download className="size-4" />
                      导出 JSON
                    </Button>
                  </div>

                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border bg-muted/[0.12] p-3">
                      <dt className="text-xs text-muted-foreground">当前范围</dt>
                      <dd className="mt-1 truncate text-sm font-semibold" title={selectedDeviceLabel}>{selectedDeviceLabel}</dd>
                    </div>
                    <div className="rounded-xl border bg-muted/[0.12] p-3">
                      <dt className="text-xs text-muted-foreground">Agent 来源</dt>
                      <dd className="mt-1 truncate text-sm font-semibold">{usageSourceLabel(source)}</dd>
                    </div>
                    <div className="rounded-xl border bg-muted/[0.12] p-3">
                      <dt className="text-xs text-muted-foreground">覆盖活动日</dt>
                      <dd className="mt-1 text-sm font-semibold tabular-nums">{daily.length.toLocaleString("zh-CN")}</dd>
                    </div>
                    <div className="rounded-xl border bg-muted/[0.12] p-3">
                      <dt className="text-xs text-muted-foreground">本机会话明细</dt>
                      <dd className="mt-1 text-sm font-semibold tabular-nums">{sessions.length.toLocaleString("zh-CN")}</dd>
                    </div>
                  </dl>

                  <section>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">当前参与统计的设备</h3>
                        <p className="mt-1 text-xs text-muted-foreground">外部设备只提供导入的聚合用量，不展示会话内容。</p>
                      </div>
                      <Badge variant="outline">{selectedDevices.length} 台</Badge>
                    </div>
                    <div className="space-y-2">
                      {selectedDevices.length ? selectedDevices.map((device) => (
                        <div className="flex flex-col gap-2 rounded-xl border bg-background p-3 sm:flex-row sm:items-center sm:justify-between" key={device.id}>
                          <div className="min-w-0">
                            <p className="truncate font-medium" title={device.name}>{device.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {device.kind === "local" ? "本机实时解析" : "外部 JSON 导入"} · {usageSourceLabel(device.source)} · {device.dailyEntries} 个活动日
                            </p>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">更新：{formatDate(device.updatedAt)}</span>
                        </div>
                      )) : (
                        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">当前筛选范围没有匹配的设备数据。</div>
                      )}
                    </div>
                  </section>

                  <Accordion className="rounded-xl border bg-muted/[0.1] px-4">
                    <AccordionItem className="border-0" value="raw-json">
                      <AccordionTrigger className="py-4 text-sm font-medium hover:no-underline">
                        查看原始 ccusage JSON
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <pre className="max-h-[34rem] overflow-auto rounded-lg border bg-background p-4 font-mono text-xs leading-5 text-muted-foreground">
                          {snapshot ? JSON.stringify(snapshot.raw, null, 2) : "暂无审计数据。"}
                        </pre>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <div className="mx-auto max-w-[1800px] px-5 py-7 sm:px-8 lg:px-10 xl:py-8">
            <section aria-label="页面标题与全局范围" className="mb-6 space-y-4">
              <div>
                <h2 className="text-3xl font-semibold tracking-[-0.04em]">{activePageCopy.title}</h2>
                <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  {page === "overview" && importedDevices.length
                    ? "依次查看规模、近期变化和模型构成；本机与外部设备按同一范围汇总。"
                    : activePageCopy.description}
                </p>
              </div>

              <ScopeToolbar
                customRange={customRange}
                deviceFilter={deviceFilter}
                devices={devices}
                hasSnapshot={Boolean(snapshot)}
                latestUpdateLabel={latestDeviceUpdate ? `更新：${formatDate(latestDeviceUpdate)}` : "暂无更新时间"}
                onCustomRangeChange={setCustomRange}
                onDataSource={() => setAuditOpen(true)}
                onDeviceFilterChange={setDeviceFilter}
                onDownloadRawData={downloadRawData}
                onDownloadView={downloadCurrentView}
                onRangeModeChange={setRangeMode}
                onReset={resetScope}
                onSourceChange={setSource}
                rangeMode={rangeMode}
                selectedDeviceLabel={selectedDeviceLabel}
                selectedDevices={selectedDevices}
                source={source}
              />
            </section>

            {loading ? <DashboardSkeleton /> : null}
            {!loading && error && !snapshot ? <EmptyState message={error} /> : null}
            {!loading && error && snapshot ? (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-900 dark:text-amber-200" role="alert">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <p>{error} 正在保留并展示上一次成功读取的数据；可在确认本机日志或导入文件后重试。</p>
              </div>
            ) : null}

            {!loading && snapshot ? (
              <div className="space-y-8">
                {page === "overview" ? (
                  <>
                    <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                      <StatCard
                        detail={`最近 ${days} 天 · ${daily.length} 个活跃日${selectedDevices.length > 1 ? ` · ${selectedDevices.length} 台设备` : ""}`}
                        hint="输入、输出、推理和缓存相关 token 的总和。"
                        icon={Activity}
                        label="总 token"
                        onValueClick={() => setShowExactTotalTokens((current) => !current)}
                        tone="blue"
                        value={showExactTotalTokens ? formatExactTokens(totals.totalTokens) : formatTokens(totals.totalTokens)}
                        valueClassName={showExactTotalTokens ? "text-[1.7rem] sm:text-3xl" : undefined}
                        valueClickLabel={showExactTotalTokens ? "点击切换为紧凑单位显示" : "点击显示精确 token 数字"}
                      />
                      <StatCard
                        detail={`${daily.length} 个活跃日 · 最近活动：${latestDay?.label ?? "暂无记录"}`}
                        hint="按有日志记录的日期计算的平均 token 量；它不等于自然日平均值。"
                        icon={Server}
                        label="活跃日均"
                        tone="violet"
                        value={formatTokens(averagePerActiveDay)}
                      />
                      <StatCard
                        detail={`${formatTokens(totals.cacheReadTokens)} 缓存读取 · 占总 token 的比例`}
                        hint="缓存读取除以总 token；它表示当前范围内的上下文复用规模，而不是官方的缓存命中率。"
                        icon={Database}
                        label="缓存复用率"
                        tone="orange"
                        value={`${cacheReuseRate}%`}
                      />
                      <StatCard
                        detail="本地 ccusage 定价估算，不等同于官方账单"
                        hint="根据本地 ccusage 定价表得出的 API 参考价。"
                        icon={CircleDollarSign}
                        label="API 参考价"
                        tone="emerald"
                        value={formatCost(totals.costUSD)}
                      />
                    </section>

                    <section className="space-y-6">
                      <DashboardPanel
                        action={<ChartMetricToggle onChange={setChartMetric} value={chartMetric} />}
                        description="按日查看当前范围的用量；切换指标可区分请求量与缓存读取的变化。"
                        icon={<Activity className="size-4" />}
                        title="每日 token 使用量"
                        tone="blue"
                      >
                        <ContextMenu>
                          <ContextMenuTrigger className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                            {chartData.length ? (
                              <div className="rounded-xl bg-muted/[0.16] px-1 pt-2">
                                <ChartContainer className="h-[280px] w-full sm:h-[310px]" config={chartConfig}>
                                  <AreaChart
                                    accessibilityLayer
                                    data={chartData}
                                    margin={{ bottom: 0, left: 10, right: 14, top: 12 }}
                                  >
                                    <defs>
                                      <linearGradient id="fill-usage-overview" x1="0" x2="0" y1="0" y2="1">
                                        <stop offset="5%" stopColor={`var(--color-${chartMetric})`} stopOpacity={0.28} />
                                        <stop offset="95%" stopColor={`var(--color-${chartMetric})`} stopOpacity={0.01} />
                                      </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis axisLine={false} dataKey="label" minTickGap={28} tickLine={false} tickMargin={10} />
                                    <YAxis axisLine={false} tickFormatter={(value) => formatTokenMillions(Number(value))} tickLine={false} width={62} />
                                    <ChartTooltip
                                      content={
                                        <ChartTooltipContent
                                          formatter={(value) => `${Number(value).toFixed(2)}M ${chartConfig[chartMetric].label}`}
                                          labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                                        />
                                      }
                                    />
                                    <Area
                                      dataKey={chartMetric}
                                      fill="url(#fill-usage-overview)"
                                      fillOpacity={1}
                                      stroke={`var(--color-${chartMetric})`}
                                      strokeWidth={2}
                                      type="monotone"
                                    />
                                  </AreaChart>
                                </ChartContainer>
                              </div>
                            ) : (
                              <div className="flex h-[280px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground sm:h-[310px]">
                                所选范围内没有日志记录。
                              </div>
                            )}
                          </ContextMenuTrigger>
                          <ContextMenuContent>
                            <ContextMenuLabel>每日用量图</ContextMenuLabel>
                            <ContextMenuItem onClick={() => selectPage("usage")}>
                              <BarChart3 className="size-4" />
                              在趋势中继续分析
                            </ContextMenuItem>
                            <ContextMenuItem disabled={!snapshot} onClick={downloadCurrentView}>
                              <ArrowDownToLine className="size-4" />
                              导出当前范围汇总
                            </ContextMenuItem>
                            <ContextMenuSeparator />
                            <ContextMenuItem disabled={chartMetric === "tokens"} onClick={() => setChartMetric("tokens")}>
                              <Activity className="size-4" />
                              重置为总 token
                            </ContextMenuItem>
                          </ContextMenuContent>
                        </ContextMenu>
                        <dl className="mt-5 grid gap-4 border-t pt-5 sm:grid-cols-3 sm:[&>div+div]:border-l sm:[&>div+div]:pl-4">
                          <div>
                            <dt className="text-xs text-muted-foreground">最近活动日</dt>
                            <dd className="mt-1 font-semibold tabular-nums">{latestDay ? formatTokens(latestDay.totalTokens) : "—"}</dd>
                            <p className="mt-1 text-xs text-muted-foreground">{latestDay?.label ?? "暂无记录"}</p>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">缓存复用占比</dt>
                            <dd className="mt-1 font-semibold tabular-nums">{cacheReuseRate}%</dd>
                            <p className="mt-1 text-xs text-muted-foreground">缓存读取 ÷ 总 token</p>
                          </div>
                          <div>
                            <dt className="text-xs text-muted-foreground">请求 token</dt>
                            <dd className="mt-1 font-semibold tabular-nums">{formatTokens(totals.inputTokens + totals.outputTokens)}</dd>
                            <p className="mt-1 text-xs text-muted-foreground">输入与输出的合计</p>
                          </div>
                        </dl>
                      </DashboardPanel>

                      <DashboardPanel
                        action={<Badge variant="outline">{models.length} 个模型</Badge>}
                        description="用一张图看模型结构，再用表格核对 token、占比、请求与缓存。"
                        icon={<Layers3 className="size-4" />}
                        title="模型分布"
                        tone="violet"
                      >
                        {models.length ? (
                          <ModelDistribution models={models} />
                        ) : (
                          <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">没有模型聚合数据。</div>
                        )}
                      </DashboardPanel>
                    </section>

                  </>
                ) : null}

                {page === "usage" ? <TrendAnalytics daily={daily} monthly={monthly} weekly={weekly} /> : null}

                {page === "sessions" ? (
                  sessions.length ? (
                    <div className="space-y-6">
                      <section className="flex flex-col gap-3 rounded-2xl border bg-muted/[0.16] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300">
                            <History className="size-4" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold">会话明细仅来自本机</p>
                            <p className="mt-1 text-xs leading-5 text-muted-foreground">
                              {selectedImportedCount
                                ? `已排除 ${selectedImportedCount} 台仅含每日聚合数据的外部设备；上方范围仍会影响概览与趋势。`
                                : "ccusage 的会话明细仅在当前电脑解析，不会显示或上传外部设备的对话内容。"}
                            </p>
                          </div>
                        </div>
                        {deviceFilter !== "local" ? (
                          <Button className="shrink-0" onClick={() => setDeviceFilter("local")} size="sm" variant="outline">
                            仅看本机范围
                          </Button>
                        ) : (
                          <Badge className="w-fit shrink-0" variant="secondary">当前本机范围</Badge>
                        )}
                      </section>
                      <SessionAnalytics sessions={sessions} />
                      <DashboardPanel
                        action={<Badge variant="outline">{visibleSessions.length} / {filteredSessions.length} 条</Badge>}
                        description="搜索、模型与排序只作用于本机已解析的会话；它们不会改变顶部的全局汇总。"
                        icon={<History className="size-4" />}
                        title="会话记录"
                      >
                        <div className="mb-4 flex flex-col gap-3 border-b pb-4 xl:flex-row xl:items-center xl:justify-between">
                          <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_minmax(10rem,0.8fr)_9rem]">
                            <div className="relative min-w-0">
                              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                aria-label="搜索会话"
                                className="h-9 pl-9"
                                onChange={(event) => setSessionQuery(event.target.value)}
                                placeholder="搜索项目、模型或会话 ID"
                                value={sessionQuery}
                              />
                            </div>
                            <Select onValueChange={(value) => value && setSessionModel(value)} value={effectiveSessionModel}>
                              <SelectTrigger aria-label="按模型筛选会话" className="h-9 w-full bg-background text-sm">
                                <span className="min-w-0 flex-1 truncate text-left">{effectiveSessionModel === "all" ? "全部模型" : effectiveSessionModel}</span>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">全部模型</SelectItem>
                                {sessionModels.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Select onValueChange={(value) => value && setSessionSort(value as SessionSort)} value={sessionSort}>
                              <SelectTrigger aria-label="会话排序方式" className="h-9 w-full bg-background text-sm">
                                <span className="min-w-0 flex-1 truncate text-left">
                                  {sessionSort === "activity" ? "最近活动" : sessionSort === "tokens" ? "总 token" : "参考价"}
                                </span>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="activity">按最近活动</SelectItem>
                                <SelectItem value="tokens">按总 token</SelectItem>
                                <SelectItem value="cost">按参考价</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div aria-label="选择显示的会话数量" className="inline-flex w-fit rounded-lg border bg-muted/35 p-1" role="group">
                            {[10, 25, 50].map((limit) => (
                              <Button
                                aria-pressed={sessionLimit === limit}
                                className="h-7 px-2.5 text-xs"
                                key={limit}
                                onClick={() => setSessionLimit(limit)}
                                size="sm"
                                variant={sessionLimit === limit ? "secondary" : "ghost"}
                              >
                                {limit} 条
                              </Button>
                            ))}
                            <Button
                              aria-pressed={sessionLimit >= filteredSessions.length}
                              className="h-7 px-2.5 text-xs"
                              onClick={() => setSessionLimit(Number.MAX_SAFE_INTEGER)}
                              size="sm"
                              variant={sessionLimit >= filteredSessions.length ? "secondary" : "ghost"}
                            >
                              全部
                            </Button>
                          </div>
                        </div>
                        <SessionTable
                          emptyMessage={sessions.length ? "没有匹配当前搜索或模型筛选的会话。" : "没有可用会话记录。"}
                          sessions={visibleSessions}
                        />
                      </DashboardPanel>
                    </div>
                  ) : (
                    <DashboardPanel
                      description={selectedExternalOnly ? "该外部设备导入的是每日聚合用量，因此没有可展示的会话明细。" : "当前设备、Agent 或时间范围没有返回本机会话明细。"}
                      icon={<History className="size-4" />}
                      title="暂无会话明细"
                    >
                      <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed px-6 text-center">
                        <p className="text-sm text-muted-foreground">
                          {selectedExternalOnly ? "切换到本机数据即可查看本地解析出的会话。" : "可调整上方的全局范围，或刷新本地 ccusage 数据。"}
                        </p>
                        {selectedExternalOnly ? (
                          <Button className="mt-4" onClick={() => setDeviceFilter("local")} size="sm" variant="outline">切换到本机数据</Button>
                        ) : null}
                      </div>
                    </DashboardPanel>
                  )
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </TooltipProvider>
  );
}

function SessionTable({
  emptyMessage,
  sessions,
}: {
  emptyMessage: string;
  sessions: UsageSnapshot["sessions"];
}) {
  if (!sessions.length) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed px-5 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2 md:hidden">
        {sessions.map((session) => (
          <article className="rounded-xl border bg-background p-3" key={session.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">最后活动</p>
                <p className="mt-0.5 text-sm font-medium tabular-nums">{formatDate(session.lastActivity)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">总 token</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">{formatTokens(session.totalTokens)}</p>
              </div>
            </div>
            <div className="mt-3 border-t pt-3">
              <p className="truncate text-sm font-medium" title={session.models.join(", ")}>{session.models.join(", ") || "未识别模型"}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground" title={session.project ?? ""}>{formatProject(session.project)}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <span className="text-muted-foreground">缓存复用 <strong className="ml-1 font-medium text-foreground tabular-nums">{session.totalTokens ? `${((session.cacheReadTokens / session.totalTokens) * 100).toFixed(1)}%` : "—"}</strong></span>
              <span className="text-right text-muted-foreground">参考价 <strong className="ml-1 font-medium text-foreground tabular-nums">{formatCost(session.costUSD)}</strong></span>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden max-h-[34rem] overflow-auto rounded-xl border bg-background md:block">
        <Table>
          <TableHeader className="sticky top-0 bg-background">
            <TableRow>
              <TableHead>最后活动</TableHead>
              <TableHead>模型</TableHead>
              <TableHead>项目</TableHead>
              <TableHead className="text-right">总 token</TableHead>
              <TableHead className="text-right">缓存复用</TableHead>
              <TableHead className="text-right">参考价</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="whitespace-nowrap text-sm">{formatDate(session.lastActivity)}</TableCell>
                <TableCell>
                  <div className="max-w-44 truncate text-sm" title={session.models.join(", ")}>{session.models.join(", ") || "—"}</div>
                </TableCell>
                <TableCell className="max-w-36 truncate text-sm text-muted-foreground" title={session.project ?? ""}>{formatProject(session.project)}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{formatTokens(session.totalTokens)}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {session.totalTokens ? `${((session.cacheReadTokens / session.totalTokens) * 100).toFixed(1)}%` : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">{formatCost(session.costUSD)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
