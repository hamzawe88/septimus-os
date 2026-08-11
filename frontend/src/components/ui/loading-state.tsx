import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The standard "this pane is loading" state.
 *
 * Thirteen modules hand-rolled `animate-spin rounded-full h-8 w-8 border-b-2
 * border-brand` inside their own centering wrapper. Centralising it keeps the
 * spinner honest about `prefers-reduced-motion` in one place and gives screen
 * readers a consistent announcement instead of a silent div.
 */
function LoadingState({
  label,
  className,
  ...props
}: React.ComponentProps<"div"> & { label?: string }) {
  return (
    <div
      data-slot="loading-state"
      role="status"
      aria-live="polite"
      className={cn("flex h-full w-full items-center justify-center bg-background", className)}
      {...props}
    >
      <span
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand motion-reduce:animate-none"
      />
      <span className="sr-only">{label ?? "Loading"}</span>
    </div>
  )
}

export { LoadingState }
