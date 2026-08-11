import * as React from "react"

import { cn } from "@/lib/utils"
import { Surface } from "@/components/ui/surface"

function StatTile({
  label,
  value,
  detail,
  icon,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Surface>, "title"> & {
  label: React.ReactNode
  value: React.ReactNode
  detail?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <Surface
      data-slot="stat-tile"
      className={cn("min-w-0", className)}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold leading-none text-foreground">
            {value}
          </p>
          {detail ? (
            <div className="mt-2 text-xs text-muted-foreground">{detail}</div>
          ) : null}
        </div>
        {icon ? (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand-light text-brand [&_svg]:size-4">
            {icon}
          </div>
        ) : null}
      </div>
    </Surface>
  )
}

export { StatTile }
