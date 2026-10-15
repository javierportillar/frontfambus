export const PRIMARY_API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.fragloesja.uk";

export const MOTOSHOP_LOCAL_BASE =
  process.env.MOTOSHOP_LOCAL_API_URL ?? "https://motoshop-local.fragloesja.uk";

export const MASVITAL_LOCAL_BASE =
  process.env.MASVITAL_LOCAL_API_URL ?? "https://masvital-local.fragloesja.uk";

export const FALLBACK_API_BASE =
  process.env.FALLBACK_API_URL ?? "https://local-api.fragloesja.uk";

export interface FailoverResult {
  resp: Response;
  isFallback: boolean;
}

function extractTenant(headers: HeadersInit | undefined): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) {
    return headers.get("x-tenant")?.toLowerCase() ?? null;
  }
  if (Array.isArray(headers)) {
    const found = headers.find(([k]) => k.toLowerCase() === "x-tenant");
    return found ? found[1].toLowerCase() : null;
  }
  if (typeof headers === "object") {
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === "x-tenant" && typeof v === "string") {
        return v.toLowerCase();
      }
    }
  }
  return null;
}

export function resolveFallbackUrls(tenant: string | null): string[] {
  const customList = process.env.FALLBACK_API_URLS
    ? process.env.FALLBACK_API_URLS.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  if (customList.length > 0) {
    return customList;
  }

  // Prioritize the tenant's own PC first, then cascade to the other PC
  const candidates: string[] = [];
  if (tenant === "masvital") {
    candidates.push(MASVITAL_LOCAL_BASE, MOTOSHOP_LOCAL_BASE, FALLBACK_API_BASE);
  } else {
    candidates.push(MOTOSHOP_LOCAL_BASE, MASVITAL_LOCAL_BASE, FALLBACK_API_BASE);
  }

  // Filter unique valid candidates distinct from primary
  const unique = new Set<string>();
  for (const url of candidates) {
    if (url && url !== PRIMARY_API_BASE) {
      unique.add(url);
    }
  }
  return Array.from(unique);
}

/**
 * Fetch from primary backend with automatic, low-latency failover across redundant
 * fallback nodes (MotoShop PC & MasVital PC).
 * If the primary is down or suspended (502/503/504), it tries candidate fallbacks in priority
 * order until one succeeds.
 */
export async function fetchWithFailover(
  pathAndQuery: string,
  init: RequestInit,
  timeoutMs = 8000,
): Promise<FailoverResult> {
  const normalizedPath = pathAndQuery.startsWith("/")
    ? pathAndQuery
    : `/${pathAndQuery}`;
  const primaryUrl = `${PRIMARY_API_BASE}${normalizedPath}`;

  const tenant = extractTenant(init.headers);
  const fallbackUrls = resolveFallbackUrls(tenant);

  let primaryResp: Response | null = null;
  let primaryError: unknown = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (init.signal) {
      if (init.signal.aborted) {
        controller.abort();
      } else {
        init.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }
    }

    primaryResp = await fetch(primaryUrl, {
      ...init,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    // If primary returned server error (502, 503, 504), trigger failover cascade
    if (
      fallbackUrls.length > 0 &&
      (primaryResp.status === 502 ||
        primaryResp.status === 503 ||
        primaryResp.status === 504)
    ) {
      const fallbackResult = await executeFallbackCascade(
        fallbackUrls,
        normalizedPath,
        init,
      );
      if (fallbackResult) {
        return fallbackResult;
      }
    }

    return { resp: primaryResp, isFallback: false };
  } catch (err) {
    primaryError = err;
    if (fallbackUrls.length > 0) {
      const fallbackResult = await executeFallbackCascade(
        fallbackUrls,
        normalizedPath,
        init,
      );
      if (fallbackResult) {
        return fallbackResult;
      }
    }
    throw primaryError;
  }
}

async function executeFallbackCascade(
  fallbackUrls: string[],
  path: string,
  init: RequestInit,
  perNodeTimeoutMs = 5000,
): Promise<FailoverResult | null> {
  let lastError: unknown = null;

  for (const baseUrl of fallbackUrls) {
    const targetUrl = `${baseUrl}${path}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), perNodeTimeoutMs);

      const resp = await fetch(targetUrl, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // If this node responds with valid HTTP (even 4xx client errors like 404 or 401),
      // it is considered alive and answering for the cluster.
      if (resp.status < 500) {
        return { resp, isFallback: true };
      }
      // If node returns 502/503/504, it might be starting up or in trouble; try next node
    } catch (err) {
      lastError = err;
      // Continue to next node in the pool
    }
  }

  return null;
}
