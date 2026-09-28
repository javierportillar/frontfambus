import type { ReactNode } from "react";

type DeltaDirection = "up" | "down" | "neutral";

interface StatProps {
  /** Etiqueta superior (ej: "Ventas del mes") */
  label: string;
  /** Valor principal (ej: "$12.4M") */
  value: string;
  /** Texto secundario debajo del valor */
  subtitle?: string;
  /** Variación porcentual (ej: 5.2 = +5.2%) */
  delta?: number | null;
  /** Etiqueta del delta (ej: "vs mes anterior") */
  deltaLabel?: string;
  /** Icono opcional (renderiza en bg-primary/10) */
  icon?: ReactNode;
  className?: string;
}

function deltaDirection(d: number): DeltaDirection {
  if (d > 0) return "up";
  if (d < 0) return "down";
  return "neutral";
}

const deltaStyles: Record<DeltaDirection, string> = {
  up: "bg-delta-positive/10 text-delta-positive",
  down: "bg-delta-negative/10 text-delta-negative",
  neutral: "bg-text-muted/10 text-text-muted",
};

const deltaArrows: Record<DeltaDirection, string> = {
  up: "↑",
  down: "↓",
  neutral: "→",
};

/**
 * Stat — KPI individual del design system MotoShop.
 *
 * Muestra label, valor principal, delta opcional, e icono.
 * Consumido por KpiGrid y dashboards.
 * Los colores de delta usan tokens semánticos (delta-positive, delta-negative).
 */
export function Stat({
  label,
  value,
  subtitle,
  delta,
  deltaLabel,
  icon,
  className = "",
}: StatProps): JSX.Element {
  const dir = delta !== null && delta !== undefined ? deltaDirection(delta) : null;

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      {/* Fila superior: label + icono */}
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p className="min-w-0 break-words text-xs font-medium uppercase leading-tight tracking-wider text-text-muted">
          {label}
        </p>
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        )}
      </div>

      {/* Valor principal */}
      <p className="break-words text-xl font-bold leading-tight text-text-primary sm:text-2xl">{value}</p>

      {/* Fila inferior: delta + label o subtitle */}
      {(dir || subtitle) && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {dir && delta !== null && delta !== undefined && (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium ${deltaStyles[dir]}`}
            >
              {deltaArrows[dir]} {Math.abs(delta).toFixed(1)}%
            </span>
          )}
          {deltaLabel && (
            <span className="min-w-0 break-words text-text-muted">{deltaLabel}</span>
          )}
          {subtitle && !deltaLabel && (
            <span className="min-w-0 break-words leading-snug text-text-muted">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  );
}
