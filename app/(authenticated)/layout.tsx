"use client";

import { useMemo, useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Navigation, gerenteNavItems, vendedorNavItems, type NavItem } from "@/components/ui/Navigation";
import { useAuthStore } from "@/lib/auth/store";
import { OfflineQueueBadge } from "@/components/OfflineQueueBadge";
import { QueueScheduler } from "@/components/QueueScheduler";
import { TenantTheme } from "@/components/TenantTheme";

function filterNavItems(items: NavItem[], enabledFeatures: string[]): NavItem[] {
  return items.filter((item) => {
    // Inicio y rutas sin feature son siempre visibles
    if (!item.feature) return true;
    // Solo visible si la feature está habilitada
    return enabledFeatures.includes(item.feature);
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
  const currentTenant = useAuthStore((s) => s.currentTenant);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  const items = useMemo(() => {
    const all = role === "vendedor" ? vendedorNavItems() : gerenteNavItems();
    return filterNavItems(all, enabledFeatures);
  }, [role, enabledFeatures]);

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
      <Navigation items={items} role={(role as "vendedor" | "admin" | "gerente") ?? "gerente"} onLogout={handleLogout} />
      <main className="mx-auto w-full max-w-[1800px] px-4 pb-20 pt-4 transition-all duration-200 lg:pb-8 lg:ml-16">
        {children}
      </main>
      <OfflineQueueBadge />
      <QueueScheduler />
    </>
  );
}
