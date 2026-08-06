"use client"

import { CalendarRange, Database, Download, FileJson, SlidersHorizontal } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { DateRangePicker } from "@/components/date-range-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select"
import type { UsageDevice, UsageDeviceFilter, UsageSource } from "@/lib/usage"
import { usageSourceLabel, usageSourceOptions } from "@/lib/usage-types"

type DateRangeMode = "7" | "14" | "30" | "90" | "custom"

type ScopeToolbarProps = {
  customRange: DateRange
  deviceFilter: UsageDeviceFilter
  devices: UsageDevice[]
  hasSnapshot: boolean
  latestUpdateLabel: string
  onCustomRangeChange: (range: DateRange) => void
  onDataSource: () => void
  onDeviceFilterChange: (value: UsageDeviceFilter) => void
  onDownloadRawData: () => void
  onDownloadView: () => void
  onRangeModeChange: (value: DateRangeMode) => void
  onReset: () => void
  onSourceChange: (value: UsageSource) => void
  rangeMode: DateRangeMode
  selectedDeviceLabel: string
  selectedDevices: UsageDevice[]
  source: UsageSource
}

function dateRangeLabel(rangeMode: DateRangeMode) {
  return rangeMode === "custom" ? "自定义日期" : `最近 ${rangeMode} 天`
}

function ScopePill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs shadow-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="max-w-44 truncate font-medium text-foreground" title={value}>{value}</span>
    </span>
  )
}

/**
 * Compact global-context control. It surfaces the active scope at a glance,
 * while keeping the full selector form one intentional click away.
 */
function ScopeToolbar({
  customRange,
  deviceFilter,
  devices,
  hasSnapshot,
  latestUpdateLabel,
  onCustomRangeChange,
  onDataSource,
  onDeviceFilterChange,
  onDownloadRawData,
  onDownloadView,
  onRangeModeChange,
  onReset,
  onSourceChange,
  rangeMode,
  selectedDeviceLabel,
  selectedDevices,
  source,
}: ScopeToolbarProps) {
  return (
    <Popover>
      <section aria-label="全局分析范围" className="rounded-2xl border bg-card px-3 py-3 shadow-sm sm:px-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex min-w-0 items-center gap-2.5 xl:shrink-0">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <SlidersHorizontal className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">分析范围</p>
              <p className="truncate text-xs text-muted-foreground">
                {selectedDevices.length ? `${selectedDevices.length} 台设备 · ${latestUpdateLabel}` : "正在确定数据范围"}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <ScopePill label="设备" value={selectedDeviceLabel} />
            <ScopePill label="来源" value={usageSourceLabel(source)} />
            <ScopePill label="时间" value={dateRangeLabel(rangeMode)} />
            <PopoverTrigger
              render={
                <Button className="h-8 gap-1.5 rounded-md px-2.5 text-xs" size="sm" variant="ghost" />
              }
            >
              <CalendarRange className="size-3.5" />
              调整范围
            </PopoverTrigger>
          </div>

          <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            <Badge className="gap-1.5" variant="secondary">
              <span className={`size-1.5 rounded-full ${hasSnapshot ? "bg-emerald-500" : "bg-amber-500"}`} />
              {hasSnapshot ? "已同步" : "读取中"}
            </Badge>
            <Button className="h-8 gap-1.5 px-2.5 text-xs" onClick={onDataSource} size="sm" variant="outline">
              <Database className="size-3.5" />
              数据源
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button className="h-8 gap-1.5 px-2.5 text-xs" disabled={!hasSnapshot} size="sm" variant="outline" />}>
                <Download className="size-3.5" />
                导出
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>导出当前范围</DropdownMenuLabel>
                  <DropdownMenuItem onClick={onDownloadView}>
                    <Download className="size-4" />
                    当前筛选汇总
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDownloadRawData}>
                  <FileJson className="size-4" />
                  原始 ccusage JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>

      <PopoverContent align="end" className="w-[min(94vw,48rem)] p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">调整全局范围</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              设备、Agent 来源和日期会同步作用于概览、趋势与会话页面。
            </p>
          </div>
          <Button className="h-8 shrink-0 px-2.5 text-xs" onClick={onReset} size="sm" variant="ghost">
            重置
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            设备
            <Select onValueChange={(value) => value && onDeviceFilterChange(value as UsageDeviceFilter)} value={deviceFilter}>
              <SelectTrigger aria-label="选择统计设备" className="h-10 w-full bg-background text-foreground">
                <span className="min-w-0 flex-1 truncate text-left">{selectedDeviceLabel}</span>
              </SelectTrigger>
              <SelectContent className="w-[min(92vw,36rem)]">
                <SelectItem value="all">综合数据</SelectItem>
                <SelectItem value="local">本机数据</SelectItem>
                {devices.filter((device) => device.kind === "imported").map((device) => (
                  <SelectItem key={device.id} value={device.id}>{device.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            Agent 来源
            <Select onValueChange={(value) => value && onSourceChange(value as UsageSource)} value={source}>
              <SelectTrigger aria-label="选择 Agent 来源" className="h-10 w-full bg-background text-foreground">
                <span className="min-w-0 flex-1 truncate text-left">{usageSourceLabel(source)}</span>
              </SelectTrigger>
              <SelectContent>
                {usageSourceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
            时间范围
            <Select onValueChange={(value) => value && onRangeModeChange(value as DateRangeMode)} value={rangeMode}>
              <SelectTrigger aria-label="选择统计日期范围" className="h-10 w-full bg-background text-foreground">
                <span className="min-w-0 flex-1 truncate text-left">{dateRangeLabel(rangeMode)}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">最近 7 天</SelectItem>
                <SelectItem value="14">最近 14 天</SelectItem>
                <SelectItem value="30">最近 30 天</SelectItem>
                <SelectItem value="90">最近 90 天</SelectItem>
                <SelectItem value="custom">自定义日期</SelectItem>
              </SelectContent>
            </Select>
          </label>
        </div>

        {rangeMode === "custom" ? (
          <div className="mt-3 grid gap-1.5 text-xs font-medium text-muted-foreground">
            精确日期
            <DateRangePicker
              className="w-full min-w-0"
              disabled={new Date()}
              onChange={(range) => {
                if (range?.from) onCustomRangeChange(range)
              }}
              value={customRange}
            />
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export { ScopeToolbar }
