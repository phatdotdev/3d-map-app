import { ensureAppMode, isWebMode } from "../../config/runtime";

const DEFAULT_API_BASE_URL = "/api";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const API_BASE_URL = trimTrailingSlash(
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL,
);

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const method = String(init?.method ?? "GET").toUpperCase();

  if (isWebMode()) {
    ensureAppMode(
      method === "GET" || method === "HEAD" ? "Doc API" : "Chuc nang ghi du lieu",
    );
  }

  const response = await fetch(apiUrl(path), {
    cache: "no-store",
    ...init,
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as unknown)
    : await response.text();

  if (!response.ok) {
    const message =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `API request failed (${response.status} ${response.statusText}).`;
    throw new Error(message);
  }

  return payload as T;
}
