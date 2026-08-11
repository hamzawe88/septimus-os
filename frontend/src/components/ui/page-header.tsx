import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The standard module page header: sticky top bar with an icon, title,
 * description, and optional actions.
 *
 * Fourteen modules hand-rolled `flex-none px-8 py-6 border-b border-border
 * bg-card` with their own heading sizes, which is how the spacing and type
 * scale drifted apart between HR, CRM, and PM. Compose this instead so a
 * change to the module chrome happens in one place.
 */
function PageHeader({
  icon,
  title,
  description,
  actions,
  className,
  ...props
}: Omit<React.ComponentProps<"header">, "title"> & {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex-none border-b border-border bg-card px-8 py-6",
        "flex flex-wrap items-start justify-between gap-4",
        className
      )}
      {...props}
    >
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          {icon}
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
    </header>
  )
}

export { PageHeader }
