"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useInventarioOverview, type InventarioItem } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";

type SortKey = "ingreso" | "rotacion" | "sugerido" | "cobertura";

export function ComprarTab(): JSX.Element {
  const [leadTime, setLeadTime] = useState(7);
  const [colchon, setColchon] = useState(14);
  const { data, isLoading } = useInventarioOverview(leadTime, colchon);
  const [sortKey, setSortKey] = useState<SortKey>("ingreso");
  const [filter, setFilter] = useState("");

  const buckets = useMemo(() => {
    if (!data) return null;
    const compYa = data.items.filter((i) => i.accion === "comprar_ya");
    const compPronto = data.items.filter((i) => i.accion === "comprar_pronto");
    return { compYa, compPronto };
  }, [data]);

  const sortFn = (a: InventarioItem, b: InventarioItem): number => {
    if (sortKey === "ingreso") return b.ingreso_perdido_estimado - a.ingreso_perdido_estimado;
    if (sortKey === "rotacion") return b.rotacion_diaria - a.rotacion_diaria;
    if (sortKey === "sugerido") return b.sugerido_comprar - a.sugerido_comprar;
    if (sortKey === "cobertura") return (a.cobertura_dias ?? Infinity) - (b.cobertura_dias ?? Infinity);
    return 0;
  };

  const matchesFilter = (it: InventarioItem) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return it.nom_producto.toLowerCase().includes(q) || it.cod_producto.toLowerCase().includes(q);
  };

  if (isLoading && !data) return <Card><Skeleton className="h-96 rounded-lg" /></Card>;
  if (!data || !buckets) return <Card><p className="py-8 text-center text-sm text-text-muted">Sin datos.</p></Card>;

  // KPIs derivados
  const totalPerdidoYa = buckets.compYa.reduce((s, i) => s + i.ingreso_perdido_estimado, 0);
  const totalCostoSugerido = [...buckets.compYa, ...buckets.compPronto].reduce(
    (s, i) => s + i.sugerido_comprar * i.costo_unit,
    0,
  );

  const yaSorted = [...buckets.compYa].filter(matchesFilter).sort(sortFn);
  const prontoSorted = [...buckets.compPronto].filter(matchesFilter).sort(sortFn);

  return (
    <div className="space-y-4">
      {/* Header explicativo */}
      <div className="rounded-lg border border-border bg-surface-alt/40 px-4 py-3 text-sm">
        <p className="text-text-secondary">
          Decisión: <strong>¿qué pido al proveedor esta semana?</strong> Cantidades sugeridas basadas en
          rotación de los últimos 90 días × (lead time + colchón).
        </p>
      </div>

      {/* KPIs + controles */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <Stat
            label="Productos para comprar YA"
            value={buckets.compYa.length.toLocaleString("es-CO")}
            subtitle={`perdiendo ${formatMoneyFull(totalPerdidoYa)}/mes`}
          />
        </Card>
        <Card>
          <Stat
            label="Productos a comprar PRONTO"
            value={buckets.compPronto.length.toLocaleString("es-CO")}
            subtitle={`cobertura <${leadTime} días al ritmo actual`}
          />
        </Card>
        <Card>
          <Stat
            label="Costo total estimado"
            value={formatMoneyFull(totalCostoSugerido)}
            subtitle="si comprás todo lo sugerido"
          />
        </Card>
      </div>

      {/* Controles: lead time + colchón + filtro */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-text-muted">
            Lead time del proveedor (días)
            <input
              type="number"
              min={1}
              max={90}
              value={leadTime}
              onChange={(e) => setLeadTime(Math.max(1, Math.min(90, Number(e.target.value) || 7)))}
              className="mt-1 block w-24 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs text-text-muted">
            Colchón de seguridad (días)
            <input
              type="number"
              min={0}
              max={180}
              value={colchon}
              onChange={(e) => setColchon(Math.max(0, Math.min(180, Number(e.target.value) || 14)))}
              className="mt-1 block w-24 rounded-lg border border-border bg-surface px-2 py-1 text-sm"
            />
          </label>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar SKU o nombre..."
            className="flex-1 min-w-[200px] rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
          />
          <div className="flex gap-1">
            <SortPill label="Pérdida $" active={sortKey === "ingreso"} onClick={() => setSortKey("ingreso")} />
            <SortPill label="Cobertura" active={sortKey === "cobertura"} onClick={() => setSortKey("cobertura")} />
            <SortPill label="Rotación" active={sortKey === "rotacion"} onClick={() => setSortKey("rotacion")} />
            <SortPill label="Sugerido" active={sortKey === "sugerido"} onClick={() => setSortKey("sugerido")} />
          </div>
        </div>
        <p className="mt-2 text-[0.65rem] text-text-muted">
          Fórmula: sugerido = rotación × ({leadTime}d lead + {colchon}d colchón) − stock actual
        </p>
      </Card>

      {/* Comprar YA */}
      <Card header={
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-red-700">🔴 COMPRAR YA — sin stock y se venden</h2>
          <span className="text-xs text-text-muted">{yaSorted.length} de {buckets.compYa.length}</span>
        </div>
      }>
        {yaSorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-secondary">
            🎉 No hay productos en quiebre. Buen trabajo.
          </p>
        ) : (
          <ProductTable items={yaSorted} urgencia="ya" />
        )}
      </Card>

      {/* Comprar pronto */}
      <Card header={
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-amber-700">🟡 COMPRAR PRONTO — stock se acabará pronto</h2>
          <span className="text-xs text-text-muted">{prontoSorted.length} de {buckets.compPronto.length}</span>
        </div>
      }>
        {prontoSorted.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-secondary">
            ✅ Ningún producto con riesgo de quiebre próximo.
          </p>
        ) : (
          <ProductTable items={prontoSorted} urgencia="pronto" />
        )}
      </Card>
    </div>
  );
}

function SortPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[0.7rem] ${
        active ? "bg-surface-dark text-text-inverse" : "bg-surface-alt text-text-secondary hover:bg-surface-alt/70"
      }`}
    >
      {label}
    </button>
  );
}

function ProductTable({ items, urgencia }: { items: InventarioItem[]; urgencia: "ya" | "pronto" }): JSX.Element {
  const router = useRouter();
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
              <th className="py-2 px-3">Producto</th>
              <th className="py-2 px-3">ABC</th>
              <th className="py-2 px-3 text-right">Stock</th>
              <th className="py-2 px-3 text-right">Rotación/día</th>
              {urgencia === "pronto" && <th className="py-2 px-3 text-right">Cobertura</th>}
              <th className="py-2 px-3 text-right">Sugerido</th>
              <th className="py-2 px-3 text-right">Costo compra</th>
              {urgencia === "ya" && <th className="py-2 px-3 text-right">Pérdida/mes</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr
                key={it.cod_producto}
                className="border-b border-border/60 hover:bg-surface-alt cursor-pointer"
                onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(it.cod_producto)}`)}
              >
                <td className="py-2 px-3">
                  <div className="text-text-primary font-medium">{it.nom_producto}</div>
                  <div className="text-[0.65rem] text-text-muted">{it.cod_producto}</div>
                </td>
                <td className="py-2 px-3 text-xs text-text-muted">{it.abc ?? "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {it.stock.toLocaleString("es-CO", { maximumFractionDigits: 2 })}{" "}
                  <span className="text-xs text-text-muted">{it.unidad_medida}</span>
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-text-muted">
                  {it.rotacion_diaria.toFixed(2)}
                </td>
                {urgencia === "pronto" && (
                  <td className="py-2 px-3 text-right tabular-nums">
                    {it.cobertura_dias ?? "—"}d
                  </td>
                )}
                <td className="py-2 px-3 text-right tabular-nums font-semibold text-text-primary">
                  {it.sugerido_comprar} {it.unidad_medida}
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-text-muted">
                  {formatMoneyFull(it.sugerido_comprar * it.costo_unit)}
                </td>
                {urgencia === "ya" && (
                  <td className="py-2 px-3 text-right tabular-nums font-semibold text-red-700">
                    {formatMoneyFull(it.ingreso_perdido_estimado)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {items.map((it) => (
          <button
            key={it.cod_producto}
            type="button"
            onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(it.cod_producto)}`)}
            className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-left"
          >
            <div className="text-sm font-medium text-text-primary truncate">{it.nom_producto}</div>
            <div className="text-[0.65rem] text-text-muted">{it.cod_producto} · ABC: {it.abc ?? "—"}</div>
            <div className="mt-1.5 grid grid-cols-2 gap-1 text-xs">
              <span>Stock: <strong>{it.stock} {it.unidad_medida}</strong></span>
              <span>Rotación: <strong>{it.rotacion_diaria.toFixed(2)}/día</strong></span>
              <span>Sugerido: <strong className="text-text-primary">{it.sugerido_comprar} {it.unidad_medida}</strong></span>
              <span>Costo: <strong>{formatMoneyFull(it.sugerido_comprar * it.costo_unit)}</strong></span>
              {urgencia === "ya" && (
                <span className="col-span-2 text-red-700">Pérdida: {formatMoneyFull(it.ingreso_perdido_estimado)}/mes</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
