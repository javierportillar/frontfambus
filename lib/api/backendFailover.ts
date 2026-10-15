export const PRIMARY_API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.fragloesja.uk";

export const FALLBACK_API_BASE =
  process.env.FALLBACK_API_URL ?? "https://local-api.fragloesja.uk";

export interface FailoverResult {
  resp: Response;
  isFallback: boolean;
}

/**
 * Fetch from primary backend with automatic, low-latency failover to a fallback backend
 * if the primary responds with 502/503/504 (e.g. Render suspended/over quota) or encounters network error.
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
  const fallbackUrl = `${FALLBACK_API_BASE}${normalizedPath}`;

  const hasFallback =
    Boolean(FALLBACK_API_BASE) && FALLBACK_API_BASE !== PRIMARY_API_BASE;

  let primaryResp: Response | null = null;
  let primaryError: unknown = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    // If caller provided an AbortSignal, abort when caller aborts
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

    // Failover if primary returned gateway or service unavailable (502, 503, 504)
    if (
      hasFallback &&
      (primaryResp.status === 502 ||
        primaryResp.status === 503 ||
        primaryResp.status === 504)
    ) {
      const fallbackResp = await fetch(fallbackUrl, init);
      return { resp: fallbackResp, isFallback: true };
    }

    return { resp: primaryResp, isFallback: false };
  } catch (err) {
    primaryError = err;
    if (hasFallback) {
      try {
        const fallbackResp = await fetch(fallbackUrl, init);
        return { resp: fallbackResp, isFallback: true };
      } catch (fallbackErr) {
        // Both primary and fallback failed; rethrow primary error for consistency
        throw primaryError ?? fallbackErr;
      }
    }
    throw primaryError;
  }
}
