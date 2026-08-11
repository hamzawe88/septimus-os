"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPut } from "./apiClient";

/**
 * Workspace branding — the company identity every document renderer stamps onto
 * letterheads, invoices and payslips.
 *
 * This replaces the old browser-only storage (localStorage + IndexedDB), which
 * made the logo per-device: a colleague saw nothing and correspondence could
 * never render it. Branding now comes from the server, scoped to the workspace.
 */
export interface Branding {
  company_name: string;
  company_name_en: string;
  logo_url: string;
  tax_number: string;
  cr_number: string;
  address: string;
  address_en: string;
  phone: string;
  email: string;
  website: string;
  iban: string;
  bank_name: string;
}

export const EMPTY_BRANDING: Branding = {
  company_name: "", company_name_en: "", logo_url: "", tax_number: "", cr_number: "",
  address: "", address_en: "", phone: "", email: "", website: "", iban: "", bank_name: "",
};

/** Fired after a successful save so open renderers refresh without a reload. */
export const BRANDING_UPDATED_EVENT = "septimus_branding_updated";

export function useBranding() {
  const [branding, setBranding] = useState<Branding>(EMPTY_BRANDING);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ data: Branding }>(`/workspace/branding`);
      setBranding({ ...EMPTY_BRANDING, ...(res.data || {}) });
    } catch (err) {
      console.error("Failed to load workspace branding", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail as Branding | undefined;
      if (detail) setBranding({ ...EMPTY_BRANDING, ...detail });
      else void load();
    };
    window.addEventListener(BRANDING_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(BRANDING_UPDATED_EVENT, onUpdate);
  }, [load]);

  return { branding, loading, reload: load };
}

/** Admin-only save; broadcasts so every open renderer picks the change up. */
export async function saveBranding(data: Partial<Branding>): Promise<Branding> {
  const res = await apiPut<{ data: Branding }>(`/workspace/branding`, data);
  const saved = { ...EMPTY_BRANDING, ...(res.data || {}) };
  window.dispatchEvent(new CustomEvent(BRANDING_UPDATED_EVENT, { detail: saved }));
  return saved;
}
