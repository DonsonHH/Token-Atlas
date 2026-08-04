"use client"

import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  ...props
}: ProgressPrimitive.Root.Props & { className?: string }) {
  const percentage = Math.max(0, Math.min(100, value ?? 0))

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn("block h-2 overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <ProgressPrimitive.Track className="block h-full overflow-hidden">
        <ProgressPrimitive.Indicator
          className="block h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${percentage}%` }}
        />
      </ProgressPrimitive.Track>
    </ProgressPrimitive.Root>
  )
}

export { Progress }
