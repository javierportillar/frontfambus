import { getCached, setCache } from "./cache";

const CACHE_TTL_CATALOG_MS = 60 * 60 * 1000; // 1 hour
const CACHE_TTL_STOCK_MS = 5 * 60 * 1000; // 5 min (used only when offline)

export async function fetchWithStrategy<T>(
  tenant: string,
  url: string,
  strategy: "stale-while-revalidate" | "network-only",
  fallbackTtlMs?: number,
): Promise<T | null> {
  if (strategy === "network-only") {
    try {
      const resp = await fetch(url, { credentials: "include" });
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data: T = await resp.json();
      // Cache the latest known value for offline fallback
      await setCache(tenant, url, data, fallbackTtlMs ?? CACHE_TTL_STOCK_MS);
      return data;
    } catch {
      // Offline — return last known cached value
      return getCached<T>(tenant, url);
    }
  }

  // StaleWhileRevalidate
  const cached = await getCached<T>(tenant, url);

  // Fetch in background to update cache
  fetch(url, { credentials: "include" })
    .then(async (resp) => {
      if (resp.ok) {
        const data = await resp.json();
        await setCache(tenant, url, data, CACHE_TTL_CATALOG_MS);
      }
    })
    .catch(() => {
      // Offline — cached value already returned
    });

  return cached;
}

export function isOnline(): boolean {
  return typeof navigator !== "undefined" ? navigator.onLine : true;
}
