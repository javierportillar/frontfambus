let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  try {
    const resp = await fetch("/api/auth/refresh", { method: "POST" });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Añade el header X-Tenant si hay un tenant activo en el store.
 * Se importa lazy para evitar circular deps y porque el store solo
 * existe en el cliente.
 */
async function getTenantHeader(): Promise<Record<string, string>> {
  try {
    const { useAuthStore } = await import("@/lib/auth/store");
    const tenant = useAuthStore.getState().currentTenant;
    return tenant ? { "X-Tenant": tenant } : {};
  } catch {
    return {};
  }
}

export async function apiFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const tenantHeaders = await getTenantHeader();
  const resp = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      ...init?.headers,
      ...tenantHeaders,
    },
  });

  if (resp.status === 401) {
    if (!refreshPromise) {
      refreshPromise = doRefresh().finally(() => {
        refreshPromise = null;
      });
    }

    const ok = await refreshPromise;
    if (!ok) {
      // FIX: guardar la URL actual ANTES de limpiar el store para que
      // la página de login pueda redirigir de vuelta después de loguearse.
      const currentPath = typeof window !== "undefined" ? window.location.href : null;
      try {
        const { useAuthStore } = await import("@/lib/auth/store");
        if (currentPath) useAuthStore.getState().setReturnUrl(currentPath);
        useAuthStore.getState().logout();
      } catch {
        // Zustand might not be available in SSR context, ignore
      }
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      return resp;
    }

    // Retry original request with tenant header on the retry too
    const retryHeaders = await getTenantHeader();
    return fetch(input, {
      ...init,
      credentials: "include",
      headers: {
        ...init?.headers,
        ...retryHeaders,
      },
    });
  }

  return resp;
}

export async function apiFetchJson<T = unknown>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const resp = await apiFetch(input, init);
  if (!resp.ok) {
    const body = await resp.text().catch(() => "(no body)");
    throw new Error(`API error ${resp.status} on ${input}: ${body}`);
  }
  return resp.json();
}
