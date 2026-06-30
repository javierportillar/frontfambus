"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useInventarioOverview, type InventarioItem } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { AbcLegend } from "@/components/productos/AbcLegend";

type AbcBucket = "A" | "B" | "C" | "sin_clas" | "todos";

const BUCKETS: { key: Exclude<AbcBucket, "todos">; label: string; descLong: string; color: string; bg: string }[] = [
  { key: "A", label: "A — Top 80%", descLong: "Pocos productos que generan ~80% de las ventas. Críticos: no quebrar nunca.", color: "#15803D", bg: "#DCFCE7" },
  { key: "B", label: "B — Medio 15%", descLong: "Siguiente bloque de productos relevantes. Mantener stock cómodo.", color: "#C2410C", bg: "#FFEDD5" },
  { key: "C", label: "C — Cola 5%", descLong: "Productos de baja contribución al ingreso. Candidatos a depurar.", color: "#6B7280", bg: "#F3F4F6" },
  { key: "sin_clas", label: "Sin clasificar", descLong: "Sin ventas en la ventana de cálculo (180d). Capital potencialmente atrapado.", color: "#9CA3AF", bg: "#F9FAFB" },
];

/**
 * Vista del catálogo agrupada por bucket ABC.
 *
 * 4 cards (A / B / C / Sin clasificar) clickeables que filtran la tabla.
 * Por cada bucket: # SKUs, valor en mercancía, % del total y % del catálogo.
 * Tabla con sort por columnas y buscador.
 *
 * Pensado como alternativa visual al catálogo plano: aquí ves "cuánto plata
 * está cada categoría ABC" de un golpe.
 */
