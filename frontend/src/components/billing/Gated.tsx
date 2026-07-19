"use client";

import React from "react";
import { Lock } from "lucide-react";
import { useEntitlements, triggerUpgrade } from "@/contexts/EntitlementsContext";

type GateMode = "hide" | "lock" | "disable";

interface GatedProps {
  /** entitlement feature key, e.g. "ai.chat" */
  feature: string;
  /** hide = render nothing; lock = dim + lock badge, click opens upgrade; disable = dim, non-interactive */
  mode?: GateMode;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  className?: string;
}

/**
 * Gate UI on a data-driven entitlement. The backend RequireFeature gate is the
 * real enforcement; this only shapes the UX (hide/lock/disable). While
 * entitlements load it renders children (optimistic, no lock-flash).
 */
export default function Gated({ feature, mode = "lock", children, fallback, className }: GatedProps) {
  const { hasFeature, tier } = useEntitlements();

  if (hasFeature(feature)) return <>{children}</>;

  if (mode === "hide") return <>{fallback ?? null}</>;

  if (mode === "disable") {
    return (
      <span
        aria-disabled
        title="Requires a higher plan"
        className={`opacity-50 pointer-events-none select-none ${className ?? ""}`}
      >
        {children}
      </span>
    );
  }

  // lock: dim + lock badge; clicking opens the existing UpgradeModal. A div
  // (role=button) is used so wrapping children that are themselves buttons/links
  // stays valid HTML; the inner content is pointer-events-none so its own click
  // never fires (the upgrade prompt wins).
  const openUpgrade = () => triggerUpgrade(feature, tier);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openUpgrade}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") openUpgrade();
      }}
      title="Upgrade required to unlock"
      className={`relative block w-full opacity-60 hover:opacity-90 transition-opacity cursor-pointer ${className ?? ""}`}
    >
      <span className="pointer-events-none block">{children}</span>
      <Lock className="w-3.5 h-3.5 absolute top-1 end-1 text-amber-500 pointer-events-none" />
    </div>
  );
}
