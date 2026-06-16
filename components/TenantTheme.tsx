"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth/store";
import { getTenantDisplay } from "@/lib/tenant/config";

/**
 * Aplica las CSS variables de color del tenant activo al :root.
 * Se monta una vez en el layout autenticado y reacciona a cambios
 * del store de tenant (cuando el usuario alterna entre tenants).
 *
 * Las variables sobreescritas son las que viven en globals.css y que
 * todos los componentes UI usan via Tailwind (bg-primary, text-primary, etc.).
 * Esto permite que el cambio de tenant aplique inmediatamente sin recargar.
 */
export function TenantTheme(): null {
  const currentTenant = useAuthStore((s) => s.currentTenant);

  useEffect(() => {
    if (!currentTenant) return;
    const cfg = getTenantDisplay(currentTenant);
    if (!cfg) return;

    const root = document.documentElement;
    root.style.setProperty("--color-primary", cfg.color);
    root.style.setProperty("--color-primary-dark", darken(cfg.color, 0.15));
    root.style.setProperty("--color-primary-light", lighten(cfg.color, 0.1));
    root.style.setProperty("--color-accent", cfg.accent);
    root.style.setProperty("--color-accent-dark", darken(cfg.accent, 0.15));
    root.style.setProperty("--color-accent-light", lighten(cfg.accent, 0.1));
    root.style.setProperty("--color-chart-1", cfg.color);

    // Theme color para mobile status bar (iOS/Android PWA)
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", cfg.color);
  }, [currentTenant]);

  return null;
}

function darken(hex: string, amount: number): string {
  return shift(hex, -amount);
}

function lighten(hex: string, amount: number): string {
  return shift(hex, amount);
}

function shift(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const next = (c: number): string => {
    const v = Math.max(0, Math.min(255, Math.round(c + (amount > 0 ? (255 - c) * amount : c * amount))));
    return v.toString(16).padStart(2, "0");
  };
  return `#${next(r)}${next(g)}${next(b)}`.toUpperCase();
}
