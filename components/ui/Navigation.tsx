"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";
import { LogoMark } from "@/components/Logo";
import { useAuthStore } from "@/lib/auth/store";
import { useUIStore } from "@/lib/ui/store";
import { getTenantDisplay } from "@/lib/tenant/config";

// ─── Tipos ──────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  /** Feature slug que habilita esta ruta (M2). undefined = siempre visible */
  feature?: string;
}

interface NavigationProps {
  /** Items de navegación (ya filtrados por enabledFeatures fuera de este componente) */
  items: NavItem[];
  /** Rol del usuario (vendedor | admin | gerente) */
  role?: "vendedor" | "admin" | "gerente";
  /** Acción de logout */
  onLogout?: () => void;
  className?: string;
}

// ─── Iconos inline SVG — sin dependencia de librería ────────────

const Icons = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  ),
  ventas: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path d="M3 20h18M3 14l4-4 3 3 5-5 3 3" />
    </svg>
  ),
  inventario: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  productos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path d="M20 7L12 3 4 7v10l8 4 8-4V7z" />
      <path d="M4 7l8 4 8-4M12 11v10" />
    </svg>
  ),
  abc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path d="M12 20V10M18 20V4M6 20v-6" />
    </svg>
  ),
  dormidos: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
  forecast: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path d="M3 3v18h18" />
      <path d="M7 16l4-5 3 2 4-6" />
    </svg>
  ),
  alerts: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  ),
  acciones: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  ),
  planCompras: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 01-8 0" />
    </svg>
  ),
  compras: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  ),
  tenantSwitch: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
      <path d="M8 7h12M8 12h12M8 17h12" />
      <circle cx="4" cy="7" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="17" r="1" fill="currentColor" />
    </svg>
  ),
};

const iconMap: Record<string, ReactNode> = {
  home: Icons.home,
  ventas: Icons.ventas,
  compras: Icons.compras,
  inventario: Icons.inventario,
  abc: Icons.abc,
  dormidos: Icons.dormidos,
  forecast: Icons.forecast,
  alerts: Icons.alerts,
  acciones: Icons.acciones,
  "plan-compras": Icons.planCompras,
};

// ─── Sidebar Desktop (≥ lg) ─────────────────────────────────────

