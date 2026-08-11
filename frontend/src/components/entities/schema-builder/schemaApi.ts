import { API_BASE_URL, fetchWithAuth } from "@/lib/apiClient";
import type { ApiErrorPayload } from "./types";

export async function schemaRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const response = await fetchWithAuth(`${API_BASE_URL}${endpoint}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as T & ApiErrorPayload;
  if (!response.ok) {
    const error = new Error(payload.error || "REQUEST_FAILED");
    Object.assign(error, { payload });
    throw error;
  }
  return payload;
}

export function schemaErrorPayload(error: unknown): ApiErrorPayload {
  if (error instanceof Error && "payload" in error) {
    return (error as Error & { payload: ApiErrorPayload }).payload;
  }
  return {};
}
