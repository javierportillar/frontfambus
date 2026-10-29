export const PRIMARY_API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.fragloesja.uk";

export const MOTOSHOP_LOCAL_BASE =
  process.env.MOTOSHOP_LOCAL_API_URL ?? "https://motoshop-local.fragloesja.uk";

export const MASVITAL_LOCAL_BASE =
  process.env.MASVITAL_LOCAL_API_URL ?? "https://masvital-local.fragloesja.uk";

export const FALLBACK_API_BASE =
  process.env.FALLBACK_API_URL ?? "https://local-api.fragloesja.uk";

export type BackendNodeId = "render" | "motoshop" | "masvital" | "custom";

export interface BackendNodeInfo {
  id: BackendNodeId;
  name: string;
  url: string;
  isPrimary: boolean;
}

export type NodeHealthStatus = "online" | "suspended" | "offline";

export interface NodeFreshnessInfo {
  status: "OK" | "WARN" | "STALE" | "CRITICAL" | "ERROR";
  backend: string;
  lagHours: number | null;
  fileMtimeUtc: string | null;
  fileSizeBytes?: number | null;
}

export interface ClusterNodeStatus extends BackendNodeInfo {
  status: NodeHealthStatus;
  statusCode: number | null;
  latencyMs: number | null;
  isActive: boolean;
  freshness?: NodeFreshnessInfo | null;
}

export interface ClusterStatus {
  activeNode: BackendNodeInfo | null;
  currentTenant: string | null;
  nodes: ClusterNodeStatus[];
  checkedAt: string;
}

export interface FailoverResult {
  resp: Response;
  isFallback: boolean;
  activeNode: BackendNodeInfo;
}

