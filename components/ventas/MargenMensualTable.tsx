"use client";

import { useMemo, useState } from "react";
import { useSalesHistoryExtended, type HistoryMonth } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

const MONTHS_LABEL = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function mesLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  const idx = Number(m) - 1;
  return `${MONTHS_LABEL[idx] ?? m} ${String(y).slice(2)}`;
}

interface Props {
  /** Mes destacado en la tabla (opcional). Si se pasa, se resalta esa fila. */
  highlightMonth?: string;
  /** Cuántos meses mostrar al inicio. Default 12. */
  initialLimit?: number;
  /** Título opcional del card. */
  title?: string;
}

/**
 * Tabla compartida de margen por mes — usable en Ventas Mensual / Diaria / Histórica.
 *
 * Muestra ventas, costo estimado, margen $ y margen % por mes,
 * con resumen del período y opción de expandir.
 */
export function MargenMensualTable({
  highlightMonth,
  initialLimit = 12,
  title = "Margen por mes",
}: Props): JSX.Element {
  const { data, isLoading } = useSalesHistoryExtended();
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    // Más reciente primero
    return [...data.serie].reverse().map((m: HistoryMonth) => ({
      mes: m.mes,
      label: mesLabel(m.mes),
      revenue: m.revenue,
      margen: m.margen,
      margenPct: m.margen_pct,
      costo: Math.max(0, m.revenue - m.margen),
    }));
  }, [data]);

  if (isLoading && !data) {
    return <Skeleton className="h-72 rounded-xl" />;
  }
  if (!data || rows.length === 0) {
    return (
      <Card header={<h3 className="font-semibold text-text-primary">{title}</h3>}>
        <p className="py-8 text-center text-sm text-text-muted">Sin datos de margen mensual.</p>
      </Card>
    );
  }

  const visibleRows = expanded ? rows : rows.slice(0, initialLimit);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalMargen = rows.reduce((s, r) => s + r.margen, 0);
  const margenPctAvg = totalRevenue > 0 ? (totalMargen / totalRevenue) * 100 : 0;

  return (
    <Card
      header={
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-text-primary">{title}</h3>
          <span className="text-xs text-text-muted">
            {rows.length} {rows.length === 1 ? "mes" : "meses"} · margen promedio {margenPctAvg.toFixed(1)}%
          </span>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
              <th className="py-2 pr-2">Mes</th>
              <th className="px-2 text-right">Ventas</th>
              <th className="px-2 text-right">Costo mercancía</th>
              <th className="px-2 text-right">Margen $</th>
              <th className="px-2 text-right">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const isHighlight = highlightMonth === r.mes;
              return (
                <tr
                  key={r.mes}
                  className={`border-b border-border/60 ${isHighlight ? "bg-accent/5 font-semibold" : ""}`}
                >
                  <td className="py-2 pr-2 text-text-primary">{r.label}{isHighlight ? " ←" : ""}</td>
                  <td className="px-2 text-right tabular-nums">{formatMoneyFull(r.revenue)}</td>
                  <td className="px-2 text-right tabular-nums text-text-muted">{formatMoneyFull(r.costo)}</td>
                  <td className="px-2 text-right tabular-nums text-green-700">{formatMoneyFull(r.margen)}</td>
                  <td className={`px-2 text-right tabular-nums font-semibold ${(r.margenPct ?? 0) >= 30 ? "text-green-700" : (r.margenPct ?? 0) >= 20 ? "text-amber-600" : "text-red-600"}`}>
                    {r.margenPct == null ? "—" : `${r.margenPct.toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-alt/40 text-text-primary">
              <td className="py-2 pr-2 font-semibold">Total período</td>
              <td className="px-2 text-right tabular-nums font-semibold">{formatMoneyFull(totalRevenue)}</td>
              <td className="px-2 text-right tabular-nums text-text-muted">{formatMoneyFull(totalRevenue - totalMargen)}</td>
              <td className="px-2 text-right tabular-nums font-semibold text-green-700">{formatMoneyFull(totalMargen)}</td>
              <td className="px-2 text-right tabular-nums font-semibold">{margenPctAvg.toFixed(1)}%</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {rows.length > initialLimit && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs text-accent hover:underline"
        >
          {expanded ? "Ver menos" : `Ver todos los ${rows.length} meses`}
        </button>
      )}

      <p className="mt-2 text-[0.7rem] text-text-muted">
        Costo mercancía = ventas − margen (lo que te costó comprar lo vendido). Margen ≥ 30% verde, 20-30% amarillo, &lt; 20% rojo.
      </p>
    </Card>
  );
}
