"use client"

import { format } from "date-fns"
import { zhCN } from "date-fns/locale"
import { CalendarDays } from "lucide-react"
import { useEffect, useState } from "react"
import type { DateRange } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

function DateRangePicker({
  className,
  disabled,
  onChange,
  value,
}: {
  className?: string
  disabled?: Date
  onChange: (range: DateRange | undefined) => void
  value: DateRange | undefined
}) {
  const [open, setOpen] = useState(false)
  const [numberOfMonths, setNumberOfMonths] = useState(2)

  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)")
    const updateMonths = () => setNumberOfMonths(query.matches ? 2 : 1)
    updateMonths()
    query.addEventListener("change", updateMonths)
    return () => query.removeEventListener("change", updateMonths)
  }, [])
  const label = value?.from
    ? value.to
      ? `${format(value.from, "yyyy/MM/dd")} – ${format(value.to, "yyyy/MM/dd")}`
      : `${format(value.from, "yyyy/MM/dd")} – 选择结束日期`
    : "选择日期范围"

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        aria-label="自定义日期范围"
        render={
          <Button
            className={cn("h-10 min-w-56 justify-start gap-2 px-3 text-left font-normal", className)}
            variant="outline"
          />
        }
      >
        <CalendarDays className="size-4 text-muted-foreground" />
        <span className="truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-w-[calc(100vw-2rem)] overflow-auto p-0" sideOffset={10}>
        <Calendar
          defaultMonth={value?.from}
          disabled={disabled ? { after: disabled } : undefined}
          locale={zhCN}
          mode="range"
          numberOfMonths={numberOfMonths}
          onSelect={(range) => {
            onChange(range)
            if (range?.from && range.to) setOpen(false)
          }}
          selected={value}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DateRangePicker }
