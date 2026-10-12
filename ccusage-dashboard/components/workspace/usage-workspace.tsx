"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowDownToLine,
  BarChart3,
  CircleAlert,
  Database,
  History,
  LayoutDashboard,
  Menu,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useUsageSnapshot } from "@/hooks/use-usage-snapshot";
import { formatDate } from "@/lib/format";
import { downloadJsonFile } from "@/lib/download";
import { buildUsageViewExport, usageExportFileName } from "@/lib/usage-export";
import { usageSourceOptions } from "@/lib/usage-types";
import {
  workspaceQuery,
  workspaceState,
  type WorkspaceState,
} from "@/lib/workspace-state";
import { cn } from "@/lib/utils";
import { Choice, Empty } from "./controls";
import { RangeControl } from "./range-control";
import { OverviewPage } from "./overview-page";
import { AnalysisPage } from "./analysis-page";
import { SessionsPage } from "./sessions-page";
import { SourcesPage } from "./sources-page";

const pages = [
  {
    id: "overview",
    label: "概览",
    caption: "了解用量与模型构成",
    icon: LayoutDashboard,
  },
  {
    id: "analysis",
    label: "用量分析",
    caption: "按时间与模型追溯变化",
    icon: BarChart3,
  },
  {
    id: "sessions",
    label: "会话",
    caption: "查找本机的具体记录",
    icon: History,
  },
  {
    id: "sources",
    label: "数据源",
    caption: "设备、覆盖范围与导入",
    icon: Database,
  },
] as const;

