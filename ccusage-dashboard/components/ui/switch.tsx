"use client"

import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  ...props
}: SwitchPrimitive.Root.Props & { className?: string }) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent bg-input p-0.5 shadow-sm outline-none transition-colors data-checked:bg-primary focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function SwitchThumb({
  className,
  ...props
}: SwitchPrimitive.Thumb.Props & { className?: string }) {
  return (
    <SwitchPrimitive.Thumb
      data-slot="switch-thumb"
      className={cn(
        "flex size-5 translate-x-0 items-center justify-center rounded-full bg-background text-foreground shadow-sm transition-transform duration-200 data-checked:translate-x-5",
        className
      )}
      {...props}
    />
  )
}

export { Switch, SwitchThumb }
