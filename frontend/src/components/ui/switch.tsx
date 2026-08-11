import * as React from "react"

import { cn } from "@/lib/utils"

function Switch({
  checked,
  onCheckedChange,
  className,
  disabled,
  ...props
}: Omit<React.ComponentProps<"button">, "onChange"> & {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      data-slot="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 items-center rounded-[var(--radius-control)] border border-transparent bg-muted p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=checked]:bg-brand",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className="size-5 translate-x-0 rounded-[var(--radius-control)] bg-background shadow-[var(--shadow-raised)] transition-transform rtl:-translate-x-0 data-[state=checked]:translate-x-5 rtl:data-[state=checked]:-translate-x-5"
        data-state={checked ? "checked" : "unchecked"}
      />
    </button>
  )
}

export { Switch }
