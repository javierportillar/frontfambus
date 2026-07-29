import { createHash } from "node:crypto";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.fragloesja.uk";
const AUTHORIZATION_TTL_MS = 15_000;

interface CatalogAuthorizationInput {
  accessToken: string | null | undefined;
  requestedTenant: string | null | undefined;
  fetcher?: typeof fetch;
}

export type CatalogAuthorization =
  | { allowed: true; status: 200 }
  | { allowed: false; status: 401 | 403 | 502 };

interface AuthenticatedIdentity {
  tenants_allowed?: unknown;
  current_tenant?: unknown;
}

interface CachedAuthorization {
  expiresAt: number;
  result: Promise<CatalogAuthorization>;
}

const authorizationCache = new Map<string, CachedAuthorization>();

function authorizationCacheKey(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("base64url");
}

async function verifyMasVitalIdentity(
  accessToken: string,
  fetcher: typeof fetch,
): Promise<CatalogAuthorization> {
  try {
    const response = await fetcher(`${API_BASE}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Tenant": "masvital",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        allowed: false,
        status:
          response.status === 401 ? 401 : response.status === 403 ? 403 : 502,
      };
    }

    const identity = (await response.json()) as AuthenticatedIdentity;
    const allowedTenants = Array.isArray(identity.tenants_allowed)
      ? identity.tenants_allowed.filter(
          (tenant): tenant is string => typeof tenant === "string",
        )
      : [];
    const activeTenantIsValid =
      identity.current_tenant === undefined ||
      identity.current_tenant === "masvital";

    if (!allowedTenants.includes("masvital") || !activeTenantIsValid) {
      return { allowed: false, status: 403 };
    }

    return { allowed: true, status: 200 };
  } catch {
    return { allowed: false, status: 502 };
  }
}

export function resetCatalogAuthorizationCacheForTests(): void {
  authorizationCache.clear();
}

export async function authorizeMasVitalCatalog({
  accessToken,
  requestedTenant,
  fetcher = fetch,
}: CatalogAuthorizationInput): Promise<CatalogAuthorization> {
  if (!accessToken) return { allowed: false, status: 401 };
  if (requestedTenant !== "masvital") return { allowed: false, status: 403 };

  // Injected fetchers are deliberately uncached so unit tests and explicit
  // callers always observe the exact upstream response they supplied.
  if (fetcher !== fetch) {
    return verifyMasVitalIdentity(accessToken, fetcher);
  }

  const now = Date.now();
  const key = authorizationCacheKey(accessToken);
  const cached = authorizationCache.get(key);
  if (cached && cached.expiresAt > now) return cached.result;
  if (cached) authorizationCache.delete(key);

  const result = verifyMasVitalIdentity(accessToken, fetcher).then(
    (authorization) => {
      // Never cache denials or backend failures: access recovery and revocation
      // semantics must remain fail-closed and immediately observable.
      if (!authorization.allowed) authorizationCache.delete(key);
      return authorization;
    },
  );
  authorizationCache.set(key, {
    expiresAt: now + AUTHORIZATION_TTL_MS,
    result,
  });
  return result;
}
