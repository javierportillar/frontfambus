"use client";

import { useMemo, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Navigation, gerenteNavItems, type NavItem } from "@/components/ui/Navigation";
import { useAuthStore } from "@/lib/auth/store";
import { OfflineQueueBadge } from "@/components/OfflineQueueBadge";
import { QueueScheduler } from "@/components/QueueScheduler";
import { TenantTheme } from "@/components/TenantTheme";
import { ServerLoadingBanner } from "@/components/ServerLoadingBanner";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchMe } from "@/lib/api/hooks";
import { canAccessPath, resolvePathAccess } from "@/lib/auth/access";

function filterNavItems(
  items: NavItem[],
  enabledFeatures: string[],
  role: string | null,
  allowedModules: string[] | null,
): NavItem[] {
  const context = { role, enabledFeatures, allowedModules };
  return items.filter((item) => {
    // Inicio y rutas sin feature son siempre visibles
    if (!item.feature && !item.adminOnly) return true;
    // La misma matriz protege navegación y URLs directas. En particular,
    // Análisis es visible con `analisis` O `forecast`.
    return canAccessPath(item.href, context);
  });
}

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const enabledFeatures = useAuthStore((s) => s.enabledFeatures);
  const allowedModules = useAuthStore((s) => s.allowedModules);
  const currentTenant = useAuthStore((s) => s.currentTenant);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const permissionsReady = useAuthStore((s) => s.permissionsReady);
  const hydrateSession = useAuthStore((s) => s.hydrateSession);
  const [permissionsError, setPermissionsError] = useState(false);
  const [permissionsAttempt, setPermissionsAttempt] = useState(0);

  const items = useMemo(() => {
    // Todos los no-admin usan el mismo menú completo; los módulos del usuario
    // deciden qué ve (gerencia y empleado). El item "Usuarios" es adminOnly.
    const all = gerenteNavItems();
    return filterNavItems(all, enabledFeatures, role, allowedModules);
  }, [role, enabledFeatures, allowedModules]);

  // Revalidates persisted permissions before mounting a protected page. Hiding
  // navigation is not authorization, but it also must not allow a direct URL to
  // mount and fire restricted data hooks while /auth/me is still unresolved.
  useEffect(() => {
    if (!hasHydrated || !currentTenant) return;
    let cancelled = false;
    setPermissionsError(false);
    fetchMe()
      .then((me) => {
        if (cancelled) return;
        hydrateSession({
          username: me.username,
          role: me.role,
          tenantsAllowed: me.tenants_allowed,
          currentTenant: me.current_tenant || currentTenant,
          enabledFeatures: me.enabled_features,
          allowedModules: me.allowed_modules,
        });
      })
      .catch(() => {
        if (!cancelled) setPermissionsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTenant, hasHydrated, hydrateSession, permissionsAttempt]);

  // FIX: refresh proactivo cada 10 min para que el access token no expire
  // mientras el usuario está activo. Si falla silenciosamente, el flujo
  // normal de 401 en apiFetch se encarga del redirect con ?from=.
  useEffect(() => {
    if (!currentTenant) return; // no correr si no hay tenant activo
    const interval = setInterval(() => {
      fetch("/api/auth/refresh", { method: "POST" }).catch(() => {
        // fallo silencioso — el próximo 401 normal se encarga
      });
    }, 10 * 60 * 1000); // cada 10 minutos
    return () => clearInterval(interval);
  }, [currentTenant]);

  // M2: si el store ya hidrató pero no hay tenant → redirect al picker
  // (caso borde: el middleware no atajó porque la cookie se perdió)
  if (hasHydrated && currentTenant === null) {
    router.replace("/select-tenant");
    return <></>;
  }

  function handleLogout(): void {
    logout();
    router.push("/login");
  }

  const canAccessCurrentPath = permissionsReady && canAccessPath(pathname, {
    role,
    enabledFeatures,
    allowedModules,
  });

  let content: ReactNode;
  if (!permissionsReady && !permissionsError) {
    content = (
      <div className="space-y-3" aria-label="Verificando permisos">
        <Skeleton className="h-8 w-52 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  } else if (permissionsError) {
    content = (
      <section role="alert" className="mx-auto max-w-xl rounded-2xl border border-warning/40 bg-surface p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warning">Sesión sin verificar</p>
        <h1 className="mt-2 text-xl font-bold text-text-primary">No pudimos confirmar tus permisos</h1>
        <p className="mt-2 text-sm text-text-muted">La pantalla protegida no se abrió. Reintentá cuando vuelva la conexión.</p>
        <button
          type="button"
          onClick={() => setPermissionsAttempt((value) => value + 1)}
          className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Reintentar verificación
        </button>
      </section>
    );
  } else if (!canAccessCurrentPath) {
    const rule = resolvePathAccess(pathname);
    const moduleName = rule && "feature" in rule
      ? rule.feature
      : rule && "anyOfFeatures" in rule
        ? rule.anyOfFeatures.join(" o ")
        : "administración";
    content = (
      <section className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="h-1 bg-primary" />
        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Acceso restringido</p>
          <h1 className="mt-2 text-xl font-bold text-text-primary">Este módulo no está habilitado para tu usuario</h1>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            La ruta pertenece a <strong className="text-text-secondary">{moduleName}</strong>. Pedile acceso a un administrador si necesitás trabajar acá.
          </p>
          <p className="mt-3 text-xs text-text-muted">La API también debe validar este permiso; este bloqueo evita cargar la pantalla en el navegador.</p>
          <Link href="/" className="mt-5 inline-flex rounded-lg bg-surface-dark px-4 py-2 text-sm font-semibold text-text-inverse focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            Volver al inicio
          </Link>
        </div>
      </section>
    );
  } else {
    content = children;
  }

  return (
    <>
      <TenantTheme />
      <ServerLoadingBanner />
      <Navigation items={items} role={(role as "vendedor" | "admin" | "gerente") ?? "gerente"} onLogout={handleLogout} />
      <main className="mx-auto w-full max-w-[1800px] px-4 pb-20 pt-4 transition-all duration-200 lg:pb-8 lg:ml-16">
        {content}
      </main>
      <OfflineQueueBadge />
      <QueueScheduler />
    </>
  );
}