export function identifyNode(url: string): BackendNodeInfo {
  const normalized = url.toLowerCase();
  if (
    normalized.includes("motoshop-local") ||
    normalized.startsWith(MOTOSHOP_LOCAL_BASE.toLowerCase())
  ) {
    return {
      id: "motoshop",
      name: "PC MotoShop (Local)",
      url: MOTOSHOP_LOCAL_BASE,
      isPrimary: false,
    };
  }
  if (
    normalized.includes("masvital-local") ||
    normalized.startsWith(MASVITAL_LOCAL_BASE.toLowerCase())
  ) {
    return {
      id: "masvital",
      name: "PC MasVital (Local)",
      url: MASVITAL_LOCAL_BASE,
      isPrimary: false,
    };
  }
  if (
    normalized.includes("api.fragloesja.uk") ||
    normalized.startsWith(PRIMARY_API_BASE.toLowerCase()) ||
    normalized.includes("render")
  ) {
    return {
      id: "render",
      name: "Render (Nube)",
      url: PRIMARY_API_BASE,
      isPrimary: true,
    };
  }
  return {
    id: "custom",
    name: "Servidor Personalizado",
    url,
    isPrimary: false,
  };
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

/**
 * Nodo que sirve el ERP de un tenant, y sólo ese.
 *
 * Para escrituras no idempotentes (la venta del POS) no se puede cascadear: el
 * nodo del otro tenant tiene su PROPIA base, así que una venta de MasVital que
 * se reintenta allá queda escrita en el ERP de MotoShop. Devuelve `null` si no
 * hay un nodo propio configurado.
 */
export function resolveTenantNodeBase(tenant: string | null): string | null {
  if (tenant === "masvital") return MASVITAL_LOCAL_BASE || null;
  if (tenant === "motoshop") return MOTOSHOP_LOCAL_BASE || null;
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

/** Stable labels used to pin bank verification jobs to the node that owns them. */
export type BankNodeLabel = "primary" | "motoshop-local" | "masvital-local" | "fallback";

const BANK_NODE_BASES: ReadonlyArray<{ label: BankNodeLabel; base: string }> = [
  { label: "primary", base: PRIMARY_API_BASE },
  { label: "motoshop-local", base: MOTOSHOP_LOCAL_BASE },
  { label: "masvital-local", base: MASVITAL_LOCAL_BASE },
  { label: "fallback", base: FALLBACK_API_BASE },
];

function normalizeBaseForMatch(base: string): string {
  return base.replace(/\/+$/, "").toLowerCase();
}

/** Maps an answering base URL to its stable node label, when known. */
export function bankNodeLabelForBase(base: string): BankNodeLabel | null {
  const normalized = normalizeBaseForMatch(base);
  const match = BANK_NODE_BASES.find(
    (entry) => normalizeBaseForMatch(entry.base) === normalized,
  );
  return match ? match.label : null;
}

/** Maps a node label received from the browser back to its base URL, when known. */
export function bankNodeBaseForLabel(
  label: string | null | undefined,
): string | null {
  if (!label) return null;
  const normalized = label.trim().toLowerCase();
  const match = BANK_NODE_BASES.find((entry) => entry.label === normalized);
  return match ? match.base : null;
}

/**
 * Ordered failover candidates for a tenant: primary first, then the tenant-aware
 * fallback list. Duplicates are collapsed and `skipBase` is removed, so callers
 * never re-query the node that just failed.
 */
export function resolveFailoverCandidateOrder(
  tenant: string | null,
  skipBase: string | null = null,
): string[] {
  const skip = skipBase ? normalizeBaseForMatch(skipBase) : null;
  const ordered = [PRIMARY_API_BASE, ...resolveFallbackUrls(tenant)];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const base of ordered) {
    const normalized = normalizeBaseForMatch(base);
    if (skip !== null && normalized === skip) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(base);
  }

  return result;
}

/**
 * First failover base distinct from `skipBase`, or `null` when no other node is
 * configured. Used for the single fallback attempt after a pinned node dies.
 */
export function resolveDistinctFailoverBase(
  tenant: string | null,
  skipBase: string | null,
): string | null {
  return resolveFailoverCandidateOrder(tenant, skipBase)[0] ?? null;
}

export interface DetailedFailoverResult {
  response: Response;
  /** Base URL (without path) that answered the request. */
  base: string;
  isFallback: boolean;
}

/**
 * Fetch from primary backend with automatic, low-latency failover across redundant
 * fallback nodes (MotoShop PC & MasVital PC).
 * If the primary is down or suspended (502/503/504), it tries candidate fallbacks in priority
 * order until one succeeds.
 *
 * Detailed variant: also reports which base URL answered, so callers can pin
 * subsequent requests (bank job polls) to that exact node.
 */
/**
 * Timeouts por tipo de request.
 *
 * - LLM: respuestas de segundos a minutos (60 s / 50 s).
 * - Venta del POS (`POST /api/pos/sales`): el insert legacy bloquea `contadores`
 *   y escribe varias tablas; con los 5 s por defecto el failover abortaba y el
 *   proxy devolvía el 503 del primario. El cajero veía "rechazó la venta (503)"
 *   y la venta quedaba sin registrar (MasVital, 2026-10-27).
 * - Resto: 8 s / 5 s.
 */
export function resolveTimeoutsForPath(
  normalizedPath: string,
  timeoutMs: number,
  fallbackTimeoutMs: number,
): { timeout: number; fallbackTimeout: number } {
  const isLlm =
    normalizedPath.startsWith("/api/llm") || normalizedPath.startsWith("/llm");
  const isPosSale = normalizedPath === "/api/pos/sales";
  const porDefecto =
    timeoutMs !== 8000 ? timeoutMs : isLlm ? 60000 : isPosSale ? 30000 : 8000;
  const porDefectoFallback =
    fallbackTimeoutMs !== 5000 ? fallbackTimeoutMs : isLlm ? 50000 : isPosSale ? 30000 : 5000;
  return { timeout: porDefecto, fallbackTimeout: porDefectoFallback };
}

export async function fetchWithFailoverDetailed(
  pathAndQuery: string,
  init: RequestInit,
  timeoutMs = 8000,
  fallbackTimeoutMs = 5000,
): Promise<DetailedFailoverResult> {
  const normalizedPath = pathAndQuery.startsWith("/")
    ? pathAndQuery
    : `/${pathAndQuery}`;
  const primaryUrl = `${PRIMARY_API_BASE}${normalizedPath}`;

  const { timeout: effectiveTimeout, fallbackTimeout: effectiveFallbackTimeout } =
    resolveTimeoutsForPath(normalizedPath, timeoutMs, fallbackTimeoutMs);

  const tenant = extractTenant(init.headers);
  const fallbackUrls = resolveFallbackUrls(tenant);

  let primaryResp: Response | null = null;
  let primaryError: unknown = null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

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
        effectiveFallbackTimeout,
      );
      if (fallbackResult) {
        return fallbackResult;
      }
    }

    return {
      response: primaryResp,
      base: PRIMARY_API_BASE,
      isFallback: false,
    };
  } catch (err) {
    primaryError = err;
    if (init.signal?.aborted) {
      throw err;
    }
    if (fallbackUrls.length > 0) {
      const fallbackResult = await executeFallbackCascade(
        fallbackUrls,
        normalizedPath,
        init,
        effectiveFallbackTimeout,
      );
      if (fallbackResult) {
        return fallbackResult;
      }
    }
    throw primaryError;
  }
}