export function VistaPorAbc(): JSX.Element {
  const router = useRouter();
  const { data, isLoading } = useInventarioOverview();
  const [bucket, setBucket] = useState<AbcBucket>("todos");
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<"valor" | "stock" | "rotacion" | "nombre">("valor");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState(false);

  const stats = useMemo(() => {
    if (!data) return null;
    const groups: Record<Exclude<AbcBucket, "todos">, { count: number; valor: number; items: InventarioItem[] }> = {
      A: { count: 0, valor: 0, items: [] },
      B: { count: 0, valor: 0, items: [] },
      C: { count: 0, valor: 0, items: [] },
      sin_clas: { count: 0, valor: 0, items: [] },
    };
    for (const it of data.items) {
      const key = (it.abc ?? "sin_clas") as Exclude<AbcBucket, "todos">;
      const g = groups[key];
      if (!g) continue;
      g.count += 1;
      g.valor += it.capital_inmovilizado;
      g.items.push(it);
    }
    const totalValor = data.valor_total_inventario || 1;
    const totalSkus = data.total_skus || 1;
    return { groups, totalValor, totalSkus };
  }, [data]);

  const visibleItems = useMemo(() => {
    if (!stats) return [];
    let pool: InventarioItem[];
    if (bucket === "todos") {
      pool = data?.items ?? [];
    } else {
      pool = stats.groups[bucket].items;
    }
    const q = filter.trim().toLowerCase();
    if (q) {
      pool = pool.filter(
        (it) =>
          it.nom_producto.toLowerCase().includes(q) ||
          it.cod_producto.toLowerCase().includes(q),
      );
    }
    const sorted = [...pool].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "valor") cmp = a.capital_inmovilizado - b.capital_inmovilizado;
      else if (sortKey === "stock") cmp = a.stock - b.stock;
      else if (sortKey === "rotacion") cmp = a.rotacion_diaria - b.rotacion_diaria;
      else if (sortKey === "nombre") cmp = a.nom_producto.localeCompare(b.nom_producto, "es");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [stats, data, bucket, filter, sortKey, sortDir]);

  if (isLoading && !data) return <Card><Skeleton className="h-96 rounded-lg" /></Card>;
  if (!data || !stats) return <Card><p className="py-8 text-center text-sm text-text-muted">Sin datos.</p></Card>;

  const initialLimit = 50;
  const showItems = expanded ? visibleItems : visibleItems.slice(0, initialLimit);

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "nombre" ? "asc" : "desc"); }
  };

  return (
    <div className="space-y-4">
      {/* 4 cards ABC + Todos */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {BUCKETS.map((b) => {
          const g = stats.groups[b.key];
          const pctValor = (g.valor / stats.totalValor) * 100;
          const pctSkus = (g.count / stats.totalSkus) * 100;
          const active = bucket === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => setBucket(active ? "todos" : b.key)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                active
                  ? "border-text-primary bg-surface-alt"
                  : "border-border bg-surface hover:bg-surface-alt"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold"
                  style={{ color: b.color, background: b.bg }}
                >
                  {b.key === "sin_clas" ? "—" : b.key}
                </span>
                <span className="text-xs font-semibold text-text-primary">{b.label}</span>
              </div>
              <div className="mt-2 text-2xl font-bold text-text-primary tabular-nums">
                {g.count.toLocaleString("es-CO")}
                <span className="text-xs text-text-muted font-normal ml-1">SKUs</span>
              </div>
              <div className="text-xs text-text-secondary mt-1">
                Mercancía: <strong>{formatMoneyFull(g.valor)}</strong>
              </div>
              <div className="text-[0.65rem] text-text-muted mt-0.5">
                {pctSkus.toFixed(1)}% del catálogo · {pctValor.toFixed(1)}% del valor
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-surface-alt/40 px-4 py-2 text-xs">
        <AbcLegend />
      </div>

      {/* Botón limpiar filtro si hay bucket activo */}
      {bucket !== "todos" && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">Mostrando solo bucket</span>
          <span className="font-semibold">{BUCKETS.find(b => b.key === bucket)?.label}</span>
          <button
            type="button"
            onClick={() => setBucket("todos")}
            className="text-xs text-accent hover:underline ml-2"
          >
            Limpiar filtro
          </button>
        </div>
      )}

      {/* Buscador + sort */}
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={filter}
            onChange={(e) => { setFilter(e.target.value); setExpanded(false); }}
            placeholder="Buscar producto o SKU..."
            className="flex-1 min-w-[200px] rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
          />
          <div className="flex gap-1">
            <span className="text-xs text-text-muted self-center mr-1">Ordenar:</span>
            <SortPill label="Valor merc." active={sortKey === "valor"} dir={sortDir} onClick={() => handleSort("valor")} />
            <SortPill label="Stock" active={sortKey === "stock"} dir={sortDir} onClick={() => handleSort("stock")} />
            <SortPill label="Rotación" active={sortKey === "rotacion"} dir={sortDir} onClick={() => handleSort("rotacion")} />
            <SortPill label="Nombre" active={sortKey === "nombre"} dir={sortDir} onClick={() => handleSort("nombre")} />
          </div>
        </div>
        <p className="mt-2 text-xs text-text-muted">
          {visibleItems.length.toLocaleString("es-CO")} productos
          {bucket !== "todos" && ` en bucket ${BUCKETS.find(b => b.key === bucket)?.label}`}
          {filter && ` filtrados por "${filter}"`}
        </p>
      </Card>

      {/* Tabla */}
      {visibleItems.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-text-muted">
            {filter ? "Sin resultados para la búsqueda." : "Sin productos en este bucket."}
          </p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-alt text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                  <th className="py-2 px-3">Producto</th>
                  <th className="py-2 px-3">ABC</th>
                  <th className="py-2 px-3 text-right">Stock</th>
                  <th className="py-2 px-3 text-right">Rotación/d</th>
                  <th className="py-2 px-3 text-right">Valor mercancía</th>
                  <th className="py-2 px-3">Acción</th>
                </tr>
              </thead>
              <tbody>
                {showItems.map((it) => (
                  <tr
                    key={it.cod_producto}
                    className="border-b border-border/60 hover:bg-surface-alt cursor-pointer"
                    onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(it.cod_producto)}`)}
                  >
                    <td className="py-2 px-3">
                      <div className="text-text-primary font-medium truncate max-w-md">{it.nom_producto}</div>
                      <div className="text-[0.65rem] text-text-muted">{it.cod_producto}</div>
                    </td>
                    <td className="py-2 px-3">
                      <AbcChipSmall abc={it.abc} />
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {it.stock.toLocaleString("es-CO", { maximumFractionDigits: 2 })}
                      <span className="text-xs text-text-muted ml-1">{it.unidad_medida}</span>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-text-muted">
                      {it.rotacion_diaria.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold text-text-primary">
                      {formatMoneyFull(it.capital_inmovilizado)}
                    </td>
                    <td className="py-2 px-3 text-xs text-text-secondary">
                      {accionLabel(it.accion)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visibleItems.length > initialLimit && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-3 w-full rounded-lg border border-border bg-surface-alt py-2 text-xs font-medium text-text-secondary hover:bg-surface-alt/70"
            >
              {expanded ? "Ver menos" : `Ver todos los ${visibleItems.length.toLocaleString("es-CO")} productos`}
            </button>
          )}
        </Card>
      )}
    </div>
  );
}

function SortPill({ label, active, dir, onClick }: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[0.7rem] ${
        active ? "bg-surface-dark text-text-inverse" : "bg-surface-alt text-text-secondary hover:bg-surface-alt/70"
      }`}
    >
      {label}
      {active && <span className="ml-1">{dir === "desc" ? "↓" : "↑"}</span>}
    </button>
  );
}

function AbcChipSmall({ abc }: { abc: string | null | undefined }): JSX.Element {
  const cfg = abc === "A"
    ? { c: "#15803D", bg: "#DCFCE7", l: "A" }
    : abc === "B"
      ? { c: "#C2410C", bg: "#FFEDD5", l: "B" }
      : abc === "C"
        ? { c: "#6B7280", bg: "#F3F4F6", l: "C" }
        : { c: "#9CA3AF", bg: "#F9FAFB", l: "—" };
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[0.7rem] font-bold"
      style={{ color: cfg.c, background: cfg.bg }}
    >
      {cfg.l}
    </span>
  );
}

function accionLabel(a: string): string {
  const map: Record<string, string> = {
    comprar_ya: "🔴 Comprar ya",
    comprar_pronto: "🟡 Comprar pronto",
    ok: "✅ Sano",
    sobrestock: "📦 Sobrestock",
    liquidar: "🧹 Liquidar",
    zombie_con_stock: "💀 Zombie",
    sin_accion: "—",
  };
  return map[a] ?? a;
}