export function WorkspaceSkeleton() {
  return (
    <div className="space-y-5" aria-label="正在加载用量">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-36 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}

export function UsageWorkspace() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const state = workspaceState(new URLSearchParams(params.toString()));
  const [menuOpen, setMenuOpen] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const { snapshot, devices, loading, error, refresh } = useUsageSnapshot({
    days: state.days,
    device: state.device,
    source: state.source,
    startDate: state.start,
    endDate: state.end,
    timezone,
  });
  const currentPage = pages.find((item) => item.id === state.page)!;
  const PageIcon = currentPage.icon;
  function update(patch: Partial<WorkspaceState>, navigation = false) {
    const url = `${pathname}?${workspaceQuery({ ...state, ...patch })}`;
    if (navigation) {
      router.push(url, { scroll: true });
      setMenuOpen(false);
    } else router.replace(url, { scroll: false });
  }
  async function reload() {
    const id = toast.loading("正在更新用量…", { id: "usage-refresh" });
    try {
      const result = await refresh();
      if (!result) {
        toast.dismiss(id);
        return;
      }
      if (result.warnings.length)
        toast.warning("用量已更新，存在数据提示", { id });
      else toast.success("用量已更新", { id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刷新失败", { id });
    }
  }
  function exportView() {
    if (!snapshot || loading) return;
    try {
      downloadJsonFile(
        usageExportFileName(
          `token-atlas-${snapshot.range.start}`,
          state.device,
          snapshot.range.end,
        ),
        buildUsageViewExport(snapshot, snapshot.source),
      );
      toast.success("当前范围已下载");
    } catch {
      toast.error("导出失败，请重试");
    }
  }
  const navigation = (
    <nav aria-label="主导航" className="space-y-1.5">
      {pages.map((item) => (
        <Button
          key={item.id}
          aria-current={state.page === item.id ? "page" : undefined}
          className={cn(
            "h-11 w-full justify-start gap-3 rounded-xl px-3 text-sm",
            state.page === item.id && "shadow-xs",
          )}
          variant={state.page === item.id ? "secondary" : "ghost"}
          onClick={() => update({ page: item.id }, true)}
        >
          <item.icon className="size-[18px]" />
          {item.label}
        </Button>
      ))}
    </nav>
  );
  const scopeChanged =
    state.device !== "all" ||
    state.source !== "all" ||
    state.days !== "14" ||
    state.start;
  return (
    <div className="min-h-svh bg-muted/20">
      <a
        href="#workspace-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-background p-3 text-sm focus:not-sr-only"
      >
        跳到内容
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r bg-background lg:flex">
        <div className="flex h-[72px] items-center gap-3 px-6">
          <BrandMark className="size-9" />
          <div>
            <p className="text-[15px] font-semibold tracking-tight">
              Token Atlas
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              本地用量工作台
            </p>
          </div>
        </div>
        <div className="flex-1 px-3 pt-6">
          <p className="mb-3 px-3 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            工作空间
          </p>
          {navigation}
        </div>
        <div className="m-4 flex items-center gap-2 rounded-xl border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
          <ShieldCheck className="size-4" />
          数据留在本机
        </div>
      </aside>
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b bg-background/95 px-4 backdrop-blur-sm sm:px-7 xl:px-9">
          <Button
            className="size-9 lg:hidden"
            aria-label="打开导航"
            variant="ghost"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
              工作空间
            </span>
            <span className="hidden text-border sm:inline">/</span>
            <span className="truncate font-medium">{currentPage.label}</span>
          </div>
          <button
            className="hidden items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:flex"
            onClick={() => update({ page: "sources" }, true)}
          >
            <i
              className={cn(
                "size-1.5 rounded-full",
                error || snapshot?.warnings.length
                  ? "bg-amber-500"
                  : loading
                    ? "bg-muted-foreground"
                    : "bg-emerald-500",
              )}
            />
            {loading
              ? "读取中"
              : error
                ? "读取失败"
                : snapshot?.warnings.length
                  ? "数据提示"
                  : `${snapshot?.activeDeviceIds.length ?? 0} 台设备`}
          </button>
          <ThemeToggle />
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void reload()}
            className="h-9 gap-2 px-2.5"
            aria-label="刷新用量"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            <span className="hidden text-xs sm:inline">刷新</span>
          </Button>
        </header>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-64 gap-0">
            <SheetHeader className="border-b p-5 pr-12">
              <SheetTitle className="flex items-center gap-2">
                <BrandMark className="size-6" />
                Token Atlas
              </SheetTitle>
              <SheetDescription className="sr-only">
                选择工作空间页面
              </SheetDescription>
            </SheetHeader>
            <div className="p-3">{navigation}</div>
          </SheetContent>
        </Sheet>
        <main
          id="workspace-content"
          className="mx-auto max-w-[1680px] space-y-6 px-4 py-6 sm:px-7 sm:py-8 xl:px-9"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">
                {currentPage.label}
              </h1>
              <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
                {currentPage.caption}
              </p>
            </div>
            {state.page === "overview" || state.page === "analysis" ? (
              <Button
                variant="outline"
                onClick={exportView}
                disabled={!snapshot || loading}
                className="h-9 gap-2 text-xs"
              >
                <ArrowDownToLine className="size-3.5" />
                导出汇总
              </Button>
            ) : null}
          </div>
          {state.page !== "sources" ? (
            <section aria-label="分析范围" className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <Choice
                  label="统计设备"
                  value={state.device}
                  onChange={(device) => update({ device })}
                  className="w-full sm:w-48"
                  options={[
                    { value: "all", label: "综合数据" },
                    { value: "local", label: "本机" },
                    ...devices
                      .filter((item) => item.kind === "imported")
                      .map((item) => ({ value: item.id, label: item.name })),
                  ]}
                />
                <Choice
                  label="Agent 来源"
                  value={state.source}
                  onChange={(source) => update({ source })}
                  className="w-full sm:w-44"
                  options={usageSourceOptions.map((item) => ({
                    value: item.value,
                    label: item.value === "all" ? "全部 Agent" : item.label,
                  }))}
                />
                <RangeControl
                  scope={state}
                  resolvedRange={snapshot?.range}
                  onChange={update}
                />
                {scopeChanged ? (
                  <Button
                    aria-label="重置分析范围"
                    variant="ghost"
                    className="h-10 w-fit gap-1.5 text-xs"
                    onClick={() =>
                      update({
                        device: "all",
                        source: "all",
                        days: "14",
                        start: undefined,
                        end: undefined,
                      })
                    }
                  >
                    <X className="size-3.5" />
                    重置
                  </Button>
                ) : null}
              </div>
              <div
                aria-live="polite"
                className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
              >
                <PageIcon className="size-3" />
                {snapshot ? (
                  <>
                    <span>
                      {snapshot.range.start} — {snapshot.range.end}
                    </span>
                    <span>
                      {loading
                        ? "正在刷新…"
                        : `读取于 ${formatDate(snapshot.generatedAt)}`}
                    </span>
                  </>
                ) : (
                  <span>{error ? "未能获取该范围" : "正在读取所选范围…"}</span>
                )}
              </div>
            </section>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm"
            >
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div className="flex-1">
                <p>{error}</p>
                {snapshot ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    保留同一范围上次读取的结果。
                  </p>
                ) : null}
              </div>
              <Button
                variant="outline"
                className="h-8 text-xs"
                disabled={loading}
                onClick={() => void reload()}
              >
                重试
              </Button>
            </div>
          ) : null}
          {snapshot?.warnings.length ? (
            <details className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs">
              <summary className="cursor-pointer text-amber-800 dark:text-amber-300">
                {snapshot.warnings.length} 项数据提示
              </summary>
              <ul className="mt-3 space-y-2 text-muted-foreground">
                {snapshot.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}
          {!snapshot && loading ? (
            <WorkspaceSkeleton />
          ) : !snapshot ? (
            <Empty
              title="没有可显示的数据"
              detail="调整日期或设备后重试。"
              action={
                <Button
                  variant="outline"
                  className="h-10"
                  onClick={() =>
                    update({
                      device: "all",
                      source: "all",
                      days: "14",
                      start: undefined,
                      end: undefined,
                    })
                  }
                >
                  恢复默认范围
                </Button>
              }
            />
          ) : (
            <div
              aria-busy={loading}
              className={cn("min-w-0", loading && "opacity-60")}
            >
              {state.page === "overview" ? (
                <OverviewPage
                  snapshot={snapshot}
                  onAnalyze={() => update({ page: "analysis" }, true)}
                />
              ) : null}
              {state.page === "analysis" ? (
                <AnalysisPage
                  snapshot={snapshot}
                  state={state}
                  onChange={update}
                />
              ) : null}
              {state.page === "sessions" ? (
                <SessionsPage
                  key={`${snapshot.range.start}-${snapshot.range.end}-${snapshot.source}-${state.device}`}
                  snapshot={snapshot}
                  onLocal={() => update({ device: "local" })}
                />
              ) : null}
              {state.page === "sources" ? (
                <SourcesPage
                  snapshot={snapshot}
                  onRefresh={async () => {
                    try {
                      await refresh();
                    } catch {
                      toast.warning("导入已保存，请刷新查看最新用量");
                    }
                  }}
                  onAnalyzeDevice={(device) =>
                    update(
                      {
                        page: "analysis",
                        device: device.id,
                        source: device.source,
                      },
                      true,
                    )
                  }
                />
              ) : null}
            </div>
          )}
          <footer className="flex items-center justify-between gap-3 border-t pt-5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Activity className="size-3" />
              Token Atlas
            </span>
            <span>本地读取 · 离线估算</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
