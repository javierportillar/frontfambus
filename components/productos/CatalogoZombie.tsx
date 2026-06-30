"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProductosZombie } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Productos que NUNCA se vendieron desde que entraron al catálogo.
 *
 * Distinto a 'dormidos' (vendían y dejaron de vender). Aquí la acción
 * típica es liquidación, devolución al proveedor o descatalogación.
 * Muestra el capital_inmovilizado total para que el usuario vea
 * cuánta plata está atrapada.
 */
export function CatalogoZombie(): JSX.Element {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const pageSize = expanded ? 500 : 10;
  const { data, isLoading } = useProductosZombie(1, pageSize);

  if (isLoading && !data) return <Card><Skeleton className="h-64 rounded-lg" /></Card>;
  if (!data) return <Card><p className="py-8 text-center text-sm text-text-muted">Sin datos.</p></Card>;

  if (data.total === 0) {
    return (
      <Card header={<h2 className="font-semibold text-text-primary">Catálogo zombie</h2>}>
        <p className="py-8 text-center text-sm text-text-secondary">
          🎉 Todos los productos del catálogo han tenido al menos una venta. Catálogo limpio.
        </p>
      </Card>
    );
  }

  return (
    <Card header={
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-text-primary">Catálogo zombie</h2>
          <p className="text-xs text-text-muted">SKUs que nunca se vendieron</p>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-text-primary">{data.total.toLocaleString("es-CO")}</div>
          <div className="text-[0.65rem] text-text-muted">productos</div>
        </div>
      </div>
    }>
      <div className="mb-3 rounded-lg border border-red-200 bg-red-50/50 px-3 py-2 text-sm">
        <p className="text-text-secondary">
          💰 <strong>Capital inmovilizado:</strong>{" "}
          <span className="font-bold text-red-700">{formatMoneyFull(data.capital_inmovilizado)}</span>
          {" "}— productos comprados pero nunca vendidos.
        </p>
        <p className="mt-1 text-xs text-text-muted">
          Acciones típicas: liquidación con descuento, devolución al proveedor, descatalogación.
        </p>
      </div>

      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
              <th className="py-2 px-3">SKU</th>
              <th className="py-2 px-3">Producto</th>
              <th className="py-2 px-3 text-right">Stock</th>
              <th className="py-2 px-3 text-right">Costo unit.</th>
              <th className="py-2 px-3 text-right">Capital invertido</th>
              <th className="py-2 px-3 text-right">Días en catálogo</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <tr
                key={p.cod_producto}
                className="border-b border-border/60 hover:bg-surface-alt cursor-pointer"
                onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(p.cod_producto)}`)}
              >
                <td className="py-2 px-3 text-xs text-text-muted tabular-nums">{p.cod_producto}</td>
                <td className="py-2 px-3 text-text-primary">{p.nom_producto || "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {p.stock_actual.toLocaleString("es-CO", { maximumFractionDigits: 2 })}{" "}
                  <span className="text-xs text-text-muted">{p.unidad_medida}</span>
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-text-muted">
                  {formatMoneyFull(p.costo_unitario)}
                </td>
                <td className="py-2 px-3 text-right tabular-nums font-semibold text-red-700">
                  {formatMoneyFull(p.capital_invertido)}
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-text-muted">
                  {p.dias_en_catalogo != null ? `${p.dias_en_catalogo}d` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {data.items.map((p) => (
          <button
            key={p.cod_producto}
            type="button"
            onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(p.cod_producto)}`)}
            className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-left hover:bg-surface-alt"
          >
            <div className="text-sm font-medium text-text-primary truncate">{p.nom_producto || "—"}</div>
            <div className="text-[0.65rem] text-text-muted tabular-nums">{p.cod_producto}</div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              <span className="text-text-secondary">
                Stock: <strong>{p.stock_actual} {p.unidad_medida}</strong>
              </span>
              <span className="text-red-700">
                Capital: <strong>{formatMoneyFull(p.capital_invertido)}</strong>
              </span>
              {p.dias_en_catalogo != null && (
                <span className="text-text-muted">{p.dias_en_catalogo}d en catálogo</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {data.total > 10 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full rounded-lg border border-border bg-surface-alt py-2 text-xs font-medium text-text-secondary hover:bg-surface-alt/70"
        >
          {expanded ? "Ver menos" : `Ver todos los ${data.total} productos zombie`}
        </button>
      )}
    </Card>
  );
}
