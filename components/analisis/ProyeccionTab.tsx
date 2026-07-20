"use client";

import { useSalesForecastMonthly } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stat } from "@/components/ui/Stat";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function monthLabel(month: string): string {
  const [year, rawMonth] = month.split("-");
  return `${MONTHS[Number(rawMonth) - 1] ?? rawMonth} ${year}`;
}

export function ProyeccionTab(): JSX.Element {
  const { data, error, isLoading, mutate } = useSalesForecastMonthly();

  if (isLoading && !data) return <Card><Skeleton className="h-64 rounded-lg" /></Card>;
  if (error && !data) {
    return (
      <Card>
        <div role="alert" className="py-10 text-center">
          <p className="font-semibold text-text-primary">No pudimos cargar la proyección</p>
          <p className="mt-1 text-sm text-text-muted">El resto de Análisis sigue disponible. Reintentá esta consulta.</p>
          <button
            type="button"
            onClick={() => void mutate()}
            className="mt-4 rounded-lg border border-border bg-surface-alt px-3 py-2 text-sm font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Reintentar
          </button>
        </div>
      </Card>
    );
  }
  if (!data) return <Card><Skeleton className="h-64 rounded-lg" /></Card>;

  const current = data.current_month;
  const next = data.next_month;
  const observed = current.observed_amount ?? 0;
  const pendingCurrent = Math.max(0, current.projected_amount - observed);
  const projectionRows = [
    {
      month: current.month,
      status: "Mes en curso",
      observed,
      pending: pendingCurrent,
      total: current.projected_amount,
      confidence: current.confidence,
    },
    {
      month: next.month,
      status: "Próximo mes",
      observed: null,
      pending: next.projected_amount,
      total: next.projected_amount,
      confidence: next.confidence,
    },
  ];
  const barData = projectionRows.map((row) => ({
    label: monthLabel(row.month),
    real: row.observed ?? 0,
    proy: row.pending,
  }));

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-2 text-xs leading-relaxed text-text-muted">
            <p>
              <strong className="text-text-primary">Cómo se calcula:</strong>{" "}
              el ritmo diario usa los <strong>últimos 90 días completos</strong>, excluye el mes en curso y proyecta el saldo del mes actual y todo el siguiente.
            </p>
            <p>
              <strong className="text-text-primary">Por qué el ritmo es estable:</strong>{" "}
              se congela sobre datos cerrados; el total del mes actual se mueve por la venta observada, no por recalcular la base cada día.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-dark px-4 py-3 text-text-inverse shadow-sm">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-text-muted">Horizonte activo</p>
            <p className="mt-1 text-sm font-bold">{monthLabel(current.month)} → {monthLabel(next.month)}</p>
          </div>
        </div>
        {data.rate_basis && data.rate_basis !== "rolling_90d_complete" && (
          <p role="status" className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            El modelo está usando una base alternativa ({data.rate_basis}) porque todavía no hay 90 días completos.
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <Stat
            label={`Mes en curso — ${monthLabel(current.month)}`}
            value={formatMoneyFull(current.projected_amount)}
            subtitle={`Real: ${formatMoneyFull(observed)} · restante: ${formatMoneyFull(pendingCurrent)} · confianza ${current.confidence}`}
          />
        </Card>
        <Card>
          <Stat
            label={`Próximo mes — ${monthLabel(next.month)}`}
            value={formatMoneyFull(next.projected_amount)}
            subtitle={`${next.days_total} días · confianza ${next.confidence}${
              next.last_year_same_month ? ` · mismo mes anterior: ${formatMoneyFull(next.last_year_same_month)}` : ""
            }`}
          />
        </Card>
      </div>

      <Card header={<h2 className="font-semibold text-text-primary">Mes actual y siguiente</h2>}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.55} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <YAxis tick={{ fontSize: 10 }} stroke="var(--color-text-muted)" tickFormatter={(value: number) => `$${(value / 1e6).toFixed(1)}M`} />
            <Tooltip
              formatter={(value, name) => [formatMoneyFull(Number(value)), name === "real" ? "Real observado" : "Proyectado restante"]}
              contentStyle={{ borderRadius: "10px", border: "1px solid var(--color-border)", fontSize: "12px" }}
            />
            <Bar dataKey="real" fill="var(--color-primary)" stackId="projection" name="real" />
            <Bar dataKey="proy" fill="#D7A928" stackId="projection" radius={[5, 5, 0, 0]} name="proy" />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-muted" aria-label="Leyenda de la gráfica">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Real observado</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#D7A928]" /> Proyectado restante</span>
        </div>
      </Card>

      <Card header={
        <div>
          <h2 className="font-semibold text-text-primary">Detalle de proyección</h2>
          <p className="text-xs text-text-muted">Los mismos dos meses mostrados en la gráfica, con sus componentes separados.</p>
        </div>
      }>
        <div className="-mx-4 overflow-x-auto md:mx-0">
          <table className="w-full min-w-[680px] text-sm">
            <caption className="sr-only">Detalle del mes actual y el mes siguiente mostrados en la gráfica</caption>
            <thead>
              <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-[0.12em] text-text-muted">
                <th scope="col" className="px-4 py-2 md:pl-2">Mes</th>
                <th scope="col" className="px-2 py-2">Etapa</th>
                <th scope="col" className="px-2 py-2 text-right">Real observado</th>
                <th scope="col" className="px-2 py-2 text-right">Proyectado restante</th>
                <th scope="col" className="px-2 py-2 text-right">Total proyectado</th>
                <th scope="col" className="px-4 py-2 text-right md:pr-2">Confianza</th>
              </tr>
            </thead>
            <tbody>
              {projectionRows.map((row) => (
                <tr key={row.month} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-text-primary md:pl-2">{monthLabel(row.month)}</th>
                  <td className="px-2 py-3 text-text-muted">{row.status}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{row.observed === null ? "—" : formatMoneyFull(row.observed)}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-[#9A7414]">{formatMoneyFull(row.pending)}</td>
                  <td className="px-2 py-3 text-right font-semibold tabular-nums text-text-primary">{formatMoneyFull(row.total)}</td>
                  <td className="px-4 py-3 text-right md:pr-2">
                    <span className="inline-flex rounded-full border border-border bg-surface-alt px-2 py-1 text-xs font-semibold text-text-secondary">{row.confidence}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {data.history && data.history.length > 0 && (
        <Card header={
          <div>
            <h2 className="font-semibold text-text-primary">Precisión histórica del modelo</h2>
            <p className="text-xs text-text-muted">Meses ya cerrados: lo proyectado por la fórmula frente a la venta real.</p>
          </div>
        }>
          <div className="-mx-4 overflow-x-auto md:mx-0">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Precisión histórica del modelo para meses cerrados</caption>
              <thead>
                <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                  <th scope="col" className="px-4 py-2 md:pl-2">Mes</th>
                  <th scope="col" className="px-2 py-2 text-right">Proyectado</th>
                  <th scope="col" className="px-2 py-2 text-right">Real</th>
                  <th scope="col" className="px-2 py-2 text-right">Diferencia</th>
                  <th scope="col" className="px-4 py-2 text-right md:pr-2">Error %</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((history) => {
                  const delta = history.actual_amount - history.projected_amount;
                  const absoluteError = history.error_pct === null ? null : Math.abs(history.error_pct);
                  const color = absoluteError === null
                    ? "text-text-muted"
                    : absoluteError <= 10
                      ? "text-success"
                      : absoluteError <= 25
                        ? "text-warning"
                        : "text-error";
                  return (
                    <tr key={history.month} className="border-b border-border/60 last:border-0">
                      <th scope="row" className="px-4 py-2 text-left font-medium text-text-primary md:pl-2">{monthLabel(history.month)}</th>
                      <td className="px-2 py-2 text-right tabular-nums text-text-muted">{formatMoneyFull(history.projected_amount)}</td>
                      <td className="px-2 py-2 text-right font-semibold tabular-nums">{formatMoneyFull(history.actual_amount)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${delta >= 0 ? "text-success" : "text-error"}`}>
                        {delta >= 0 ? "+" : "−"}{formatMoneyFull(Math.abs(delta))}
                      </td>
                      <td className={`px-4 py-2 text-right font-semibold tabular-nums md:pr-2 ${color}`}>
                        {history.error_pct === null ? "—" : `${history.error_pct >= 0 ? "+" : ""}${history.error_pct.toFixed(1)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[0.65rem] text-text-muted">Error % = (real − proyectado) / real. Verde ≤10%, amarillo ≤25%, rojo &gt;25%.</p>
        </Card>
      )}

      <Card>
        <p className="text-xs text-text-muted">
          <strong className="text-text-primary">Modelo:</strong> {data.model_version}
          {data.rate_window && (
            <> · <strong className="text-text-primary">Ventana base:</strong> {data.rate_window.start} → {data.rate_window.end} ({data.rate_window.days_with_sales} días con venta)</>
          )}
        </p>
      </Card>
    </div>
  );
}
