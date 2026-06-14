"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useAuthStore } from "@/lib/auth/store";
import { getTenantDisplay } from "@/lib/tenant/config";
import { Card } from "@/components/ui/Card";

interface FeatureGuardProps {
  /** Feature slug requerido para ver el contenido */
  feature: string;
  /** Nombre legible del dashboard/feature */
  featureName: string;
  /** Contenido a renderizar si la feature está habilitada */
  children: ReactNode;
}

/**
 * FeatureGuard — bloquea una ruta si la feature no está habilitada para
 * el tenant activo. Muestra un empty state informativo en lugar del contenido.
 *
 * Uso: envolver el contenido de cada page.tsx de dashboard.
 *
 * ```tsx
 * <FeatureGuard feature="abc" featureName="ABC">
 *   <AbcContent />
 * </FeatureGuard>
 * ```
 */
export default function FeatureGuard({
  feature,
  featureName,
  children,
}: FeatureGuardProps): JSX.Element {
  const enabledFeatures = useAuthStore((s) => s.enabledFeatures);
  const currentTenant = useAuthStore((s) => s.currentTenant);
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  // Esperar a que Zustand hidrate antes de decidir
  if (!hasHydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  // Si la feature está habilitada → render normal
  if (enabledFeatures.includes(feature)) {
    return <>{children}</>;
  }

  // Feature no disponible → empty state informativo
  const tenantDisplay = currentTenant ? getTenantDisplay(currentTenant) : null;

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <Card className="max-w-md text-center">
        <div className="space-y-4 py-8">
          {/* Icono */}
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-8 w-8 text-text-muted"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" />
            </svg>
          </div>

          <div>
            <h2 className="text-lg font-bold text-text-primary">
              {featureName}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {tenantDisplay
                ? `${featureName} no está disponible para ${tenantDisplay.name} todavía.`
                : `Esta sección aún no está disponible para tu negocio.`}
            </p>
            <p className="mt-1 text-xs text-text-muted/60">
              Se habilitará cuando haya historial de datos suficiente.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg transition-colors hover:bg-primary-light"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Volver al inicio
          </Link>
        </div>
      </Card>
    </div>
  );
}
