"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";
import { fetchMe } from "@/lib/api/hooks";
import { setTenantCookie } from "@/lib/tenant/store";
import { getTenantDisplay, type TenantDisplay } from "@/lib/tenant/config";
import { useToast } from "@/lib/ui/Toast";

function TenantCard({
  tenant,
  onSelect,
  loading,
}: {
  tenant: TenantDisplay;
  onSelect: () => void;
  loading: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={loading}
      className="group relative flex w-full flex-col items-center gap-4 rounded-[2rem] border-2 border-border bg-surface p-8 text-center shadow-lg transition-all hover:-translate-y-1 hover:shadow-xl disabled:opacity-60 disabled:hover:translate-y-0"
      style={{ borderColor: loading ? undefined : tenant.color }}
    >
      {/* Logo / inicial */}
      <div
        className="flex h-20 w-20 items-center justify-center rounded-2xl text-3xl font-black text-white shadow-md transition-transform group-hover:scale-105"
        style={{ backgroundColor: tenant.color }}
      >
        {tenant.name.charAt(0)}
      </div>

      {/* Nombre + descripción */}
      <div>
        <h2 className="text-xl font-bold text-text-primary">{tenant.name}</h2>
        <p className="mt-1 text-sm text-text-muted">{tenant.shortDescription}</p>
      </div>

      {/* Badge de características */}
      <div className="flex flex-wrap justify-center gap-1.5">
        <span
          className="rounded-full px-3 py-1 text-xs font-medium text-white"
          style={{ backgroundColor: tenant.color }}
        >
          {tenant.description}
        </span>
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center rounded-[2rem] bg-black/10">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-white border-t-transparent" />
        </div>
      )}
    </button>
  );
}

export default function SelectTenantPage(): JSX.Element {
  const router = useRouter();
  const { addToast } = useToast();
  const availableTenants = useAuthStore((s) => s.availableTenants);
  const setTenant = useAuthStore((s) => s.setTenant);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Protección: si no está autenticado, redirigir al login
  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      router.replace("/login");
    }
  }, [hasHydrated, isAuthenticated, router]);

  // Si está autenticado pero no hay tenants (nunca llamó fetchMe), redirigir
  useEffect(() => {
    if (
      hasHydrated &&
      isAuthenticated &&
      availableTenants.length === 0
    ) {
      router.replace("/");
    }
  }, [hasHydrated, isAuthenticated, availableTenants, router]);

  async function handleSelect(slug: string): Promise<void> {
    setLoadingSlug(slug);
    setError(null);
    try {
      // Setear tenant ANTES del fetch para que X-Tenant viaje en el request
      useAuthStore.setState({ currentTenant: slug });
      setTenantCookie(slug);
      const me = await fetchMe();
      setTenant(slug, me.enabled_features);
      addToast(`Bienvenido a ${getTenantDisplay(slug)?.name ?? slug}`, "success");
      router.push("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al seleccionar negocio";
      setError(msg);
      addToast(msg, "error");
    } finally {
      setLoadingSlug(null);
    }
  }

  const tenants: TenantDisplay[] = availableTenants
    .map((slug) => getTenantDisplay(slug))
    .filter((t): t is TenantDisplay => t !== undefined);

  if (!hasHydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-black text-text-primary tracking-tight">
            Seleccioná un negocio
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Elegí a cuál querés acceder
          </p>
        </div>

        {/* Grid de tenants */}
        <div className="grid gap-6 sm:grid-cols-2">
          {tenants.map((tenant) => (
            <TenantCard
              key={tenant.slug}
              tenant={tenant}
              onSelect={() => handleSelect(tenant.slug)}
              loading={loadingSlug === tenant.slug}
            />
          ))}
        </div>

        {tenants.length === 0 && (
          <p className="mt-8 text-center text-sm text-text-muted">
            No hay negocios disponibles para tu usuario.
          </p>
        )}

        {error && (
          <p className="mt-4 text-center text-sm text-error">{error}</p>
        )}

        {/* Logout */}
        <div className="mt-10 text-center">
          <button
            type="button"
            onClick={() => {
              useAuthStore.getState().logout();
              router.push("/login");
            }}
            className="text-sm text-text-muted underline underline-offset-4 hover:text-text-primary"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </main>
  );
}
