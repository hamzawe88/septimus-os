"use client"

import {
  Brain,
  CircleHelp,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { useLocalization } from "@/contexts/LocalizationContext"
import { cn } from "@/lib/utils"
import { Tag } from "@/components/ui/tag"

export type ProvenanceLevel =
  | "verified"
  | "confident-recall"
  | "assumption"
  | "speculation"

const provenanceConfig = {
  verified: {
    labelKey: "designSystem.provenance.verified",
    tone: "success" as const,
    icon: ShieldCheck,
  },
  "confident-recall": {
    labelKey: "designSystem.provenance.confidentRecall",
    tone: "info" as const,
    icon: Brain,
  },
  assumption: {
    labelKey: "designSystem.provenance.assumption",
    tone: "warning" as const,
    icon: CircleHelp,
  },
  speculation: {
    labelKey: "designSystem.provenance.speculation",
    tone: "brand" as const,
    icon: Sparkles,
  },
}

function ProvenanceBadge({
  level,
  className,
}: {
  level: ProvenanceLevel
  className?: string
}) {
  const { t } = useLocalization()
  const config = provenanceConfig[level]
  const Icon = config.icon

  return (
    <Tag
      data-slot="provenance-badge"
      tone={config.tone}
      className={cn("uppercase", className)}
    >
      <Icon />
      <span className="truncate">{t(config.labelKey)}</span>
    </Tag>
  )
}

function ProvenanceSurface({
  level,
  children,
  className,
}: {
  level: ProvenanceLevel
  children: React.ReactNode
  className?: string
}) {
  return (
    <aside
      data-slot="provenance-surface"
      className={cn(
        "space-y-3 rounded-[var(--radius-surface)] border border-brand/20 bg-brand-light p-4 text-foreground",
        className,
      )}
    >
      <ProvenanceBadge level={level} />
      <div className="text-sm leading-relaxed">{children}</div>
    </aside>
  )
}

export { ProvenanceBadge, ProvenanceSurface }
