import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const surfaceVariants = cva(
  "text-foreground",
  {
    variants: {
      variant: {
        canvas: "bg-background",
        default: "rounded-[var(--radius-surface)] border border-border bg-card",
        raised:
          "rounded-[var(--radius-surface)] border border-border bg-popover shadow-[var(--shadow-raised)]",
        muted: "rounded-[var(--radius-surface)] bg-muted",
        ai:
          "rounded-[var(--radius-surface)] border border-brand/20 bg-brand-light",
      },
      padding: {
        none: "",
        sm: "p-3",
        default: "p-4",
        lg: "p-6",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "default",
    },
  },
)

function Surface({
  className,
  variant,
  padding,
  ...props
}: React.ComponentProps<"section"> & VariantProps<typeof surfaceVariants>) {
  return (
    <section
      data-slot="surface"
      className={cn(surfaceVariants({ variant, padding }), className)}
      {...props}
    />
  )
}

function PanelHeader({
  className,
  ...props
}: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="panel-header"
      className={cn(
        "flex min-w-0 items-start justify-between gap-3 border-b border-border pb-3",
        className,
      )}
      {...props}
    />
  )
}

function PanelTitle({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="panel-title"
      className={cn("truncate text-lg font-bold leading-snug", className)}
      {...props}
    />
  )
}

function PanelDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="panel-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function PanelBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="panel-body"
      className={cn("pt-4", className)}
      {...props}
    />
  )
}

export {
  Surface,
  PanelHeader,
  PanelTitle,
  PanelDescription,
  PanelBody,
  surfaceVariants,
}
