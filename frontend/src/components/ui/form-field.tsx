import * as React from "react"

import { cn } from "@/lib/utils"

function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  label: React.ReactNode
  htmlFor: string
  hint?: React.ReactNode
  error?: React.ReactNode
  required?: boolean
}) {
  return (
    <div
      data-slot="form-field"
      className={cn("space-y-1.5", className)}
      {...props}
    >
      <label
        htmlFor={htmlFor}
        className="flex items-center gap-1 text-sm font-semibold text-foreground"
      >
        <span className="truncate">{label}</span>
        {required ? (
          <span aria-hidden="true" className="shrink-0 text-destructive">
            *
          </span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}

export { FormField }
