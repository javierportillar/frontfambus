"use client";

import { useRouter } from "next/navigation";
import type { ProductAbcMap } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { AbcChip } from "@/components/productos/Chips";

export interface TopProductoItem {
  cod_producto: string;
  nom_producto: string;
  cantidad_total: number;
  valor_total: number;
  porcentaje_ingreso?: number | null;
}

/**
 * Lista de top productos con barra de intensidad, etiqueta ABC (del mapa)
 * y navegación a la ficha del producto al hacer click.
 */
export function TopProductos({
  productos,
  abcMap,
  limit = 10,
}: {
  productos: TopProductoItem[];
  abcMap?: ProductAbcMap;
  limit?: number;
}): JSX.Element {
  const router = useRouter();
  const max = productos[0]?.valor_total ?? 1;

  return (
    <div className="space-y-1.5">
      {productos.slice(0, limit).map((p, idx) => {
        const intensity = max ? p.valor_total / max : 0;
        const abc = abcMap?.productos[p.cod_producto]?.abc;
        return (
          <button
            key={p.cod_producto}
            type="button"
            onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(p.cod_producto)}`)}
            className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-surface-alt"
          >
            <span className="w-5 shrink-0 text-right text-xs font-bold text-text-muted">{idx + 1}</span>
            {abc ? <AbcChip abc={abc} /> : <span className="h-5 w-5 shrink-0" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-text-primary">{p.nom_producto}</div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-alt">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, intensity * 100)}%` }} />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-semibold text-text-primary">{formatMoneyFull(p.valor_total)}</div>
              <div className="text-[0.65rem] text-text-muted">
                {p.cantidad_total.toLocaleString("es-CO")} u
                {p.porcentaje_ingreso != null ? ` · ${p.porcentaje_ingreso.toFixed(1)}%` : ""}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Mezcla de ventas por categoría ABC: cuánto del revenue vino de productos
 * A, B y C en el conjunto dado. Educa sobre qué significa A/B/C.
 */
export function MixAbc({
  productos,
  abcMap,
}: {
  productos: TopProductoItem[];
  abcMap?: ProductAbcMap;
}): JSX.Element | null {
  if (!abcMap) return null;
  const buckets: Record<string, number> = { A: 0, B: 0, C: 0, "sin_venta": 0 };
  let total = 0;
  for (const p of productos) {
    const abc = abcMap.productos[p.cod_producto]?.abc ?? "sin_venta";
    buckets[abc] = (buckets[abc] ?? 0) + p.valor_total;
    total += p.valor_total;
  }
  if (total === 0) return null;
  const cfg = [
    { key: "A", label: "A — top", color: "#15803D" },
    { key: "B", label: "B — medio", color: "#C2410C" },
    { key: "C", label: "C — cola", color: "#6B7280" },
  ];
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full">
        {cfg.map((c) => {
          const pct = ((buckets[c.key] ?? 0) / total) * 100;
          if (pct < 0.5) return null;
          return <div key={c.key} style={{ width: `${pct}%`, background: c.color }} title={`${c.label}: ${pct.toFixed(0)}%`} />;
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {cfg.map((c) => {
          const pct = ((buckets[c.key] ?? 0) / total) * 100;
          return (
            <span key={c.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
              <span className="text-text-secondary">{c.label}</span>
              <strong className="text-text-primary">{pct.toFixed(0)}%</strong>
            </span>
          );
        })}
      </div>
    </div>
  );
}
