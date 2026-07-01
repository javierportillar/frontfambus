"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAnalisisProductos, type AnalisisProductoItem } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";

type Ranking = "revenue" | "margen" | "unidades" | "compras";

interface Props {
  ini: string;
  fin: string;
}

export function ProductosTopTab({ ini, fin }: Props): JSX.Element {
  const { data, isLoading } = useAnalisisProductos(ini, fin, 50);
  const [ranking, setRanking] = useState<Ranking>("revenue");
  const router = useRouter();

  const items: AnalisisProductoItem[] = useMemo(() => {
    if (!data) return [];
    if (ranking === "revenue") return data.top_revenue;
    if (ranking === "margen") return data.top_margen;
    if (ranking === "compras") return data.top_compras ?? [];
    return data.top_unidades;
  }, [data, ranking]);

  if (isLoading && !data) return <Card><Skeleton className="h-96 rounded-lg" /></Card>;
  if (!data) return <Card><Skeleton className="h-32 rounded-lg" /></Card>;
  if (data.total_skus_vendidos === 0) {
    return <Card><p className="py-12 text-center text-sm text-text-muted">Sin ventas en el período.</p></Card>;
  }

  const pareto = data.pareto;
  const paretoColor = pareto.pct_skus < 25 ? "#DC2626" : pareto.pct_skus < 40 ? "#C2410C" : "#16A34A";
  const paretoInsight = pareto.pct_skus < 25
    ? "Muy concentrado — pocos SKUs sostienen todo. Cuidá esos productos."
    : pareto.pct_skus < 40
      ? "Concentración saludable — el Pareto clásico se cumple."
      : "Bien distribuido — más SKUs participan del 80%, menos riesgo de quiebres clave.";

  return (
    <div className="space-y-4">
      {/* KPIs agregados */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <Stat
            label="Revenue vendido"
            value={formatMoneyFull(data.total_revenue)}
            subtitle={`${data.total_skus_vendidos.toLocaleString("es-CO")} SKUs · ${data.total_unidades.toLocaleString("es-CO", { maximumFractionDigits: 0 })} u`}
          />
        </Card>
        <Card>
          <Stat
            label="Total comprado"
            value={formatMoneyFull(data.total_compras_periodo ?? 0)}
            subtitle={`${(data.total_skus_comprados ?? 0).toLocaleString("es-CO")} SKUs reabastecidos`}
          />
        </Card>
        <Card>
          <Stat
            label="Margen total"
            value={formatMoneyFull(data.total_margen)}
            subtitle={data.margen_promedio_pct != null ? `${data.margen_promedio_pct}% del revenue` : ""}
          />
        </Card>
        <Card>
          <Stat
            label="Pareto 80/20"
            value={`${pareto.pct_skus}%`}
            subtitle={`${pareto.skus_para_80_pct} SKUs generan el 80% del revenue`}
          />
        </Card>
      </div>

      {/* Pareto visual */}
      <Card header={<h2 className="font-semibold text-text-primary">📊 Regla 80/20 — concentración de ventas</h2>}>
        <div className="mb-3">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular-nums" style={{ color: paretoColor }}>
              {pareto.skus_para_80_pct}
            </span>
            <span className="text-text-secondary">de {pareto.total_skus} SKUs generan el 80% de tus ventas</span>
          </div>
          <p className="mt-1 text-sm text-text-secondary">{paretoInsight}</p>
        </div>
        <div className="flex h-4 overflow-hidden rounded-full border border-border">
          <div className="bg-primary" style={{ width: `${Math.min(pareto.pct_skus, 100)}%` }} title={`${pareto.pct_skus}% de los SKUs = 80% del revenue`} />
          <div className="flex-1 bg-surface-alt" />
        </div>
        <div className="mt-1 flex justify-between text-[0.65rem] text-text-muted">
          <span>{pareto.pct_skus}% SKUs = 80% revenue</span>
          <span>resto: {(100 - pareto.pct_skus).toFixed(1)}% SKUs = 20% revenue</span>
        </div>
      </Card>

      {/* Selector ranking + lista */}
      <Card header={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-text-primary">🏆 Top 50 productos</h2>
          <div className="flex flex-wrap gap-1">
            <RankPill label="🟢 Por revenue $" active={ranking === "revenue"} onClick={() => setRanking("revenue")} />
            <RankPill label="🟢 Por margen $" active={ranking === "margen"} onClick={() => setRanking("margen")} />
            <RankPill label="🟢 Por unidades" active={ranking === "unidades"} onClick={() => setRanking("unidades")} />
            <RankPill label="🔵 Por compras $" active={ranking === "compras"} onClick={() => setRanking("compras")} />
          </div>
        </div>
      }>
        <p className="mb-2 text-xs text-text-muted">
          🟢 = lado venta (qué aporta a tus ingresos) · 🔵 = lado compra (en qué gastaste reposición)
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                <th className="py-2 px-3">#</th>
                <th className="py-2 px-3">Producto</th>
                <th className="py-2 px-3 text-right">Vendido $</th>
                <th className="py-2 px-3 text-right">Margen $</th>
                <th className="py-2 px-3 text-right">Margen %</th>
                <th className="py-2 px-3 text-right">Comprado $</th>
                <th className="py-2 px-3 text-right">Ratio v/c</th>
                {data.periodo_comparado && <th className="py-2 px-3 text-right">vs prev</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((p, idx) => {
                const ratio = p.ratio_venta_compra;
                const ratioColor = ratio == null
                  ? "text-text-muted"
                  : ratio >= 1.5 ? "text-green-700 font-semibold"
                  : ratio >= 1 ? "text-text-primary"
                  : ratio >= 0.5 ? "text-amber-600"
                  : "text-red-600";
                return (
                  <tr
                    key={p.cod_producto}
                    className="border-b border-border/60 hover:bg-surface-alt cursor-pointer"
                    onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(p.cod_producto)}`)}
                  >
                    <td className="py-2 px-3 text-xs text-text-muted tabular-nums">{idx + 1}</td>
                    <td className="py-2 px-3">
                      <div className="text-text-primary font-medium truncate max-w-md">{p.nom_producto}</div>
                      <div className="text-[0.65rem] text-text-muted">
                        {p.cod_producto} ·{" "}
                        {p.unidades.toLocaleString("es-CO", { maximumFractionDigits: 0 })} {p.unidad_medida ?? "u"} vendidas
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold">{formatMoneyFull(p.revenue)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-green-700 font-semibold">
                      {formatMoneyFull(p.margen)}
                    </td>
                    <td className={`py-2 px-3 text-right tabular-nums ${(p.margen_pct ?? 0) >= 30 ? "text-green-700" : (p.margen_pct ?? 0) >= 15 ? "text-amber-600" : "text-red-600"}`}>
                      {p.margen_pct != null ? `${p.margen_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums text-text-secondary">
                      {(p.valor_comprado ?? 0) > 0 ? formatMoneyFull(p.valor_comprado ?? 0) : "—"}
                    </td>
                    <td className={`py-2 px-3 text-right tabular-nums text-xs ${ratioColor}`} title="Revenue / Compras del período">
                      {ratio != null ? ratio.toFixed(2) : "—"}
                    </td>
                    {data.periodo_comparado && (
                      <td className={`py-2 px-3 text-right tabular-nums text-xs ${(p.delta_pct ?? 0) > 0 ? "text-green-700" : (p.delta_pct ?? 0) < 0 ? "text-red-600" : "text-text-muted"}`}>
                        {p.delta_pct != null ? `${p.delta_pct > 0 ? "+" : ""}${p.delta_pct.toFixed(1)}%` : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[0.65rem] text-text-muted">
          <strong>Ratio v/c</strong>: revenue / compras del período. ≥1.5 verde (rota muy bien) · 1-1.5 ok ·
          0.5-1 lento · &lt;0.5 rojo (sobrecomprado). &ldquo;—&rdquo; cuando no hay compra en el período.
        </p>
      </Card>

      {/* Crecimiento vs período anterior */}
      {data.periodo_comparado && (data.top_ganadores.length > 0 || data.top_perdedores.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card header={<h2 className="font-semibold text-green-700">📈 Top crecimiento — ganadores</h2>}>
            <p className="mb-2 text-xs text-text-muted">
              Productos que más crecieron vs período {data.periodo_comparado.inicio} → {data.periodo_comparado.fin}
            </p>
            {data.top_ganadores.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">Sin productos nuevos con crecimiento significativo.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.top_ganadores.map((p) => (
                  <li
                    key={p.cod_producto}
                    onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(p.cod_producto)}`)}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-1.5 cursor-pointer hover:bg-surface-alt"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-text-primary truncate">{p.nom_producto}</div>
                      <div className="text-[0.65rem] text-text-muted">
                        {formatMoneyFull(p.revenue_prev ?? 0)} → {formatMoneyFull(p.revenue)}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-green-700 shrink-0">
                      +{p.delta_pct?.toFixed(0)}%
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card header={<h2 className="font-semibold text-red-700">📉 Top caída — perdedores</h2>}>
            <p className="mb-2 text-xs text-text-muted">
              Productos que más cayeron vs período anterior
            </p>
            {data.top_perdedores.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">Sin caídas relevantes.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.top_perdedores.map((p) => (
                  <li
                    key={p.cod_producto}
                    onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(p.cod_producto)}`)}
                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-1.5 cursor-pointer hover:bg-surface-alt"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-text-primary truncate">{p.nom_producto}</div>
                      <div className="text-[0.65rem] text-text-muted">
                        {formatMoneyFull(p.revenue_prev ?? 0)} → {formatMoneyFull(p.revenue)}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-red-700 shrink-0">
                      {p.delta_pct?.toFixed(0)}%
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function RankPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): JSX.Element {
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