/**
 * Backwards-compatible failover entrypoint. Delegates to the detailed variant
 * and keeps the existing `FailoverResult` shape.
 */
export async function fetchWithFailover(
  pathAndQuery: string,
  init: RequestInit,
  timeoutMs = 8000,
  fallbackTimeoutMs = 5000,
): Promise<FailoverResult> {
  const detailed = await fetchWithFailoverDetailed(
    pathAndQuery,
    init,
    timeoutMs,
    fallbackTimeoutMs,
  );
  return {
    resp: detailed.response,
    isFallback: detailed.isFallback,
    activeNode: identifyNode(detailed.base),
  };
}

/**
 * Sends a request directly to a known base URL, with no failover.
 * Used for node-affinity requests (bank job polls) where a different node
 * would not know the job.
 */
export async function fetchFromBase(
  base: string,
  pathAndQuery: string,
  init: RequestInit,
  timeoutMs = 8000,
): Promise<Response> {
  const normalizedPath = pathAndQuery.startsWith("/")
    ? pathAndQuery
    : `/${pathAndQuery}`;
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

  try {
    return await fetch(`${base}${normalizedPath}`, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * ¿El 5xx del nodo es un error de la aplicación (JSON con `detail`) y no un
 * "nodo caído" (HTML del túnel o del primario)?
 *
 * Sin esto, el failover descartaba el 503 `erp_save_failed` del nodo —que trae
 * el motivo real— y devolvía el 503 en HTML del primario parkeado. El operador
 * veía "Service Unavailable" en vez de "el ERP no pudo guardar".
 */
async function pareceErrorDeAplicacion(resp: Response): Promise<boolean> {
  const tipo = resp.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) return false;
  try {
    const data: unknown = await resp.clone().json();
    const detalle =
      data && typeof data === "object"
        ? (data as Record<string, unknown>).detail
        : undefined;
    return typeof detalle === "string" || (typeof detalle === "object" && detalle !== null);
  } catch {
    return false;
  }
}

async function executeFallbackCascade(
  fallbackUrls: string[],
  path: string,
  init: RequestInit,
  perNodeTimeoutMs = 5000,
): Promise<DetailedFailoverResult | null> {
  for (const baseUrl of fallbackUrls) {
    if (init.signal?.aborted) {
      throw init.signal.reason ?? new DOMException("The operation was aborted", "AbortError");
    }

    const targetUrl = `${baseUrl}${path}`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), perNodeTimeoutMs);

      if (init.signal) {
        init.signal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }

      const resp = await fetch(targetUrl, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // If this node responds with valid HTTP (even 4xx client errors like 404 or 401),
      // it is considered alive and answering for the cluster.
      if (resp.status < 500) {
        return {
          response: resp,
          base: baseUrl,
          isFallback: true,
        };
      }
      // 5xx: si trae un `detail` en JSON es un error de la aplicación y hay que
      // devolverlo tal cual (es la única explicación que va a ver el cajero).
      if (await pareceErrorDeAplicacion(resp)) {
        return { response: resp, base: baseUrl, isFallback: true };
      }
      // Si el nodo devuelve HTML (túnel caído), se prueba el siguiente.
    } catch (err) {
      if (init.signal?.aborted) {
        throw err;
      }
      // Continue to next node in the pool
    }
  }

  return null;
}