function Sidebar({
  items,
  role,
  onLogout,
  isActive,
  collapsed,
  onToggle,
}: {
  items: NavItem[];
  role?: string;
  onLogout?: () => void;
  isActive: (href: string) => boolean;
  collapsed: boolean;
  onToggle: () => void;
}): JSX.Element {
  const router = useRouter();
  const currentTenant = useAuthStore((s) => s.currentTenant);
  const availableTenants = useAuthStore((s) => s.availableTenants);
  const clearTenant = useAuthStore((s) => s.clearTenant);
  const tenantDisplay = currentTenant ? getTenantDisplay(currentTenant) : null;

  function handleCambiarNegocio(): void {
    clearTenant();
    router.push("/select-tenant");
  }

  return (
    <aside
      className={`hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 flex-col transition-all duration-300 ${
        collapsed ? "lg:w-16" : "lg:w-60"
      }`}
    >
      <div
        className={`flex grow flex-col gap-y-5 overflow-y-auto bg-surface-dark transition-all duration-300 ${
          collapsed ? "px-2 py-6" : "px-4 py-6"
        }`}
      >
        {/* Marca — solo LogoMark cuando colapsado */}
        <div
          className={`flex items-center gap-3 ${
            collapsed ? "justify-center px-0" : "px-2"
          }`}
        >
          <LogoMark size={28} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-text-inverse tracking-tight">
                {tenantDisplay?.name ?? "MotoShop"}
              </p>
              <p className="text-[0.625rem] text-text-muted uppercase tracking-widest">
                {role === "vendedor" ? "Vendedor" : "Gerencia"}
              </p>
              {currentTenant && (
                <p className="mt-0.5 truncate text-[0.6rem] text-text-muted/60">
                  {tenantDisplay?.description ?? currentTenant}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Separador */}
        <div className="h-px bg-gradient-to-r from-surface-dark-alt via-border-strong/30 to-surface-dark-alt" />

        {/* Navegación */}
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`group flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
                } ${
                  active
                    ? "bg-primary text-primary-fg shadow-sm"
                    : "text-text-muted hover:bg-surface-dark-alt hover:text-text-inverse"
                }`}
              >
                <span
                  className={`transition-transform duration-200 ${
                    active ? "" : "group-hover:translate-x-0.5"
                  }`}
                >
                  {item.icon}
                </span>

                {!collapsed && (
                  <>
                    <span className="flex-1">{item.label}</span>
                    {active && (
                      <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white/60" />
                    )}
                  </>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer — tenant switch + logout + toggle */}
        <div className="space-y-1">
          <div className="h-px bg-surface-dark-alt" />

          {currentTenant && availableTenants.length > 1 && (
            <button
              onClick={handleCambiarNegocio}
              title={collapsed ? "Cambiar negocio" : undefined}
              className={`flex w-full items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
                collapsed
                  ? "justify-center px-2 py-2.5"
                  : "px-3 py-2.5"
              } text-text-muted hover:bg-surface-dark-alt hover:text-text-inverse`}
            >
              {Icons.tenantSwitch}
              {!collapsed && <span>Cambiar negocio</span>}
            </button>
          )}

          {onLogout && (
            <button
              onClick={onLogout}
              title={collapsed ? "Salir" : undefined}
              className={`flex w-full items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
                collapsed
                  ? "justify-center px-2 py-2.5"
                  : "px-3 py-2.5"
              } text-text-muted hover:bg-error/10 hover:text-error`}
            >
              {Icons.logout}
              {!collapsed && <span>Salir</span>}
            </button>
          )}

          {/* Toggle colapsar/expandir */}
          <button
            onClick={onToggle}
            title={collapsed ? "Expandir menú" : "Colapsar menú"}
            className="flex w-full items-center justify-center rounded-lg py-2 text-text-muted transition-colors hover:bg-surface-dark-alt hover:text-text-inverse"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className={`h-4 w-4 transition-transform duration-300 ${
                collapsed ? "" : "rotate-180"
              }`}
            >
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Bottom Nav Mobile (< lg) ───────────────────────────────────

function BottomNav({
  items,
  isActive,
  onLogout,
}: {
  items: NavItem[];
  isActive: (href: string) => boolean;
  onLogout?: () => void;
}): JSX.Element {
  const router = useRouter();
  const currentTenant = useAuthStore((s) => s.currentTenant);
  const availableTenants = useAuthStore((s) => s.availableTenants);
  const clearTenant = useAuthStore((s) => s.clearTenant);
  const tenantDisplay = currentTenant ? getTenantDisplay(currentTenant) : null;

  const [open, setOpen] = useState(false);
  const primaryItems = items.slice(0, 4);
  const menuItems = items.slice(4);
  const hasMenuItems = menuItems.length > 0;
  const menuActive = menuItems.some((item) => isActive(item.href));
  const canSwitchTenant = currentTenant && availableTenants.length > 1;
  const showMasButton = hasMenuItems || canSwitchTenant || !!onLogout;

  function handleCambiarNegocio(): void {
    setOpen(false);
    clearTenant();
    router.push("/select-tenant");
  }

  function handleLogout(): void {
    setOpen(false);
    onLogout?.();
  }

  return (
    <>
      {open && showMasButton && (
        <div className="fixed inset-0 z-50 bg-black/45 lg:hidden" onClick={() => setOpen(false)}>
          <div
            className="absolute inset-x-3 bottom-[4.6rem] max-h-[72vh] overflow-hidden rounded-[1.75rem] border border-white/10 bg-surface-dark text-text-inverse shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-4">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-white/40">
                  {hasMenuItems ? "Menú" : "Cuenta"}
                </p>
                <h2 className="mt-1 text-lg font-black">
                  {hasMenuItems ? "Todas las secciones" : "Tu negocio"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/70"
              >
                Cerrar
              </button>
            </div>

            <div className="max-h-[calc(72vh-4.5rem)] overflow-y-auto p-3 pb-5">
              <div className="grid grid-cols-2 gap-2">
                {menuItems.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex min-h-[4.75rem] flex-col justify-between rounded-2xl border px-3 py-3 transition-all ${
                        active
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-white/10 bg-white/[0.04] text-white/75 active:bg-white/10"
                      }`}
                    >
                      <span>{item.icon}</span>
                      <span className="text-sm font-bold leading-tight">{item.label}</span>
                    </Link>
                  );
                })}
              </div>

              {/* BUG-FIX 2026-06-16: en mobile no se podia cambiar de
                  negocio porque el sidebar es lg-only. Agregamos un
                  bloque "Cuenta" al pie del menu modal con el negocio
                  actual + botones Cambiar negocio y Salir.

                  BUG-FIX 2026-06-15: MasVital solo tiene 4 items de
                  navegacion, por lo que el boton "Mas" no se mostraba
                  (dependia de items.slice(4).length > 0). Se cambio
                  la condicion a showMasButton que tambien considera
                  canSwitchTenant y onLogout. */}
              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="px-1 text-[0.65rem] font-semibold uppercase tracking-[0.24em] text-white/40">
                  Cuenta
                </p>
                {currentTenant && (
                  <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary/20 text-primary font-bold text-xs">
                      {(tenantDisplay?.name ?? currentTenant).slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">
                        {tenantDisplay?.name ?? currentTenant}
                      </p>
                      <p className="truncate text-[0.65rem] text-white/50">
                        {tenantDisplay?.description ?? "Negocio activo"}
                      </p>
                    </div>
                  </div>
                )}
                <div className="mt-2 space-y-1">
                  {canSwitchTenant && (
                    <button
                      type="button"
                      onClick={handleCambiarNegocio}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/80 transition-colors active:bg-white/10"
                    >
                      {Icons.tenantSwitch}
                      <span>Cambiar negocio</span>
                    </button>
                  )}
                  {onLogout && (
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-300 transition-colors active:bg-red-500/10"
                    >
                      {Icons.logout}
                      <span>Salir</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-surface-dark-alt bg-surface-dark lg:hidden">
        {/* Safe area para iOS. Mobile muestra 4 accesos rápidos + menú desplegable con todo. */}
        <div className="pb-[env(safe-area-inset-bottom,0px)]">
          <div className="flex items-stretch gap-1 px-2 pb-1 pt-1.5">
            {primaryItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-all ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-text-muted hover:bg-surface-dark-alt hover:text-text-inverse"
                  }`}
                >
                  <span className="transition-transform duration-150 active:scale-90">
                    {item.icon}
                  </span>
                  <span className="max-w-[72px] truncate text-[0.625rem] font-medium leading-tight">
                    {item.label}
                  </span>
                  {active && (
                    <span className="absolute top-0 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
            {showMasButton && (
              <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 transition-all ${
                  open || menuActive
                    ? "bg-primary/15 text-primary"
                    : "text-text-muted hover:bg-surface-dark-alt hover:text-text-inverse"
                }`}
                aria-expanded={open}
                aria-label={hasMenuItems ? "Abrir menú de secciones" : "Abrir opciones de cuenta"}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
                <span className="max-w-[72px] truncate text-[0.625rem] font-medium leading-tight">
                  Más
                </span>
                {(open || menuActive) && (
                  <span className="absolute top-0 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-primary" />
                )}
              </button>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}

// ─── Navigation ─────────────────────────────────────────────────

/**
 * Navigation — sistema de navegación adaptable MotoShop.
 *
 * Mobile (< lg): bottom nav con 4 accesos rápidos + menú "Más" con todas las secciones.
 * Desktop (≥ lg): sidebar fijo izquierdo con items completos + logo + logout.
 *
 * Diseño industrial: fondo surface-dark #171717, acero texturizado,
 * active state en rojo primary, hover con desplazamiento sutil.
 */
export function Navigation({
  items,
  role = "gerente",
  onLogout,
  className = "",
}: NavigationProps): JSX.Element {
  const pathname = usePathname();
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);

  const isActive = (href: string): boolean => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  // Enriquecer items con iconos del mapa
  const enrichedItems: NavItem[] = items.map((item) => ({
    ...item,
    icon: item.icon ?? iconMap[item.href.replace(/^\/|\/$/g, "")] ?? Icons.home,
  }));

  return (
    <div className={className}>
      {/* Sidebar desktop — colapsable */}
      <Sidebar
        items={enrichedItems}
        role={role}
        onLogout={onLogout}
        isActive={isActive}
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
      />

      {/* Bottom nav mobile */}
      <BottomNav items={enrichedItems} isActive={isActive} onLogout={onLogout} />
    </div>
  );
}

// ─── Helpers para construir items ────────────────────────────────

/**
 * Define qué feature habilita cada ruta del menú de gerencia.
 * Si feature es undefined, la ruta es siempre visible.
 */
export function gerenteNavItems(): NavItem[] {
  // V1.17: ABC, Plan Compras y Dormidos consolidados en Inventario (4 tabs).
  // Las rutas viejas redirigen automáticamente (ver app/dashboards/.../page.tsx).
  return [
    { label: "Inicio", href: "/", icon: Icons.home },
    { label: "Ventas", href: "/dashboards/ventas", icon: Icons.ventas, feature: "ventas-summary" },
    { label: "Productos", href: "/dashboards/productos", icon: Icons.productos, feature: "inventario" },
    { label: "Compras", href: "/dashboards/compras", icon: Icons.compras, feature: "inventario" },
    { label: "Inventario", href: "/dashboards/inventario", icon: Icons.inventario, feature: "inventario" },
    { label: "Análisis", href: "/dashboards/analisis", icon: Icons.forecast },
    { label: "Forecast", href: "/forecast", icon: Icons.forecast, feature: "forecast" },
    { label: "Alertas", href: "/alerts", icon: Icons.alerts, feature: "alerts" },
    { label: "Acciones", href: "/acciones", icon: Icons.acciones, feature: "acciones" },
    { label: "Cohortes", href: "/cohortes", icon: Icons.home, feature: "cohortes" },
    { label: "Vendedores", href: "/vendedores", icon: Icons.home, feature: "vendedores" },
    { label: "Drift", href: "/drift", icon: Icons.alerts, feature: "drift" },
    { label: "Pipeline", href: "/admin/pipeline", icon: Icons.home, feature: "pipeline-observability" },
    { label: "Catálogo de datos", href: "/admin/data-catalog", icon: Icons.home, feature: "data-catalog" },
  ];
}

export function vendedorNavItems(): NavItem[] {
  return [
    { label: "Inicio", href: "/", icon: Icons.home },
    { label: "Alertas", href: "/alerts", icon: Icons.alerts, feature: "alerts" },
    { label: "Acciones", href: "/acciones", icon: Icons.acciones, feature: "acciones" },
  ];
}
