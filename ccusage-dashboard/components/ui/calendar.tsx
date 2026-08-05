"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      className={cn("p-3", className)}
      classNames={{
        root: "w-fit",
        months: "relative flex flex-col gap-4 sm:flex-row",
        month: "flex w-full flex-col gap-3",
        month_caption: "flex h-8 items-center justify-center px-8 text-sm font-semibold",
        caption_label: "text-sm font-semibold",
        nav: "absolute inset-x-3 top-3 flex items-center justify-between",
        button_previous: "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        button_next: "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday: "w-9 rounded-md text-center text-[0.72rem] font-medium text-muted-foreground",
        weeks: "mt-1 flex w-full flex-col gap-1",
        week: "flex w-full",
        day: "relative size-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
        day_button: "flex size-9 items-center justify-center rounded-lg font-normal transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none aria-selected:opacity-100",
        selected: "[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground",
        today: "[&>button]:font-semibold [&>button]:text-primary",
        outside: "text-muted-foreground opacity-45",
        disabled: "text-muted-foreground opacity-35",
        range_start: "rounded-l-lg bg-primary/12 [&>button]:bg-primary [&>button]:text-primary-foreground",
        range_middle: "rounded-none bg-primary/12 [&>button]:rounded-none [&>button]:bg-transparent [&>button]:text-foreground",
        range_end: "rounded-r-lg bg-primary/12 [&>button]:bg-primary [&>button]:text-primary-foreground",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: iconClassName, ...iconProps }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("size-4", iconClassName)} {...iconProps} />
          ) : (
            <ChevronRight className={cn("size-4", iconClassName)} {...iconProps} />
          ),
      }}
      showOutsideDays={showOutsideDays}
      {...props}
    />
  )
}

export { Calendar }
