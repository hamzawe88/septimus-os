"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

export interface QuotaWarning {
  resource: string;
  current: number;
  limit: number;
  percent: number;
  level: "approaching" | "exceeded";
}

interface EntitlementsData {
  tier: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  usage: Record<string, number>;
  warnings?: QuotaWarning[];
}

interface EntitlementsContextValue {
  tier: string;
  isLoading: boolean;
  hasFeature: (key: string) => boolean;
  limit: (resource: string) => number; // -1 = unlimited
  usage: (resource: string) => number;
  atLimit: (resource: string) => boolean;
  /** Resources at >=80% (approaching) or over (exceeded) their plan cap. */
  warnings: QuotaWarning[];
  refresh: () => void;
}

const EntitlementsContext = createContext<EntitlementsContextValue | undefined>(undefined);

const UNLIMITED = -1;

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<EntitlementsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("septimus_token")) {
      setIsLoading(false);
      setData(null);
      return;
    }
    fetchWithAuth(`${API_BASE_URL}/billing/entitlements`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setData(j))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    // Deferred so the initial load never setStates synchronously inside the effect.
    const timer = setTimeout(refresh, 0);
    // Re-fetch entitlements after a subscription upgrade is broadcast.
    const onWs = (e: Event) => {
      const detail = (e as CustomEvent<{ event?: string; type?: string }>).detail || {};
      const t = detail.event || detail.type || "";
      if (t.includes("billing") || t.includes("upgrade")) refresh();
    };
    window.addEventListener("ws-message", onWs);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("ws-message", onWs);
    };
  }, [refresh]);

  // Optimistic while loading (never flash a lock); backend gates are authoritative.
  const hasFeature = useCallback((key: string) => (data ? !!data.features[key] : true), [data]);
  const limit = useCallback((resource: string) => (data ? data.limits[resource] ?? 0 : UNLIMITED), [data]);
  const usage = useCallback((resource: string) => (data ? data.usage[resource] ?? 0 : 0), [data]);
  const atLimit = useCallback(
    (resource: string) => {
      const max = limit(resource);
      if (max === UNLIMITED) return false;
      return usage(resource) >= max;
    },
    [limit, usage]
  );

  return (
    <EntitlementsContext.Provider
      value={{
        tier: data?.tier || "free",
        isLoading,
        hasFeature,
        limit,
        usage,
        atLimit,
        warnings: data?.warnings || [],
        refresh,
      }}
    >
      {children}
    </EntitlementsContext.Provider>
  );
}

export function useEntitlements(): EntitlementsContextValue {
  const ctx = useContext(EntitlementsContext);
  if (!ctx) {
    // Safe fallback so a component outside the provider never crashes.
    return {
      tier: "free",
      isLoading: false,
      hasFeature: () => true,
      limit: () => UNLIMITED,
      usage: () => 0,
      atLimit: () => false,
      warnings: [],
      refresh: () => {},
    };
  }
  return ctx;
}

/** Open the existing UpgradeModal (GlobalModals listens for this event). */
export function triggerUpgrade(feature?: string, currentTier?: string, requiredTier?: string) {
  window.dispatchEvent(
    new CustomEvent("septimus:tier-gate", {
      detail: { required_feature: feature, current_tier: currentTier, required_tier: requiredTier },
    })
  );
}
