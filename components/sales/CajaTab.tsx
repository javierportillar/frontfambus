"use client";

import { useMemo, useState } from "react";
import {
  useCashClosure,
  usePaymentsHistory,
  type CashClosureFactura,
  type CashClosureFormaPago,
  type PaymentsVariacionItem,
} from "@/lib/api/hooks";
import { formatMoney } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table } from "@/components/ui/Table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const PAY_COLORS = [
  "var(--color-primary, #C83828)",
  "#10B981", // verde
  "#0EA5E9", // azul
  "#F59E0B", // ambar
  "#8B5CF6", // violeta
  "#EC4899", // rosa
  "#84CC16", // lima
  "#6B7280", // gris
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthLabel(yyyyMm: string): string {
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const [y, m] = yyyyMm.split("-");
  const idx = Number(m) - 1;
  return `${months[idx] ?? m} ${String(y).slice(2)}`;
}

export function CajaTab(): JSX.Element {
  const [date, setDate] = useState<string>(todayIso());
  const [filterForma, setFilterForma] = useState<string | null>(null);

  const closure = useCashClosure(date);
  const history = usePaymentsHistory(12);

  const facturasFiltradas = useMemo(() => {
    if (!closure.data) return [];
    if (!filterForma) return closure.data.facturas;
    return closure.data.facturas.filter((f) => f.cod_formapago === filterForma);
  }, [closure.data, filterForma]);

  // Mapeo cod -> color para consistencia entre tabla y stacked bar
  const codColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    const allFormas = new Set<string>();
    closure.data?.formas_pago.forEach((f) => allFormas.add(f.cod_formapago));
    history.data?.formas_pago.forEach((f) => allFormas.add(f.cod_formapago));
    Array.from(allFormas)
      .sort()
      .forEach((cod, idx) => {
        m[cod] = PAY_COLORS[idx % PAY_COLORS.length] ?? "#999";
      });
    return m;
  }, [closure.data, history.data]);

  // Datos para el stacked bar (recharts necesita un objeto plano por bar)
  const stackedData = useMemo(() => {
    if (!history.data) return [];
    return history.data.series.map((entry) => {
      const flat: Record<string, string | number> = { month: monthLabel(entry.month) };
      entry.formas_pago.forEach((fp) => {
        flat[fp.cod_formapago] = fp.total_ventas;
      });
      return flat;
    });
  }, [history.data]);

  return (
    <div className="space-y-4">
      {/* Header con selector */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-base font-bold text-text-primary">Cierre de caja</h2>
          <p className="text-xs text-text-muted">Z-report del día — desglose por forma de pago y lista de facturas.</p>
        </div>
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
          Día
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setFilterForma(null);
            }}
            className="mt-1 block rounded-xl border border-border bg-surface px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
      </div>

      {/* Heads-up sobre limitación */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        ⚠️ Cada factura tiene UN solo código de pago. Si la POS permite pagos partidos
        (efectivo + tarjeta en una misma factura), el cierre va a tener un delta vs caja física.
      </div>

      {/* Cierre de caja */}
      {closure.isLoading ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : closure.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo cargar el cierre del día.
        </div>
      ) : closure.data && closure.data.total_facturas === 0 ? (
        <Card>
          <div className="py-8 text-center text-sm text-text-muted">
            No hubo ventas el {date}.
          </div>
        </Card>
      ) : closure.data ? (
        <>
          {/* KPIs cierre */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card><Stat label="Total del día" value={formatMoney(closure.data.total_dia)} subtitle={`${closure.data.total_facturas} facturas`} /></Card>
            <Card>
              <Stat
                label="Forma principal"
                value={closure.data.formas_pago[0]?.nombre ?? "—"}
                subtitle={closure.data.formas_pago[0] ? `${closure.data.formas_pago[0].porcentaje.toFixed(0)}% — ${formatMoney(closure.data.formas_pago[0].total_ventas)}` : ""}
              />
            </Card>
            <Card>
              <Stat
                label="Ticket promedio"
                value={formatMoney(closure.data.total_facturas ? closure.data.total_dia / closure.data.total_facturas : 0)}
                subtitle="del día"
              />
            </Card>
            <Card>
              <Stat
                label="Top factura"
                value={closure.data.top_facturas_grandes[0] ? formatMoney(closure.data.top_facturas_grandes[0].total) : "—"}
                subtitle={closure.data.top_facturas_grandes[0]?.nombre_formapago ?? ""}
              />
            </Card>
          </div>

          {/* Z-report */}
          <Card header={<h3 className="font-semibold text-text-primary">Desglose por forma de pago</h3>}>
            <Table
              columns={[
                {
                  header: "",
                  cell: (r: CashClosureFormaPago) => (
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ background: codColorMap[r.cod_formapago] ?? "#999" }}
                    />
                  ),
                },
                {
                  header: "Forma de pago",
                  cell: (r: CashClosureFormaPago) => (
                    <button
                      type="button"
                      onClick={() => setFilterForma(filterForma === r.cod_formapago ? null : r.cod_formapago)}
                      className={`text-left text-sm font-medium ${filterForma === r.cod_formapago ? "text-primary underline" : "text-text-primary hover:underline"}`}
                    >
                      {r.nombre}
                    </button>
                  ),
                },
                { header: "Facturas", cell: (r: CashClosureFormaPago) => r.num_facturas.toString(), align: "right" },
                { header: "Ticket prom", cell: (r: CashClosureFormaPago) => formatMoney(r.ticket_promedio), align: "right" },
                { header: "Total", cell: (r: CashClosureFormaPago) => <span className="font-semibold">{formatMoney(r.total_ventas)}</span>, align: "right" },
                {
                  header: "%",
                  cell: (r: CashClosureFormaPago) => (
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-alt">
                        <div className="h-full rounded-full" style={{ width: `${r.porcentaje}%`, background: codColorMap[r.cod_formapago] ?? "var(--color-primary)" }} />
                      </div>
                      <span className="font-semibold w-12 text-right">{r.porcentaje.toFixed(1)}%</span>
                    </div>
                  ),
                  align: "right",
                },
              ]}
              data={closure.data.formas_pago}
              keyFn={(r: CashClosureFormaPago) => r.cod_formapago}
              striped
            />
            <div className="mt-3 flex items-center justify-end gap-3 border-t border-border pt-2 text-sm">
              <span className="text-text-muted">TOTAL DÍA</span>
              <span className="text-base font-bold text-text-primary">{formatMoney(closure.data.total_dia)}</span>
            </div>
            {filterForma && (
              <p className="mt-1 text-[11px] text-text-muted text-right">
                Filtrando facturas por <strong>{closure.data.formas_pago.find((f) => f.cod_formapago === filterForma)?.nombre}</strong>.{" "}
                <button type="button" onClick={() => setFilterForma(null)} className="text-primary underline">Quitar filtro</button>
              </p>
            )}
          </Card>

          {/* Top facturas grandes */}
          {closure.data.top_facturas_grandes.length > 0 && (
            <Card header={<h3 className="font-semibold text-text-primary">Top 5 facturas del día</h3>}>
              <Table
                columns={[
                  { header: "#", cell: (r: CashClosureFactura) => `${r.prefijo ?? ""}-${r.num_documento}` },
                  { header: "Hora", cell: (r: CashClosureFactura) => r.hora },
                  { header: "Cliente", cell: (r: CashClosureFactura) => <span className="text-xs">{r.cliente}</span> },
                  {
                    header: "Forma de pago",
                    cell: (r: CashClosureFactura) => (
                      <span className="inline-flex items-center gap-2 text-xs">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: codColorMap[r.cod_formapago] ?? "#999" }} />
                        {r.nombre_formapago}
                      </span>
                    ),
                  },
                  { header: "Total", cell: (r: CashClosureFactura) => <span className="font-semibold">{formatMoney(r.total)}</span>, align: "right" },
                ]}
                data={closure.data.top_facturas_grandes}
                keyFn={(r: CashClosureFactura) => `${r.prefijo ?? ""}-${r.num_documento}`}
                striped
              />
            </Card>
          )}

          {/* Lista de facturas */}
          <Card
            header={
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-text-primary">Facturas del día</h3>
                <span className="text-xs text-text-muted">{facturasFiltradas.length} de {closure.data.facturas.length}</span>
              </div>
            }
          >
            <div className="max-h-96 overflow-y-auto">
              <Table
                columns={[
                  { header: "Doc", cell: (r: CashClosureFactura) => <span className="text-xs">{r.prefijo ?? ""}-{r.num_documento}</span> },
                  { header: "Hora", cell: (r: CashClosureFactura) => <span className="text-xs">{r.hora}</span> },
                  { header: "Cliente", cell: (r: CashClosureFactura) => <span className="text-xs">{r.cliente}</span> },
                  { header: "Vendedor", cell: (r: CashClosureFactura) => <span className="text-xs">{r.vendedor}</span> },
                  {
                    header: "Forma de pago",
                    cell: (r: CashClosureFactura) => (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: codColorMap[r.cod_formapago] ?? "#999" }} />
                        {r.nombre_formapago}
                      </span>
                    ),
                  },
                  { header: "Total", cell: (r: CashClosureFactura) => <span className="text-xs font-semibold">{formatMoney(r.total)}</span>, align: "right" },
                ]}
                data={facturasFiltradas}
                keyFn={(r: CashClosureFactura) => `${r.prefijo ?? ""}-${r.num_documento}`}
                striped
              />
            </div>
          </Card>
        </>
      ) : null}

      {/* Historico de formas de pago */}
      <Card header={<h3 className="font-semibold text-text-primary">Tendencia histórica — mix de formas de pago</h3>}>
        {history.isLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : history.error ? (
          <p className="py-4 text-sm text-text-muted text-center">No se pudo cargar el histórico.</p>
        ) : !history.data || stackedData.length === 0 ? (
          <p className="py-6 text-sm text-text-muted text-center">Sin datos históricos.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stackedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#a3a3a3" />
              <YAxis tick={{ fontSize: 10 }} stroke="#a3a3a3" tickFormatter={(v: number) => `$${(v / 1e6).toFixed(1)}M`} />
              <Tooltip
                formatter={(value, name) => [formatMoney(Number(value)), history.data?.formas_pago.find((f) => f.cod_formapago === name)?.nombre ?? name]}
                contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
              />
              <Legend
                formatter={(value: string) => history.data?.formas_pago.find((f) => f.cod_formapago === value)?.nombre ?? value}
                wrapperStyle={{ fontSize: "11px" }}
              />
              {history.data.formas_pago.map((f) => (
                <Bar
                  key={f.cod_formapago}
                  dataKey={f.cod_formapago}
                  stackId="a"
                  fill={codColorMap[f.cod_formapago] ?? "#999"}
                  radius={[0, 0, 0, 0]}
                  name={f.cod_formapago}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Variacion 6 meses */}
      {history.data && history.data.variacion_seis_meses.some((v) => v.pct_seis_meses_atras > 0) && (
        <Card header={<h3 className="font-semibold text-text-primary">Variación del mix — mes actual vs hace 6 meses</h3>}>
          <ul className="divide-y divide-border">
            {history.data.variacion_seis_meses
              .filter((v) => v.pct_actual > 0 || v.pct_seis_meses_atras > 0)
              .sort((a, b) => Math.abs(b.delta_puntos) - Math.abs(a.delta_puntos))
              .map((v: PaymentsVariacionItem) => {
                const positive = v.delta_puntos > 0.5;
                const negative = v.delta_puntos < -0.5;
                return (
                  <li key={v.cod_formapago} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: codColorMap[v.cod_formapago] ?? "#999" }} />
                      <span className="text-sm text-text-primary">{v.nombre}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-text-muted">
                        hace 6m: <strong className="text-text-secondary">{v.pct_seis_meses_atras.toFixed(1)}%</strong>
                      </span>
                      <span className="text-text-muted">
                        hoy: <strong className="text-text-secondary">{v.pct_actual.toFixed(1)}%</strong>
                      </span>
                      <span className={`font-semibold w-16 text-right ${positive ? "text-green-600" : negative ? "text-red-600" : "text-text-muted"}`}>
                        {v.delta_puntos > 0 ? "+" : ""}{v.delta_puntos.toFixed(1)} pts
                      </span>
                    </div>
                  </li>
                );
              })}
          </ul>
          <p className="mt-3 text-[11px] text-text-muted">
            {`"pts" = puntos porcentuales. Si efectivo era 60% y ahora es 48%, la variación es -12 pts.`}
          </p>
        </Card>
      )}
    </div>
  );
}
