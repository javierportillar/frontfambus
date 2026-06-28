"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductAbcMap } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { AbcChip } from "@/components/productos/Chips";

// Shape común que recibe la tabla. Acepta:
// - {cod_producto, nom_producto, cantidad_total, valor_total, porcentaje_ingreso?}
//   (formato de sales-monthly y sales-historical-products)
// - {sku, nombre, cantidad, valor}
//   (formato de sales-day-detail)
// El componente normaliza ambos.
export interface ProductoVendido {
  cod_producto?: string;
  nom_producto?: string;
  cantidad_total?: number;
  valor_total?: number;
  porcentaje_ingreso?: number | null;
  sku?: string;
  nombre?: string;
  cantidad?: number;
  valor?: number;
}

type SortKey = "valor" | "cantidad" | "nombre";
type SortDir = "asc" | "desc";

interface Props {
  productos: ProductoVendido[];
  abcMap?: ProductAbcMap;
  /** Cantidad inicial visible. Default 10. El user puede expandir a todo. */
  initialLimit?: number;
  /** Mostrar barra de intensidad debajo del nombre. Default true. */
  showIntensityBar?: boolean;
  /** Total de SKUs disponibles si los `productos` que vinieron están truncados.
   * Si está seteado y es mayor que productos.length, el botón "Ver todos"
   * dispara una recarga vía `onLoadAll` para traer todo. */
  totalAvailable?: number;
  /** Callback opcional para traer todos los productos cuando el user expande
   * más allá de los que ya están cargados. Si no se provee, expand solo
   * muestra los que ya están en `productos`. */
  onLoadAll?: () => void;
  /** Estado de carga del onLoadAll (mientras viene la respuesta del backend) */
  loadingAll?: boolean;
  /** Si verdadero, productos.length representa TODOS los productos disponibles
   * (no se necesita pedir más al backend). */
  isFullDataset?: boolean;
}

/**
 * Tabla de productos vendidos, ordenable por columnas y expansible.
 *
 * Importante: muestra **cantidad VENDIDA** (unidades del mart de ventas),
 * NO stock. La fuente es gold_mart_ventas_diarias_sku.
 *
 * Responsive: en mobile se muestra como cards stackeadas; en desktop como
 * tabla con columnas alineadas.
 */
