// ═══════════════════════════════════════════════════════════════
// Septimus OS — Integrations catalog (backed by GET /integrations)
// The backend (backend-core/handlers/integrations.go) is the single
// source of truth for the available providers and their connected state.
// ═══════════════════════════════════════════════════════════════

import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";

export type IntegrationStatus = "connected" | "disconnected";

export interface Integration {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  status: IntegrationStatus;
}

// Fetches the live integration catalog with per-workspace connection status.
export async function fetchIntegrations(signal?: AbortSignal): Promise<Integration[]> {
  const res = await fetchWithAuth(`${API_BASE_URL}/integrations`, { signal });
  if (!res.ok) throw new Error(`Failed to load integrations (${res.status})`);
  const data = await res.json();
  const list = Array.isArray(data?.integrations) ? data.integrations : [];
  return list as Integration[];
}
