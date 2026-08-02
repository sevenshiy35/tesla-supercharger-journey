import "server-only";

import { MapboxServerError } from "./errors";

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

export function isRouteGeometryPersistenceEnabled() {
  return process.env.MAPBOX_PERSIST_ROUTE_GEOMETRY?.trim().toLowerCase() === "true";
}

function serverToken() {
  const token = process.env.MAPBOX_SERVER_ACCESS_TOKEN?.trim();
  if (!token) throw new MapboxServerError("missing_token", "Mapbox server token is missing.");
  return token;
}

function statusError(status: number) {
  if (status === 401) return new MapboxServerError("unauthorized", "Mapbox authentication failed.");
  if (status === 403) return new MapboxServerError("forbidden", "Mapbox access was denied.");
  if (status === 429) return new MapboxServerError("rate_limited", "Mapbox rate limit reached.");
  if (status >= 500) return new MapboxServerError("provider_unavailable", "Mapbox is unavailable.");
  return new MapboxServerError("invalid_response", "Mapbox rejected the request.");
}

export async function mapboxJsonRequest(
  baseUrl: string,
  parameters: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  const url = new URL(baseUrl);
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  url.searchParams.set("access_token", serverToken());

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (response.ok) return await response.json() as unknown;
      if (RETRYABLE_STATUSES.has(response.status) && attempt < MAX_ATTEMPTS - 1) continue;
      throw statusError(response.status);
    } catch (error) {
      if (error instanceof MapboxServerError) throw error;
      if (controller.signal.aborted) {
        if (attempt < MAX_ATTEMPTS - 1) continue;
        throw new MapboxServerError("timeout", "Mapbox request timed out.");
      }
      if (attempt === MAX_ATTEMPTS - 1) {
        throw new MapboxServerError("provider_unavailable", "Mapbox request failed.");
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new MapboxServerError("provider_unavailable", "Mapbox request failed.");
}
