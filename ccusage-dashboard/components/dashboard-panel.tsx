import * as React from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

type PanelTone = "blue" | "emerald" | "neutral" | "violet"

const toneClasses: Record<PanelTone, string> = {
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  neutral: "bg-muted text-muted-foreground",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
}

type DashboardPanelProps = Omit<React.ComponentProps<typeof Card>, "children"> & {
  action?: React.ReactNode
  children: React.ReactNode
  contentClassName?: string
  description?: React.ReactNode
  icon?: React.ReactNode
  title: React.ReactNode
  tone?: PanelTone
}

/**
 * The standard analytical surface used across Token Atlas.
 *
 * Color is limited to the small icon treatment so it stays meaningful for
 * data series and statuses instead of becoming decoration on every card.
 */
function DashboardPanel({
  action,
  children,
  className,
  contentClassName,
  description,
  icon,
  title,
  tone = "neutral",
  ...props
}: DashboardPanelProps) {
  return (
    <Card className={cn("bg-card shadow-sm", className)} {...props}>
      <CardHeader className="flex flex-col gap-3 pb-0 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2.5 text-base font-semibold tracking-tight sm:text-lg">
            {icon ? (
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  toneClasses[tone]
                )}
              >
                {icon}
              </span>
            ) : null}
            <span className="min-w-0">{title}</span>
          </CardTitle>
          {description ? (
            <CardDescription className="mt-1.5 max-w-3xl text-sm leading-5">
              {description}
            </CardDescription>
          ) : null}
        </div>
        {action ? <div className="self-start sm:shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent className={cn("pt-1", contentClassName)}>{children}</CardContent>
    </Card>
  )
}

export { DashboardPanel }
