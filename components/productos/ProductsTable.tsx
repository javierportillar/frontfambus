"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProductAnalytics, type ProductMetric } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { diasStockLabel } from "@/lib/productos/display";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EstadoChip, AbcChip, AccionChip } from "@/components/productos/Chips";

const ESTADO_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "saludable", label: "Saludables" },
  { value: "quiebre", label: "Por agotarse" },
  { value: "agotado", label: "Agotados" },
  { value: "sobrestock", label: "Sobrestock" },
  { value: "dormido", label: "Dormidos" },
  { value: "sin_movimiento", label: "Sin movimiento" },
];

const SORTS: { value: string; label: string }[] = [
  { value: "revenue_win", label: "Más vendidos ($)" },
  { value: "unidades_win", label: "Más vendidos (u)" },
  { value: "valor_inventario", label: "Valor en inventario" },
  { value: "cantidad_actual", label: "Stock actual" },
  { value: "velocidad_mensual", label: "Velocidad" },
  { value: "dias_stock", label: "Días de stock" },
  { value: "dias_sin_venta", label: "Días sin vender" },
  { value: "margen_pct", label: "Margen %" },
];

interface ProductsTableProps {
  window: number;
  /** Filtro de estado inicial (lo setean las decision cards). */
  initialEstado?: string;
  initialAbc?: string;
}

export function ProductsTable({ window, initialEstado = "", initialAbc = "" }: ProductsTableProps): JSX.Element {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState(initialEstado);
  const [abc, setAbc] = useState(initialAbc);
  const [sort, setSort] = useState("revenue_win");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading } = useProductAnalytics({ window, page, pageSize, q, estado, abc, sort, order });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  function toggleSort(col: string): void {
    if (sort === col) {
      setOrder((o) => (o === "desc" ? "asc" : "desc"));
    } else {
      setSort(col);
      setOrder("desc");
    }
    setPage(1);
  }

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-text-primary">Todos los productos</h2>
          <span className="text-xs text-text-muted">{data ? `${data.total.toLocaleString("es-CO")} productos` : ""}</span>
        </div>
      }
    >
      {/* Controles */}
      <div className="mb-3 flex flex-col gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Buscar por nombre o código…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={estado}
            onChange={(e) => { setEstado(e.target.value); setPage(1); }}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text-primary"
          >
            {ESTADO_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select
            value={abc}
            onChange={(e) => { setAbc(e.target.value); setPage(1); }}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text-primary"
          >
            <option value="">ABC: Todos</option>
            <option value="A">Solo A (top ventas)</option>
            <option value="B">Solo B</option>
            <option value="C">Solo C</option>
          </select>
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text-primary"
          >
            {SORTS.map((s) => <option key={s.value} value={s.value}>Orden: {s.label}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setOrder((o) => (o === "desc" ? "asc" : "desc"))}
            className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-alt"
          >
            {order === "desc" ? "↓ Mayor primero" : "↑ Menor primero"}
          </button>
        </div>
      </div>

      {isLoading && !data ? (
        <Skeleton className="h-96 rounded-lg" />
      ) : data && data.items.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                  <th className="py-2 pr-2">Producto</th>
                  <th className="px-2 text-center">ABC</th>
                  <th className="px-2 text-right">Stock</th>
                  <th className="px-2 text-right">Vendido ({window}d)</th>
                  <th className="px-2 text-right">Velocidad</th>
                  <th className="px-2 text-right">Días stock</th>
                  <th className="px-2 text-right">Valor inv.</th>
                  <th className="px-2 text-center">Estado</th>
                  <th className="px-2 text-center">Acción</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p: ProductMetric) => (
                  <tr
                    key={p.cod_producto}
                    onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(p.cod_producto)}?window=${window}`)}
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-surface-alt"
                  >
                    <td className="py-2 pr-2">
                      <div className="font-medium text-text-primary leading-tight max-w-[260px] truncate">{p.nombre}</div>
                      <div className="text-[0.65rem] text-text-muted">{p.cod_producto}{p.rank_rev ? ` · #${p.rank_rev} en ventas` : ""}</div>
                    </td>
                    <td className="px-2 text-center"><AbcChip abc={p.abc} /></td>
                    <td className="px-2 text-right tabular-nums">{p.cantidad_actual.toLocaleString("es-CO")}</td>
                    <td className="px-2 text-right tabular-nums">
                      <div>{formatMoneyFull(p.revenue_win)}</div>
                      <div className="text-[0.65rem] text-text-muted">{p.unidades_win.toLocaleString("es-CO")} u · {p.pct_revenue.toFixed(1)}%</div>
                    </td>
                    <td className="px-2 text-right tabular-nums text-xs">{p.velocidad_mensual.toLocaleString("es-CO")}/mes</td>
                    <td className="px-2 text-right tabular-nums text-xs">{diasStockLabel(p.dias_stock)}</td>
                    <td className="px-2 text-right tabular-nums">{formatMoneyFull(p.valor_inventario)}</td>
                    <td className="px-2 text-center"><EstadoChip estado={p.estado} /></td>
                    <td className="px-2 text-center"><AccionChip accion={p.accion} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
            <span>Página {page} de {totalPages}</span>
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-surface-alt"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-border px-3 py-1.5 disabled:opacity-40 hover:bg-surface-alt"
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      ) : (
        <p className="py-12 text-center text-sm text-text-muted">Sin productos para este filtro.</p>
      )}
    </Card>
  );
}
