"use client";

import { useState } from "react";
import {
  useSalesHistoryExtended,
  useSalesHistoricalProducts,
  useProductAbcMap,
  type HistoryMonth,
  type HistoryYoY,
} from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProductosVendidosTabla } from "@/components/ventas/ProductosVendidosTabla";
import {
  ComposedChart, Bar, Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function mesLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${String(y).slice(2)}`;
}

export function HistoricaTab(): JSX.Element {
  const { data, isLoading } = useSalesHistoryExtended();

  // V1.13: top productos vendidos en TODO el histórico
  const [productsExpanded, setProductsExpanded] = useState(false);
  const histProducts = useSalesHistoricalProducts(productsExpanded ? 5000 : 10);
  const abcMap = useProductAbcMap(180);

  if (isLoading && !data) return <Skeleton className="h-96 rounded-xl" />;
  if (!data || data.serie.length === 0) {
    return <Card><p className="py-12 text-center text-sm text-text-muted">Sin datos históricos.</p></Card>;
  }

  const serie = data.serie.map((s: HistoryMonth) => ({
    mes: mesLabel(s.mes),
    revenue: s.revenue,
    margen: s.margen,
    margenPct: s.margen_pct,
    ticket: s.ticket_promedio,
  }));

  const margenPromedio =
    data.total_revenue > 0 ? (data.total_margen / data.total_revenue) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Qué es el margen */}
      <div className="rounded-lg border border-border bg-surface-alt/40 px-4 py-3 text-sm">
        <span className="font-semibold text-text-primary">¿Qué es el margen?</span>{" "}
        <span className="text-text-secondary">
          Es lo que te queda después de descontar lo que te costó la mercancía.
          Si vendés algo en $100 y te costó $65, tu margen es $35 (35%). No es la ganancia
          final del negocio (faltan gastos como arriendo, sueldos), pero sí te dice si estás
          vendiendo con buena diferencia o demasiado barato.
        </span>
      </div>

      {/* KPIs históricos */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <Stat
            label="Mejor mes"
            value={data.mejor_mes ? formatMoneyFull(data.mejor_mes.revenue) : "—"}
            subtitle={data.mejor_mes ? `${mesLabel(data.mejor_mes.mes)} · margen ${data.mejor_mes.margen_pct}%` : ""}
          />
        </Card>
        <Card>
          <Stat
            label="Peor mes"
            value={data.peor_mes ? formatMoneyFull(data.peor_mes.revenue) : "—"}
            subtitle={data.peor_mes ? mesLabel(data.peor_mes.mes) : ""}
          />
        </Card>
        <Card><Stat label="Margen histórico" value={`${margenPromedio.toFixed(1)}%`} subtitle={formatMoneyFull(data.total_margen)} /></Card>
        <Card><Stat label="Meses con datos" value={String(data.serie.length)} subtitle="histórico completo" /></Card>
      </div>

      {/* Ventas + margen en el tiempo */}
      <Card header={<h2 className="font-semibold text-text-primary">Ventas y margen mensual</h2>}>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 8, angle: -55, textAnchor: "end" }} height={55} stroke="#a3a3a3" interval={0} />
            <YAxis yAxisId="l" tick={{ fontSize: 10 }} stroke="#a3a3a3" tickFormatter={(v: number) => `$${(v / 1e6).toFixed(0)}M`} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} stroke="#15803D" tickFormatter={(v: number) => `${v}%`} domain={[0, 60]} />
            <Tooltip
              formatter={(v, name) => name === "margenPct" ? [`${Number(v)}%`, "Margen %"] : [formatMoneyFull(Number(v)), name === "revenue" ? "Ventas" : "Margen $"]}
              contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
            />
            <Legend wrapperStyle={{ fontSize: "11px" }} formatter={(v: string) => v === "revenue" ? "Ventas" : v === "margenPct" ? "Margen %" : v} />
            <Bar yAxisId="l" dataKey="revenue" fill="var(--color-primary, #C83828)" radius={[3, 3, 0, 0]} name="revenue" />
            <Line yAxisId="r" type="monotone" dataKey="margenPct" stroke="#15803D" strokeWidth={2} dot={{ r: 2 }} name="margenPct" />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="mt-1 text-[0.7rem] text-text-muted">
          Barras = ventas del mes. Línea verde = margen %. Si las ventas suben pero el margen baja, estás vendiendo más barato.
        </p>
      </Card>

      {/* Ticket promedio en el tiempo */}
      <Card header={<h2 className="font-semibold text-text-primary">Ticket promedio mensual</h2>}>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={serie}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 8, angle: -55, textAnchor: "end" }} height={55} stroke="#a3a3a3" interval={0} />
            <YAxis tick={{ fontSize: 10 }} stroke="#a3a3a3" tickFormatter={(v: number) => `$${(v / 1e3).toFixed(0)}K`} />
            <Tooltip formatter={(v) => formatMoneyFull(Number(v))} contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
            <Line type="monotone" dataKey="ticket" stroke="#2563EB" strokeWidth={2} dot={{ r: 2 }} name="Ticket promedio" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Año vs año */}
      {data.yoy.length > 0 && (
        <Card header={<h2 className="font-semibold text-text-primary">Año contra año — mismo mes</h2>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                  <th className="py-2 pr-2">Mes</th>
                  <th className="px-2 text-right">Este año</th>
                  <th className="px-2 text-right">Año anterior</th>
                  <th className="px-2 text-right">Variación</th>
                </tr>
              </thead>
              <tbody>
                {[...data.yoy].reverse().map((y: HistoryYoY) => {
                  const pos = y.delta_pct != null && y.delta_pct > 0;
                  const neg = y.delta_pct != null && y.delta_pct < 0;
                  return (
                    <tr key={y.mes} className="border-b border-border/60">
                      <td className="py-2 pr-2 font-medium text-text-primary">{mesLabel(y.mes)}</td>
                      <td className="px-2 text-right tabular-nums">{formatMoneyFull(y.revenue_actual)}</td>
                      <td className="px-2 text-right tabular-nums text-text-muted">{formatMoneyFull(y.revenue_anterior)}</td>
                      <td className={`px-2 text-right tabular-nums font-semibold ${pos ? "text-green-600" : neg ? "text-red-600" : "text-text-muted"}`}>
                        {y.delta_pct == null ? "—" : `${pos ? "+" : ""}${y.delta_pct.toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* V1.13: Productos más vendidos en TODO el histórico */}
      <Card header={
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-text-primary">Productos vendidos — histórico completo</h2>
          <span className="text-xs text-text-muted">click en fila → ficha</span>
        </div>
      }>
        {histProducts.isLoading && !histProducts.data ? (
          <Skeleton className="h-64 rounded-lg" />
        ) : histProducts.data ? (
          <ProductosVendidosTabla
            productos={histProducts.data.items}
            abcMap={abcMap.data}
            initialLimit={10}
            totalAvailable={histProducts.data.total_skus_con_venta}
            isFullDataset={productsExpanded}
            loadingAll={productsExpanded && histProducts.isLoading}
            onLoadAll={() => setProductsExpanded(true)}
          />
        ) : (
          <p className="py-8 text-center text-sm text-text-muted">Sin productos vendidos.</p>
        )}
      </Card>
    </div>
  );
}
