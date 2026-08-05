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
  Server,
  SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { BrandMark } from "@/components/brand-mark";
import { DashboardPanel } from "@/components/dashboard-panel";
import { DateRangePicker } from "@/components/date-range-picker";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
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
import { usageSourceLabel, usageSourceOptions } from "@/lib/usage-types";

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

const modelColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

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
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <Skeleton className="h-[31rem] rounded-xl" />
        <Skeleton className="h-[31rem] rounded-xl" />
      </div>
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
  const topModel = models[0] ?? null;
  const topModelShare = topModel && totals.totalTokens
    ? (topModel.totalTokens / totals.totalTokens) * 100
    : 0;
  const topTwoModelShare = totals.totalTokens
    ? (models.slice(0, 2).reduce((sum, model) => sum + model.totalTokens, 0) /
        totals.totalTokens) *
      100
    : 0;
  const cacheReuseRate = totals.totalTokens
    ? ((totals.cacheReadTokens / totals.totalTokens) * 100).toFixed(1)
    : "0.0";
  const latestDay = daily.at(-1);
  const latestDeviceUpdate = selectedDevices
    .map((device) => device.updatedAt)
    .filter((updatedAt): updatedAt is string => Boolean(updatedAt))
    .sort()
    .at(-1);
  const visibleSessions = sessions.slice(0, sessionLimit);
  const selectedExternalOnly =
    selectedDevices.length === 1 && selectedDevices[0]?.kind === "imported";

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
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold sm:text-lg">Token Atlas</h1>
            </div>
            <Badge className="hidden gap-1.5 sm:flex" variant="secondary">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              本地数据
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

          <div className="mx-auto max-w-[1800px] px-5 py-8 sm:px-8 lg:px-10 xl:py-10">
            <section aria-label="页面标题与全局范围" className="mb-8 space-y-4">
              <div>
                  <h2 className="text-3xl font-semibold tracking-[-0.04em]">{activePageCopy.title}</h2>
                  <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                    {page === "overview" && importedDevices.length
                      ? "在同一视图中核对本机与外部设备的 ccusage 汇总。"
                      : page === "overview"
                        ? "统一查看本机已识别 Agent 的用量、模型结构与数据范围。"
                        : activePageCopy.description}
                  </p>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:p-4 2xl:flex-row 2xl:items-center">
                <div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between 2xl:block">
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <SlidersHorizontal className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium">全局范围</p>
                      <p className="text-xs text-muted-foreground">设备、来源和日期会同步用于全部分析</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground 2xl:mt-3">
                    <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      {snapshot?.mode === "live" ? "数据已同步" : "等待读取"}
                    </span>
                    <span>更新：{formatDate(latestDeviceUpdate ?? null)}</span>
                    <span>{selectedDevices.length} 台设备</span>
                  </div>
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-[minmax(13rem,1fr)_10rem_minmax(10rem,1fr)_auto]">
                  <Select onValueChange={(value) => value && setDeviceFilter(value as UsageDeviceFilter)} value={deviceFilter}>
                    <SelectTrigger aria-label="选择统计设备" className="h-10 w-full min-w-0 bg-background">
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">设备</span>
                      <span className="min-w-0 flex-1 truncate text-left" title={selectedDeviceLabel}>{selectedDeviceLabel}</span>
                    </SelectTrigger>
                    <SelectContent align="end" className="w-[min(92vw,36rem)]">
                      <SelectItem value="all">综合数据</SelectItem>
                      <SelectItem value="local">本机数据</SelectItem>
                      {devices.filter((device) => device.kind === "imported").map((device) => (
                        <SelectItem key={device.id} value={device.id}>{device.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select onValueChange={(value) => value && setSource(value as UsageSource)} value={source}>
                    <SelectTrigger aria-label="选择 Agent 来源" className="h-10 w-full min-w-0 bg-background">
                      <span className="shrink-0 text-xs font-medium text-muted-foreground">来源</span>
                      <span className="min-w-0 flex-1 truncate text-left">{usageSourceLabel(source)}</span>
                    </SelectTrigger>
                    <SelectContent>
                      {usageSourceOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className={rangeMode === "custom" ? "grid grid-cols-1 gap-2 sm:grid-cols-[9rem_minmax(0,1fr)]" : "w-full"}>
                    <Select onValueChange={(value) => value && setRangeMode(value as DateRangeMode)} value={rangeMode}>
                      <SelectTrigger aria-label="选择统计日期范围" className="h-10 w-full min-w-0 bg-background">
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">时间</span>
                        <span className="min-w-0 flex-1 truncate text-left">{rangeMode === "custom" ? "自定义日期" : `最近 ${rangeMode} 天`}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">最近 7 天</SelectItem>
                        <SelectItem value="14">最近 14 天</SelectItem>
                        <SelectItem value="30">最近 30 天</SelectItem>
                        <SelectItem value="90">最近 90 天</SelectItem>
                        <SelectItem value="custom">自定义日期</SelectItem>
                      </SelectContent>
                    </Select>
                    {rangeMode === "custom" ? (
                      <DateRangePicker
                        disabled={new Date()}
                        onChange={(range) => {
                          if (range?.from) setCustomRange(range);
                        }}
                        value={customRange}
                      />
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button aria-label="打开数据审计" className="h-10 shrink-0 gap-2 px-3" onClick={() => setAuditOpen(true)} size="sm" variant="outline">
                      <Database className="size-4" />
                      <span>数据状态</span>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button className="h-10 min-w-0 flex-1 gap-2 px-3" disabled={!snapshot} variant="outline" />}>
                        <Download className="size-4" />
                        导出
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuGroup>
                          <DropdownMenuLabel>导出当前范围</DropdownMenuLabel>
                          <DropdownMenuItem onClick={downloadCurrentView}>
                            <ArrowDownToLine className="size-4" />
                            当前筛选汇总
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={downloadRawData}>
                          <FileJson className="size-4" />
                          原始 ccusage JSON
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
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
                        detail={`当前范围覆盖 ${selectedDevices.length} 台设备 · ${usageSourceLabel(source)}`}
                        hint="有日志记录的日期数量；用来判断当前统计窗口的覆盖程度。"
                        icon={Server}
                        label="活跃日"
                        tone="violet"
                        value={`${daily.length} 天`}
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

                    <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
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
                                <ChartContainer className="h-[350px] w-full" config={chartConfig}>
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
                              <div className="flex h-[350px] items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
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
                        description="按总 token 排名。颜色只用来对应各模型的数据序列，不代表好坏。"
                        icon={<Layers3 className="size-4" />}
                        title="哪些模型消耗最多？"
                        tone="violet"
                      >
                        {models.length ? (
                          <div className="space-y-5">
                            <div className="rounded-xl bg-muted/[0.16] p-4">
                              <p className="text-xs text-muted-foreground">主力模型</p>
                              <div className="mt-1 flex items-baseline justify-between gap-3">
                                <p className="min-w-0 truncate text-lg font-semibold" title={topModel?.name}>{topModel?.name ?? "—"}</p>
                                <span className="shrink-0 text-sm font-medium tabular-nums text-violet-700 dark:text-violet-300">{topModelShare.toFixed(1)}%</span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{topModel ? formatTokens(topModel.totalTokens) : "暂无记录"}</p>
                            </div>
                            <div className="space-y-4">
                              {models.slice(0, 5).map((model, index) => {
                                const share = totals.totalTokens ? (model.totalTokens / totals.totalTokens) * 100 : 0;
                                return (
                                  <div className="space-y-2" key={model.name}>
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                      <div className="min-w-0">
                                        <p className="flex items-center gap-2 truncate font-medium">
                                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: modelColors[index % modelColors.length] }} />
                                          <span className="truncate">{model.name}</span>
                                        </p>
                                        <p className="text-xs text-muted-foreground">{formatTokens(model.totalTokens)}</p>
                                      </div>
                                      <span className="text-xs font-medium tabular-nums text-muted-foreground">{share.toFixed(1)}%</span>
                                    </div>
                                    <Progress aria-label={`${model.name} token 占比`} indicatorStyle={{ backgroundColor: modelColors[index % modelColors.length] }} value={share} />
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/[0.16] px-3.5 py-3 text-sm">
                              <div>
                                <p className="text-xs text-muted-foreground">模型集中度</p>
                                <p className="mt-1 font-semibold tabular-nums">Top 2 占 {topTwoModelShare.toFixed(1)}%</p>
                              </div>
                              <div className="border-l pl-4 text-right">
                                <p className="text-xs text-muted-foreground">已识别模型</p>
                                <p className="mt-1 font-semibold tabular-nums">{models.length} 个</p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">没有模型聚合数据。</div>
                        )}
                      </DashboardPanel>
                    </section>

                    {importedDevices.length ? <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          <Check className="size-4" />
                        </span>
                        <div>
                          <p className="font-medium">外部设备数据已汇总</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            已汇总 {selectedDevices.length} 台设备；外部 JSON 最近更新于 {formatDate(latestDeviceUpdate ?? null)}。
                          </p>
                        </div>
                      </div>
                      <Button className="shrink-0 gap-2" onClick={() => setAuditOpen(true)} size="sm" variant="outline">
                        <FileJson className="size-4" />
                        管理数据
                      </Button>
                    </section> : null}
                  </>
                ) : null}

                {page === "usage" ? <TrendAnalytics daily={daily} monthly={monthly} weekly={weekly} /> : null}

                {page === "sessions" ? (
                  sessions.length ? (
                    <div className="space-y-6">
                      <SessionAnalytics sessions={sessions} />
                      <DashboardPanel
                        action={<Badge variant="outline">{visibleSessions.length} / {sessions.length} 条</Badge>}
                        description="仅显示当前本机可解析的会话明细；外部设备的导入格式只包含聚合数据。"
                        icon={<History className="size-4" />}
                        title="会话记录"
                      >
                        <div className="mb-4 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm text-muted-foreground">按最近活动时间排序</p>
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
                              aria-pressed={sessionLimit >= sessions.length}
                              className="h-7 px-2.5 text-xs"
                              onClick={() => setSessionLimit(sessions.length)}
                              size="sm"
                              variant={sessionLimit >= sessions.length ? "secondary" : "ghost"}
                            >
                              全部
                            </Button>
                          </div>
                        </div>
                        <SessionTable sessions={visibleSessions} />
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

function SessionTable({ sessions }: { sessions: UsageSnapshot["sessions"] }) {
  return (
    <div className="max-h-[34rem] overflow-auto rounded-xl border bg-background">
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
          {sessions.length ? sessions.map((session) => (
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
          )) : (
            <TableRow>
              <TableCell className="h-24 text-center text-muted-foreground" colSpan={6}>没有可用会话记录。</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
