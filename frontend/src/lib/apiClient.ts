export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
// Drive owns private MinIO streams; backend-core owns its metadata.
export const DRIVE_BASE_URL = process.env.NEXT_PUBLIC_DRIVE_URL || '/api/v1/drive';
// AI calls now go through the JWT-protected /api/v1/ai/* proxy in backend-core
// (same origin as the rest of the API), never directly to the sidecar port.
export const AI_BASE_URL = process.env.NEXT_PUBLIC_AI_URL || API_BASE_URL;
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8002/connection/websocket';
export const AUTH_UNAUTHORIZED_EVENT = 'septimus:unauthorized';

import { useAppStore } from '@/store/useAppStore';

export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof URLSearchParams) && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401) {
    useAppStore.getState().setIsLoggedIn(false);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    }
  } else if (response.status === 402) {
    try {
      const errorData = await response.clone().json();
      console.warn("[Feature Tier Gate 402 Intercepted]", errorData);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('septimus:tier-gate', { detail: errorData }));
      }
    } catch (err) {
      console.error("[Feature Tier Gate] Unparseable 402 payload", err);
    }
  } else if (response.status >= 400) {
    try {
      const errorData = await response.clone().json();
      console.error("[API Error Intercepted]", errorData);
      if (response.status >= 500) {
        alert(`Server Error: ${errorData.error || 'Unknown Error'}`);
      }
    } catch (err) {
      console.error("[API Error Intercepted] Unparseable response", err);
    }
  }

  return response;
}

export async function apiGet<T>(endpoint: string, base: string = API_BASE_URL, params?: { page?: number; limit?: number }): Promise<T> {
  let url = `${base}${endpoint}`;
  if (params && (params.page !== undefined || params.limit !== undefined)) {
    const separator = url.includes('?') ? '&' : '?';
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page.toString());
    if (params.limit) queryParams.append('limit', params.limit.toString());
    url += `${separator}${queryParams.toString()}`;
  }
  const res = await fetchWithAuth(url);
  if (!res.ok) throw new Error(`GET ${endpoint} failed`);
  return res.json();
}

export async function apiPost<T>(endpoint: string, data: unknown, base: string = API_BASE_URL): Promise<T> {
  const res = await fetchWithAuth(`${base}${endpoint}`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`POST ${endpoint} failed`);
  return res.json();
}

export async function apiPut<T>(endpoint: string, data: unknown, base: string = API_BASE_URL): Promise<T> {
  const res = await fetchWithAuth(`${base}${endpoint}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PUT ${endpoint} failed`);
  return res.json();
}

export async function apiPatch<T>(endpoint: string, data: unknown, base: string = API_BASE_URL): Promise<T> {
  const res = await fetchWithAuth(`${base}${endpoint}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PATCH ${endpoint} failed`);
  return res.json();
}

export async function apiDelete<T>(endpoint: string, base: string = API_BASE_URL): Promise<T> {
  const res = await fetchWithAuth(`${base}${endpoint}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`DELETE ${endpoint} failed`);
  const text = await res.text();
  return text ? JSON.parse(text) : ({} as unknown as T);
}

export function getCurrentWorkspaceId(): string {
  if (typeof window === 'undefined') return "";
  const stored = localStorage.getItem('currentWorkspaceId');
  if (stored) return stored;
  try {
    const userStr = localStorage.getItem('septimus_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.workspace_id || "";
    }
  } catch (e) {
    console.error("Error parsing user for workspace ID", e);
  }
  return "";
}