async function probeNode(
  baseUrl: string,
  timeoutMs: number,
  tenant: string | null,
): Promise<{
  info: BackendNodeInfo;
  status: NodeHealthStatus;
  statusCode: number | null;
  latencyMs: number | null;
  freshness?: NodeFreshnessInfo | null;
}> {
  const info = identifyNode(baseUrl);
  const targetUrl = `${baseUrl.replace(/\/$/, "")}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startTime = Date.now();

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      signal: controller.signal,
    });
    const latencyMs = Math.max(1, Date.now() - startTime);
    clearTimeout(timer);

    if (res.status < 400) {
      let freshness: NodeFreshnessInfo | null = null;
      try {
        const tenantParam = tenant ? `?tenant=${encodeURIComponent(tenant)}` : "";
        const freshUrl = `${baseUrl.replace(/\/$/, "")}/api/health/data-freshness${tenantParam}`;
        const freshCtrl = new AbortController();
        const freshTimer = setTimeout(() => freshCtrl.abort(), 2000);
        const freshRes = await fetch(freshUrl, {
          method: "GET",
          signal: freshCtrl.signal,
        });
        clearTimeout(freshTimer);
        if (freshRes.ok) {
          const freshJson = await freshRes.json();
          freshness = {
            status: freshJson.status,
            backend: freshJson.backend,
            lagHours: typeof freshJson.lag_hours === "number" ? freshJson.lag_hours : null,
            fileMtimeUtc: freshJson.file_mtime_utc ?? null,
            fileSizeBytes: freshJson.file_size_bytes ?? null,
          };
        }
      } catch {
        // Freshness probe is non-blocking and optional
      }

      return {
        info,
        status: "online",
        statusCode: res.status,
        latencyMs,
        freshness,
      };
    } else if (res.status === 502 || res.status === 503 || res.status === 504) {
      return {
        info,
        status: "suspended",
        statusCode: res.status,
        latencyMs,
        freshness: null,
      };
    } else {
      return {
        info,
        status: "offline",
        statusCode: res.status,
        latencyMs,
        freshness: null,
      };
    }
  } catch {
    clearTimeout(timer);
    return {
      info,
      status: "offline",
      statusCode: null,
      latencyMs: null,
      freshness: null,
    };
  }
}

const clusterStatusCache = new Map<string, { timestamp: number; data: ClusterStatus }>();
const CLUSTER_CACHE_TTL_MS = 5000;

export function clearClusterStatusCache(): void {
  clusterStatusCache.clear();
}

/**
 * Probes all candidate base nodes (Render, MotoShop PC, MasVital PC) on /health in parallel
 * to return live cluster status, latency, and the currently active node for the given tenant.
 * Uses a short 5-second TTL cache to prevent probe storms across concurrent requests.
 */
export async function checkClusterStatus(
  tenant: string | null,
  probeTimeoutMs = 3000,
  skipCache = false,
): Promise<ClusterStatus> {
  const cacheKey = (tenant ?? "_default").toLowerCase();
  const now = Date.now();
  const cached = clusterStatusCache.get(cacheKey);

  if (!skipCache && cached && now - cached.timestamp < CLUSTER_CACHE_TTL_MS) {
    return cached.data;
  }

  const candidateBases = [
    PRIMARY_API_BASE,
    MOTOSHOP_LOCAL_BASE,
    MASVITAL_LOCAL_BASE,
  ];

  const probeResults = await Promise.all(
    candidateBases.map((base) => probeNode(base, probeTimeoutMs, tenant)),
  );

  const renderProbe = probeResults.find((p) => p.info.id === "render");
  const motoshopProbe = probeResults.find((p) => p.info.id === "motoshop");
  const masvitalProbe = probeResults.find((p) => p.info.id === "masvital");

  // Determine active node according to failover cascade:
  // 1. Render primary if online
  // 2. Fallbacks in tenant priority order (MasVital PC first if masvital, else MotoShop PC first)
  let activeNode: BackendNodeInfo | null = null;
  if (renderProbe && renderProbe.status === "online") {
    activeNode = renderProbe.info;
  } else {
    const fallbackPriority =
      tenant?.toLowerCase() === "masvital"
        ? [masvitalProbe, motoshopProbe]
        : [motoshopProbe, masvitalProbe];

    for (const fb of fallbackPriority) {
      if (fb && fb.status === "online") {
        activeNode = fb.info;
        break;
      }
    }
  }

  const nodes: ClusterNodeStatus[] = probeResults.map((p) => ({
    ...p.info,
    status: p.status,
    statusCode: p.statusCode,
    latencyMs: p.latencyMs,
    isActive: activeNode !== null && p.info.id === activeNode.id,
    freshness: p.freshness ?? null,
  }));

  const result: ClusterStatus = {
    activeNode,
    currentTenant: tenant,
    nodes,
    checkedAt: new Date(now).toISOString(),
  };

  clusterStatusCache.set(cacheKey, { timestamp: now, data: result });
  return result;
}
