import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function Pagination({
  page,
  totalPages,
  onPageChange,
  previousLabel,
  nextLabel,
  pageLabel,
  className,
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  previousLabel: string
  nextLabel: string
  pageLabel: string
  className?: string
}) {
  return (
    <nav
      data-slot="pagination"
      aria-label={pageLabel}
      className={cn("flex items-center justify-between gap-3", className)}
    >
      <Button
        variant="outline"
        size="sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label={previousLabel}
      >
        <ChevronLeft className="rtl:rotate-180" />
        <span className="hidden truncate sm:inline">{previousLabel}</span>
      </Button>
      <span className="shrink-0 text-sm font-semibold text-muted-foreground">
        {page} / {Math.max(totalPages, 1)}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label={nextLabel}
      >
        <span className="hidden truncate sm:inline">{nextLabel}</span>
        <ChevronRight className="rtl:rotate-180" />
      </Button>
    </nav>
  )
}

export { Pagination }
