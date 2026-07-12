"use client";

import { useMemo, useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Navigation, gerenteNavItems, type NavItem } from "@/components/ui/Navigation";
import { useAuthStore } from "@/lib/auth/store";
import { OfflineQueueBadge } from "@/components/OfflineQueueBadge";
import { QueueScheduler } from "@/components/QueueScheduler";
import { TenantTheme } from "@/components/TenantTheme";
import { ServerLoadingBanner } from "@/components/ServerLoadingBanner";

function filterNavItems(
  items: NavItem[],
  enabledFeatures: string[],
  role: string | null,
  allowedModules: string[] | null,
): NavItem[] {
  const isAdmin = role === "admin";
  return items.filter((item) => {
    // Rutas de gestión: sólo admin
    if (item.adminOnly) return isAdmin;
    // Inicio y rutas sin feature son siempre visibles
    if (!item.feature) return true;
    // Debe estar habilitada por el tenant
    if (!enabledFeatures.includes(item.feature)) return false;
    // admin o usuario sin restricción de módulos (heredado) → ve todo lo del tenant
    if (isAdmin || allowedModules === null) return true;
    // Usuario restringido → sólo sus módulos permitidos
    return allowedModules.includes(item.feature);
  });
}

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const router = useRouter();
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);
  const enabledFeatures = useAuthStore((s) => s.enabledFeatures);
  const allowedModules = useAuthStore((s) => s.allowedModules);
  const currentTenant = useAuthStore((s) => s.currentTenant);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  const items = useMemo(() => {
    // Todos los no-admin usan el mismo menú completo; los módulos del usuario
    // deciden qué ve (gerencia y empleado). El item "Usuarios" es adminOnly.
    const all = gerenteNavItems();
    return filterNavItems(all, enabledFeatures, role, allowedModules);
  }, [role, enabledFeatures, allowedModules]);

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

  return (
    <>
      <TenantTheme />
      <ServerLoadingBanner />
      <Navigation items={items} role={(role as "vendedor" | "admin" | "gerente") ?? "gerente"} onLogout={handleLogout} />
      <main className="mx-auto w-full max-w-[1800px] px-4 pb-20 pt-4 transition-all duration-200 lg:pb-8 lg:ml-16">
        {children}
      </main>
      <OfflineQueueBadge />
      <QueueScheduler />
    </>
  );
}
