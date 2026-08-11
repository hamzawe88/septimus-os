import * as React from "react"

import { cn } from "@/lib/utils"

function Progress({
  value,
  max = 100,
  className,
  indicatorClassName,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  value: number
  max?: number
  indicatorClassName?: string
}) {
  const normalizedValue = Math.min(Math.max(value, 0), max)
  const percentage = max > 0 ? (normalizedValue / max) * 100 : 0

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={normalizedValue}
      className={cn(
        "h-2 w-full overflow-hidden rounded-[var(--radius-control)] bg-muted",
        className,
      )}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn(
          "h-full bg-brand transition-[width] duration-300",
          indicatorClassName,
        )}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}

export { Progress }
