import { get, set, del, clear } from "idb-keyval";

const PREFIX = "motoshop:";
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

function cacheKey(tenant: string, key: string): string {
  return `${PREFIX}${encodeURIComponent(tenant)}:${key}`;
}

/**
 * Reads an offline entry belonging to one tenant only.
 *
 * Tenant is deliberately the first argument: callers must make the data
 * boundary explicit instead of accidentally sharing a URL cache entry between
 * businesses.
 */
export async function getCached<T>(tenant: string, key: string): Promise<T | null> {
  const entryKey = cacheKey(tenant, key);
  try {
    const entry = await get<CacheEntry<T>>(entryKey);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      await del(entryKey);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

export async function setCache<T>(
  tenant: string,
  key: string,
  data: T,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<void> {
  try {
    await set(cacheKey(tenant, key), { data, timestamp: Date.now(), ttl: ttlMs });
  } catch {
    // IndexedDB full or unavailable — silent fail
  }
}

export async function removeCache(tenant: string, key: string): Promise<void> {
  try {
    await del(cacheKey(tenant, key));
  } catch {
    // ignore
  }
}

export async function clearAllCache(): Promise<void> {
  try {
    const keys = await get<string[] | undefined>(PREFIX + "_keys");
    if (keys) {
      await Promise.all(keys.map((k) => del(PREFIX + k)));
    }
    await clear();
  } catch {
    // ignore
  }
}