export function ProductosVendidosTabla({
  productos,
  abcMap,
  initialLimit = 10,
  showIntensityBar = true,
  totalAvailable,
  onLoadAll,
  loadingAll = false,
  isFullDataset = false,
}: Props): JSX.Element {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<SortKey>("valor");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expanded, setExpanded] = useState(false);

  // Normalizar shape: aceptar tanto {cod_producto/nom_producto/cantidad_total/valor_total}
  // como {sku/nombre/cantidad/valor}
  const normalized = useMemo(() => {
    return productos.map((p) => ({
      cod: p.cod_producto ?? p.sku ?? "",
      nom: p.nom_producto ?? p.nombre ?? "",
      cantidad: p.cantidad_total ?? p.cantidad ?? 0,
      valor: p.valor_total ?? p.valor ?? 0,
      pct: p.porcentaje_ingreso ?? null,
    }));
  }, [productos]);

  const sorted = useMemo(() => {
    const arr = [...normalized];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "valor") cmp = a.valor - b.valor;
      else if (sortKey === "cantidad") cmp = a.cantidad - b.cantidad;
      else if (sortKey === "nombre") cmp = a.nom.localeCompare(b.nom, "es");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [normalized, sortKey, sortDir]);

  const totalLoaded = sorted.length;
  const total = totalAvailable && totalAvailable > totalLoaded ? totalAvailable : totalLoaded;
  const canShowMore = total > initialLimit;
  const visible = expanded ? sorted : sorted.slice(0, initialLimit);
  const maxValor = normalized.reduce((m, p) => (p.valor > m ? p.valor : m), 1);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Por defecto: cantidad/valor desc (lo más vendido primero), nombre asc
      setSortDir(key === "nombre" ? "asc" : "desc");
    }
  };

  const handleExpand = () => {
    if (!expanded && onLoadAll && !isFullDataset && totalLoaded < (totalAvailable ?? totalLoaded)) {
      // Pedir el dataset completo al backend
      onLoadAll();
    }
    setExpanded((v) => !v);
  };

  if (productos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-muted">
        Sin productos vendidos en el período.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar: orden + contador */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
        <div>
          {expanded
            ? `Mostrando ${visible.length} de ${total} productos`
            : `Top ${Math.min(initialLimit, totalLoaded)} de ${total} productos`}
        </div>
        <div className="flex items-center gap-1">
          <span className="hidden sm:inline">Ordenar por:</span>
          <SortPill label="Vendido $" active={sortKey === "valor"} dir={sortDir} onClick={() => handleSort("valor")} />
          <SortPill label="Cantidad" active={sortKey === "cantidad"} dir={sortDir} onClick={() => handleSort("cantidad")} />
          <SortPill label="Nombre" active={sortKey === "nombre"} dir={sortDir} onClick={() => handleSort("nombre")} />
        </div>
      </div>

      {/* Desktop: tabla con headers clicables */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
              <th className="w-10 py-2 px-3 text-right">#</th>
              <th className="w-8 py-2 px-1">ABC</th>
              <ThSortable label="Producto" active={sortKey === "nombre"} dir={sortDir} onClick={() => handleSort("nombre")} />
              <ThSortable label="Cantidad vendida" active={sortKey === "cantidad"} dir={sortDir} onClick={() => handleSort("cantidad")} align="right" />
              <ThSortable label="Vendido $" active={sortKey === "valor"} dir={sortDir} onClick={() => handleSort("valor")} align="right" />
              <th className="py-2 px-3 text-right w-16">% ing.</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p, idx) => {
              const intensity = maxValor ? p.valor / maxValor : 0;
              const abc = abcMap?.productos[p.cod]?.abc;
              return (
                <tr
                  key={p.cod || `${p.nom}-${idx}`}
                  className="border-b border-border/60 hover:bg-surface-alt cursor-pointer"
                  onClick={() => p.cod && router.push(`/dashboards/productos/${encodeURIComponent(p.cod)}`)}
                >
                  <td className="py-2 px-3 text-right text-xs text-text-muted tabular-nums">{idx + 1}</td>
                  <td className="py-2 px-1">{abc ? <AbcChip abc={abc} /> : null}</td>
                  <td className="py-2 px-3">
                    <div className="truncate text-text-primary font-medium">{p.nom}</div>
                    {showIntensityBar && (
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-alt">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, intensity * 100)}%` }} />
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-text-primary">
                    {p.cantidad.toLocaleString("es-CO", { maximumFractionDigits: 2 })}{" "}
                    <span className="text-xs text-text-muted">u</span>
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold text-text-primary">
                    {formatMoneyFull(p.valor)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-xs text-text-muted">
                    {p.pct != null ? `${p.pct.toFixed(1)}%` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards stackeadas */}
      <div className="md:hidden space-y-2">
        {visible.map((p, idx) => {
          const intensity = maxValor ? p.valor / maxValor : 0;
          const abc = abcMap?.productos[p.cod]?.abc;
          return (
            <button
              key={p.cod || `${p.nom}-${idx}`}
              type="button"
              onClick={() => p.cod && router.push(`/dashboards/productos/${encodeURIComponent(p.cod)}`)}
              className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-alt"
            >
              <div className="flex items-start gap-2">
                <span className="w-6 shrink-0 text-right text-xs font-bold text-text-muted">{idx + 1}</span>
                {abc ? <AbcChip abc={abc} /> : <span className="h-5 w-5 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-text-primary truncate">{p.nom}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-muted">
                    <span>
                      Cantidad vendida:{" "}
                      <span className="font-semibold text-text-primary">
                        {p.cantidad.toLocaleString("es-CO", { maximumFractionDigits: 2 })} u
                      </span>
                    </span>
                    <span>
                      Vendido:{" "}
                      <span className="font-semibold text-text-primary">{formatMoneyFull(p.valor)}</span>
                    </span>
                    {p.pct != null && <span>{p.pct.toFixed(1)}% ingreso</span>}
                  </div>
                  {showIntensityBar && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-alt">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, intensity * 100)}%` }} />
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Expand / collapse */}
      {canShowMore && (
        <button
          type="button"
          onClick={handleExpand}
          disabled={loadingAll}
          className="w-full rounded-lg border border-border bg-surface-alt py-2 text-xs font-medium text-text-secondary hover:bg-surface-alt/70 disabled:opacity-50"
        >
          {loadingAll
            ? "Cargando todos los productos..."
            : expanded
              ? "Ver menos"
              : `Ver todos los ${total} productos`}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SortPill({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[0.7rem] transition-colors ${
        active
          ? "bg-surface-dark text-text-inverse"
          : "bg-surface-alt text-text-secondary hover:bg-surface-alt/70"
      }`}
    >
      {label}
      {active && <span className="ml-1">{dir === "desc" ? "↓" : "↑"}</span>}
    </button>
  );
}

function ThSortable({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: "left" | "right";
}): JSX.Element {
  return (
    <th
      onClick={onClick}
      className={`py-2 px-3 cursor-pointer select-none hover:text-text-primary ${
        align === "right" ? "text-right" : ""
      }`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active ? <span>{dir === "desc" ? "↓" : "↑"}</span> : <span className="opacity-30">↕</span>}
      </span>
    </th>
  );
}
