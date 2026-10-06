"use client";

import { usePurchaseAssessments, useSalesForecastMonthly } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { canAccessFeature, type AccessContext } from "@/lib/auth/access";
import { useAuthStore } from "@/lib/auth/store";
import { shiftDateISO } from "@/lib/date/business";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Stat } from "@/components/ui/Stat";
import Link from "next/link";
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
const CONFIDENCE_LABELS: Record<string, string> = {
  high: "alta",
  medium: "media",
  low: "baja",
};
const RATE_BASIS_COPY: Record<string, string> = {
  rolling_90d_complete: "promedio diario de ventas válidas de los 90 días previos",
  previous_month_complete: "promedio diario del último mes cerrado",
  current_month_run_rate: "promedio de los días con venta del mes actual",
};
const PURCHASE_ASSESSMENT_START = "2026-09-01";

function monthLabel(month: string): string {
  const [year, rawMonth] = month.split("-");
  return `${MONTHS[Number(rawMonth) - 1] ?? rawMonth} ${year}`;
}

export function ProyeccionTab(): JSX.Element {
  const { data, error, isLoading, mutate } = useSalesForecastMonthly();
  const role = useAuthStore((state) => state.role);
  const enabledFeatures = useAuthStore((state) => state.enabledFeatures);
  const allowedModules = useAuthStore((state) => state.allowedModules);
  const currentTenant = useAuthStore((state) => state.currentTenant);
  const purchaseAccessContext: AccessContext = {
    role,
    enabledFeatures,
    allowedModules,
    currentTenant,
  };
  const canViewPurchaseEvidence = canAccessFeature("ventas-summary", purchaseAccessContext);
  const purchaseCutoff = data?.source_cutoffs.purchases_date ?? null;
  const candidatePurchaseRangeStart = purchaseCutoff
    ? shiftDateISO(purchaseCutoff, -89)
    : null;
  const purchaseRangeStart = purchaseCutoff && purchaseCutoff >= PURCHASE_ASSESSMENT_START
    ? candidatePurchaseRangeStart && candidatePurchaseRangeStart > PURCHASE_ASSESSMENT_START
      ? candidatePurchaseRangeStart
      : PURCHASE_ASSESSMENT_START
    : null;
  const purchaseEvidence = usePurchaseAssessments(
    canViewPurchaseEvidence ? purchaseRangeStart : null,
    canViewPurchaseEvidence ? purchaseCutoff : null,
    10,
  );

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
  const stockCurrent = data.stock_adjusted.current_month;
  const stockNext = data.stock_adjusted.next_month;
  const confidenceNote = data.backtest_accuracy?.note;
  const observed = current.observed_amount ?? 0;
  const projectionRows = [
    {
      month: current.month,
      status: "Mes en curso",
      observed,
      base: current.projected_amount,
      stockAdjusted: stockCurrent.projected_amount,
      baseConfidence: current.confidence,
    },
    {
      month: next.month,
      status: "Próximo mes",
      observed: null,
      base: next.projected_amount,
      stockAdjusted: stockNext.projected_amount,
      baseConfidence: next.confidence,
    },
  ];
  const barData = projectionRows.map((row) => ({
    label: monthLabel(row.month),
    real: row.observed ?? 0,
    base: row.base,
    stockAdjusted: row.stockAdjusted,
  }));
  const cutoffLabel = (value: string | null): string => value ?? "sin datos";
  const staleSources = [
    data.staleness.sales_is_stale ? "ventas" : null,
    data.staleness.inventory_is_stale ? "inventario" : null,
    data.staleness.purchases_are_stale ? "compras" : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-2 text-xs leading-relaxed text-text-muted">
            <p>
              <strong className="text-text-primary">Pronóstico base:</strong>{" "}
              suma lo observado más la estimación de los días restantes. El nivel usa el {RATE_BASIS_COPY[data.rate_basis ?? "rolling_90d_complete"] ?? "promedio diario disponible"}; no es una cifra garantizada.
            </p>
            <p>
              <strong className="text-text-primary">Distribución por día:</strong>{" "}
              {data.daily_pattern.note}
            </p>
            <p>
              <strong className="text-text-primary">Referencia anual:</strong>{" "}
              el mismo mes del año pasado se muestra para comparar, pero no entra en este pronóstico.
            </p>
            <p>
              <strong className="text-text-primary">Escenario con inventario:</strong>{" "}
              limita la venta estimada al inventario disponible y lleva el saldo al mes siguiente, sin sumar compras futuras. Es un escenario, no una afirmación de que comprar cause ventas.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-surface-dark px-4 py-3 text-text-inverse shadow-sm">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-text-muted">Horizonte activo</p>
            <p className="mt-1 text-sm font-bold">{monthLabel(current.month)} → {monthLabel(next.month)}</p>
          </div>
        </div>
        {data.daily_pattern.method === "flat_daily_fallback" && (
          <p role="status" className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            No hay suficientes fechas con venta para estimar variación por calendario; la curva diaria usa un reparto uniforme.
          </p>
        )}
        <p
          role="status"
          className={`mt-3 rounded-lg border px-3 py-2 text-xs ${staleSources.length ? "border-warning/40 bg-warning/10 text-warning" : "border-border bg-surface-alt text-text-secondary"}`}
        >
          Cortes de fuente — ventas: {cutoffLabel(data.source_cutoffs.sales_date)} · inventario: {cutoffLabel(data.source_cutoffs.inventory_date)} · compras: {cutoffLabel(data.source_cutoffs.purchases_date)}. A fecha {data.staleness.as_of_date} ({data.business_timezone}){staleSources.length ? `; fuentes desactualizadas: ${staleSources.join(", ")}` : "; fuentes al día"}.
        </p>
        {confidenceNote && (
          <p
            role="status"
            className="mt-3 rounded-lg border border-border bg-surface-alt px-3 py-2 text-xs text-text-secondary"
          >
            Precisión histórica del total mensual: confianza {CONFIDENCE_LABELS[data.backtest_accuracy?.confidence ?? "low"] ?? "baja"}. {confidenceNote} Esto no mide la precisión de cada fecha.
          </p>
        )}
        <p role="status" className="mt-3 rounded-lg border border-border bg-surface-alt px-3 py-2 text-xs text-text-secondary">
          Escenario con inventario: supone que no habrá nuevas compras y limita las ventas estimadas al stock disponible. No tiene backtest porque faltan snapshots históricos; no implica que comprar cause ventas. Fuente: {data.stock_adjusted.inventory_source}. SKU(s) con stock controlado: {data.stock_adjusted.inventory_controlled_skus}; servicios sin límite: {data.stock_adjusted.uncapped_service_skus}; evidencia insuficiente: {data.stock_adjusted.insufficient_evidence_skus}. {data.stock_adjusted.confidence_note}
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <Stat
            label={`Pronóstico base — ${monthLabel(current.month)}`}
            value={formatMoneyFull(current.projected_amount)}
            subtitle={`Incluye ${formatMoneyFull(observed)} observado + días restantes · confianza mensual ${CONFIDENCE_LABELS[current.confidence] ?? current.confidence}`}
          />
        </Card>
        <Card>
          <Stat
            label={`Con inventario actual — ${monthLabel(current.month)}`}
            value={formatMoneyFull(stockCurrent.projected_amount)}
            subtitle={`Mismo observado: ${formatMoneyFull(stockCurrent.observed_amount)} · confianza baja · sin reposición futura`}
          />
        </Card>
        <Card>
          <Stat
            label={`Pronóstico base — ${monthLabel(next.month)}`}
            value={formatMoneyFull(next.projected_amount)}
            subtitle={`${next.days_total} días · confianza ${CONFIDENCE_LABELS[next.confidence] ?? next.confidence}${
              next.last_year_same_month ? ` · real mismo mes año anterior: ${formatMoneyFull(next.last_year_same_month)}` : ""
            }`}
          />
        </Card>
        <Card>
          <Stat
            label={`Con inventario remanente — ${monthLabel(next.month)}`}
            value={formatMoneyFull(stockNext.projected_amount)}
            subtitle={`${stockNext.days_total} días · confianza baja · inventario remanente del mes actual`}
          />
        </Card>
      </div>

      <Card header={<h2 className="font-semibold text-text-primary">Comparación de escenarios — mes actual y siguiente</h2>}>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.55} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" />
            <YAxis tick={{ fontSize: 10 }} stroke="var(--color-text-muted)" tickFormatter={(value: number) => `$${(value / 1e6).toFixed(1)}M`} />
            <Tooltip
              formatter={(value, name) => [
                formatMoneyFull(Number(value)),
              name === "real" ? "Real observado" : name === "base" ? "Pronóstico base total" : "Con inventario total",
              ]}
              contentStyle={{ borderRadius: "10px", border: "1px solid var(--color-border)", fontSize: "12px" }}
            />
            <Bar dataKey="real" fill="var(--color-primary)" name="real" />
            <Bar dataKey="base" fill="#2563EB" radius={[5, 5, 0, 0]} name="base" />
            <Bar dataKey="stockAdjusted" fill="#D7A928" radius={[5, 5, 0, 0]} name="stockAdjusted" />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-muted" aria-label="Leyenda de la gráfica">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Real observado</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#2563EB]" /> Pronóstico base total del mes</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#D7A928]" /> Escenario total con inventario</span>
        </div>
      </Card>

      {canViewPurchaseEvidence && (
        <Card
          header={(
            <div>
              <h2 className="font-semibold text-text-primary">Compras relacionadas con este horizonte</h2>
              <p className="text-xs text-text-muted">
                Evaluaciones de facturas recientes que aportan contexto a la disponibilidad de inventario.
              </p>
            </div>
          )}
        >
          {purchaseEvidence.isLoading && !purchaseEvidence.data ? (
            <div role="status" className="space-y-2">
              <Skeleton className="h-12 rounded-lg" />
              <Skeleton className="h-12 rounded-lg" />
            </div>
          ) : purchaseEvidence.error ? (
            <p role="status" className="text-sm text-text-muted">
              Las evaluaciones de compras no están disponibles en este momento.
            </p>
          ) : !purchaseEvidence.data?.items.length ? (
            <p className="text-sm text-text-muted">
              No hay evaluaciones guardadas para el rango con datos de compras.
            </p>
          ) : (
            <ul aria-label="Evaluaciones de compras recientes" className="space-y-2">
              {purchaseEvidence.data.items.map((evaluation) => {
                const summary = evaluation.deterministic_metrics.assessment_summary;
                const label = summary?.senal_global.replaceAll("_", " ")
                  ?? (evaluation.status === "pending" || evaluation.status === "processing"
                    ? "en evaluación"
                    : evaluation.status);
                const href = `/dashboards/compras/dia/${encodeURIComponent(evaluation.business_date)}`
                  + `/documento/${encodeURIComponent(evaluation.num_documento)}`
                  + `?cod_clase=${encodeURIComponent(evaluation.cod_clase)}`;
                return (
                  <li key={evaluation.id}>
                    <Link
                      href={href}
                      className="flex min-h-12 flex-col justify-between gap-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:flex-row sm:items-center"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-text-primary">
                          {evaluation.nombre_proveedor || "Proveedor sin identificar"}
                        </span>
                        <span className="text-xs text-text-muted">
                          {evaluation.business_date} · {evaluation.cod_clase} {evaluation.num_documento}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full border border-border bg-surface-alt px-2 py-1 text-text-secondary">
                          {label}
                        </span>
                        {summary?.porcentaje_valor_en_senales_de_revision != null && (
                          <span className="text-text-muted">
                            {summary.porcentaje_valor_en_senales_de_revision}% para revisar
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-[0.65rem] text-text-muted">
            Estas evaluaciones describen evidencia de compra y stock; no demuestran que una factura haya causado ventas.
          </p>
        </Card>
      )}

      <Card header={
        <div>
          <h2 className="font-semibold text-text-primary">Detalle de proyección</h2>
          <p className="text-xs text-text-muted">Totales del mismo horizonte; el valor observado se identifica por separado del pronóstico.</p>
        </div>
      }>
        <div className="-mx-4 overflow-x-auto md:mx-0">
          <table className="w-full min-w-[680px] text-sm">
            <caption className="sr-only">Comparación del real observado con los pronósticos totales del mes, base y con inventario</caption>
            <thead>
              <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-[0.12em] text-text-muted">
                <th scope="col" className="px-4 py-2 md:pl-2">Mes</th>
                <th scope="col" className="px-2 py-2">Etapa</th>
                <th scope="col" className="px-2 py-2 text-right">Real observado</th>
                <th scope="col" className="px-2 py-2 text-right">Pronóstico base total</th>
                <th scope="col" className="px-2 py-2 text-right">Total con inventario</th>
                <th scope="col" className="px-4 py-2 text-right md:pr-2">Confianza</th>
              </tr>
            </thead>
            <tbody>
              {projectionRows.map((row) => (
                <tr key={row.month} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-text-primary md:pl-2">{monthLabel(row.month)}</th>
                  <td className="px-2 py-3 text-text-muted">{row.status}</td>
                  <td className="px-2 py-3 text-right tabular-nums">{row.observed === null ? "—" : formatMoneyFull(row.observed)}</td>
                  <td className="px-2 py-3 text-right tabular-nums text-[#2563EB]">{formatMoneyFull(row.base)}</td>
                  <td className="px-2 py-3 text-right font-semibold tabular-nums text-[#9A7414]">{formatMoneyFull(row.stockAdjusted)}</td>
                  <td className="px-4 py-3 text-right md:pr-2">
                    <span className="inline-flex rounded-full border border-border bg-surface-alt px-2 py-1 text-xs font-semibold text-text-secondary">Base {CONFIDENCE_LABELS[row.baseConfidence] ?? "—"} · stock baja</span>
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
