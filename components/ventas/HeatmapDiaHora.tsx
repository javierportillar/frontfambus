"use client";

import { useMemo, useState } from "react";
import { useHeatmapDiaHora, type HeatmapCell } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

type Metric = "facturas" | "ventas" | "ticket";

interface Props {
  fechaInicio: string;
  fechaFin: string;
}

/**
 * Mapa de calor 7 días × 24 horas (DOM-SAB × 00h-23h).
 *
 * Útil para:
 * - Identificar picos cruzados (ej: "sábados a las 18h es el techo")
 * - Detectar patrones de cierre (columnas vacías = días no laborables)
 * - Decidir personal por franja
 *
 * El usuario puede alternar entre 3 métricas: facturas, ventas $, ticket promedio.
 */
export function HeatmapDiaHora({ fechaInicio, fechaFin }: Props): JSX.Element {
  const { data, isLoading, error } = useHeatmapDiaHora(fechaInicio, fechaFin);
  const [metric, setMetric] = useState<Metric>("facturas");

  // Reorganizar: filas = horas (0-23), columnas = días (LUN-DOM)
  // Reordeno DOM-SAB → LUN-DOM porque culturalmente lunes va primero
  const grid = useMemo(() => {
    if (!data) return null;
    const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // LUN MAR MIE JUE VIE SAB DOM
    const dayLabels = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
    const byKey = new Map<string, HeatmapCell>();
    for (const c of data.cells) {
      byKey.set(`${c.dow}-${c.hora}`, c);
    }
    return { dayOrder, dayLabels, byKey };
  }, [data]);

  if (isLoading && !data) return <Card><Skeleton className="h-96 rounded-lg" /></Card>;
  if (error) return <Card><p className="py-8 text-center text-sm text-error">Error cargando heatmap.</p></Card>;
  if (!data || !grid) return <Card><p className="py-8 text-center text-sm text-text-muted">Sin datos.</p></Card>;

  const valueAt = (dow: number, hora: number): number => {
    const c = grid.byKey.get(`${dow}-${hora}`);
    if (!c) return 0;
    if (metric === "facturas") return c.num_facturas;
    if (metric === "ventas") return c.total_ventas;
    return c.ticket_promedio;
  };

  const allValues = data.cells.map((c) =>
    metric === "facturas" ? c.num_facturas : metric === "ventas" ? c.total_ventas : c.ticket_promedio,
  );
  const maxValue = Math.max(...allValues, 1);

  const formatValue = (v: number): string => {
    if (metric === "facturas") return v.toString();
    return formatMoneyFull(v);
  };

  // Color: rojo MotoShop como gradient.
  const colorFor = (v: number): string => {
    if (v === 0) return "transparent";
    const intensity = v / maxValue; // 0..1
    const alpha = 0.15 + intensity * 0.85;
    return `rgba(123, 24, 24, ${alpha})`;
  };
  const textColorFor = (v: number): string => {
    if (v === 0) return "var(--color-text-muted, #999)";
    return v / maxValue > 0.55 ? "white" : "var(--color-text-primary, #111)";
  };

  // Identificar picos para resaltar
  const allCells = grid.dayOrder.flatMap((dow) =>
    Array.from({ length: 24 }, (_, h) => ({ dow, hora: h, value: valueAt(dow, h) })),
  );
  const topCells = [...allCells].sort((a, b) => b.value - a.value).slice(0, 3);
  const isPico = (dow: number, hora: number) => topCells.some((c) => c.dow === dow && c.hora === hora && c.value > 0);

  // Día/hora con más actividad (para insight textual)
  const peak = topCells[0] && topCells[0].value > 0 ? topCells[0] : null;
  const peakLabel = peak ? `${grid.dayLabels[grid.dayOrder.indexOf(peak.dow)]} ${String(peak.hora).padStart(2, "0")}:00 — ${formatValue(peak.value)}` : null;

  return (
    <Card header={
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-text-primary">Mapa de calor — día × hora</h2>
        <div className="flex gap-1">
          {(["facturas", "ventas", "ticket"] as Metric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`rounded-md px-2 py-1 text-[0.7rem] ${
                metric === m
                  ? "bg-surface-dark text-text-inverse"
                  : "bg-surface-alt text-text-secondary hover:bg-surface-alt/70"
              }`}
            >
              {m === "facturas" ? "Facturas" : m === "ventas" ? "Ventas $" : "Ticket prom."}
            </button>
          ))}
        </div>
      </div>
    }>
      {peakLabel && (
        <p className="mb-3 text-xs text-text-secondary">
          🔥 Pico del período: <strong>{peakLabel}</strong>
        </p>
      )}

      {/* Desktop / Tablet: grid 24×7 */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[0.65rem]" style={{ minWidth: "480px" }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-surface px-1 py-1 text-text-muted">Hora</th>
              {grid.dayLabels.map((l) => (
                <th key={l} className="px-1 py-1 text-text-muted font-medium">{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 24 }, (_, h) => (
              <tr key={h}>
                <td className="sticky left-0 z-10 bg-surface px-1 py-0.5 text-right text-text-muted tabular-nums">
                  {String(h).padStart(2, "0")}h
                </td>
                {grid.dayOrder.map((dow) => {
                  const v = valueAt(dow, h);
                  const pico = isPico(dow, h);
                  const cell = grid.byKey.get(`${dow}-${h}`);
                  const title = cell
                    ? `${grid.dayLabels[grid.dayOrder.indexOf(dow)]} ${String(h).padStart(2,"0")}:00\n${cell.num_facturas} fact · ${formatMoneyFull(cell.total_ventas)} · ticket ${formatMoneyFull(cell.ticket_promedio)}`
                    : `${grid.dayLabels[grid.dayOrder.indexOf(dow)]} ${String(h).padStart(2,"0")}:00 — sin ventas`;
                  return (
                    <td
                      key={dow}
                      className={`text-center tabular-nums ${pico ? "ring-1 ring-amber-400" : ""}`}
                      style={{
                        background: colorFor(v),
                        color: textColorFor(v),
                        padding: "4px 2px",
                        minWidth: "36px",
                      }}
                      title={title}
                    >
                      {v > 0
                        ? metric === "facturas"
                          ? v
                          : metric === "ventas"
                            ? `${(v / 1e3).toFixed(0)}k`
                            : `${(v / 1e3).toFixed(0)}k`
                        : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[0.7rem] text-text-muted">
        <span>Más intenso = más {metric === "facturas" ? "facturas" : metric === "ventas" ? "ventas $" : "ticket prom."}</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-3 w-6 ring-1 ring-amber-400" />
          Top 3 picos del período
        </span>
        <span>Hover sobre celda → detalle</span>
      </div>
    </Card>
  );
}
