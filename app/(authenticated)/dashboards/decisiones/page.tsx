"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useForecast,
  useForecastCategoria,
  useForecastNarrative,
  useProducts,
  useSalesForecastMonthly,
  useInventarioOverview,
  useSalesSummaryV2,
  useSalesMonthDetail,
  type TopSkuItem,
} from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { StaleDataBanner } from "@/components/StaleDataBanner";
import { ComprarTab } from "@/components/inventario/ComprarTab";
import { OptimizarTab } from "@/components/inventario/OptimizarTab";
import {
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

const HORIZON_OPTIONS = [7, 14, 30] as const;

// V1.24: dashboard "Decisiones" — absorbe el viejo /forecast + los tabs
// Comprar/Optimizar que vivían dentro de Inventario.
type DecisionTab = "comprar" | "vender" | "mensual" | "demanda";

const TAB_LABELS: Record<DecisionTab, string> = {
  comprar: "🛒 Comprar",
  vender: "🏷 Vender",
  mensual: "💰 Proyección $",
  demanda: "📈 Demanda 30d",
};

const VALID_TABS: DecisionTab[] = ["comprar", "vender", "mensual", "demanda"];

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

function DecisionesContent(): JSX.Element {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as DecisionTab | null;
  const [tab, setTab] = useState<DecisionTab>(
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : "comprar",
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== tab) {
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url);
    }
  }, [tab]);

  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-accent hover:underline">
        ← Volver a inicio
      </Link>

      <div>
        <h1 className="text-xl font-bold text-text-primary">Decisiones</h1>
        <p className="text-sm text-text-muted">
          Qué comprar, qué vender, qué esperar — todo lo que viene en el corto plazo.
        </p>
      </div>

      <StaleDataBanner />

      <div className="-mx-4 overflow-x-auto border-b border-border pb-2 md:mx-0">
        <div className="flex gap-2 whitespace-nowrap px-4 md:flex-wrap md:px-0">
          {VALID_TABS.map((t) => (
            <TabButton key={t} active={tab === t} onClick={() => setTab(t)} label={TAB_LABELS[t]} />
          ))}
        </div>
      </div>

      {tab === "comprar" && <ComprarTab />}
      {tab === "vender" && <OptimizarTab />}
      {tab === "mensual" && <MensualTab />}
      {tab === "demanda" && <DemandaTab />}
    </div>
  );
}

export default function DecisionesPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <DecisionesContent />
    </Suspense>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-surface-dark text-text-inverse"
          : "bg-surface-alt text-text-secondary hover:bg-surface-alt/70"
      }`}
    >
      {label}
    </button>
  );
}

// ── TAB 1: Mensual (proyección financiera) ──────────────────────────────

function MensualTab(): JSX.Element {
  const { data } = useSalesForecastMonthly();

  // V1.26: skeleton mientras no hay data (loading o revalidando sin data en cache)
  // en vez de mostrar "Sin datos" prematuramente.
  if (!data) return <Card><Skeleton className="h-64 rounded-lg" /></Card>;

  const cm = data.current_month;
  const nm = data.next_month;
  const observed = cm.observed_amount ?? 0;
  const pendingCurrent = Math.max(0, cm.projected_amount - observed);

  const barData = [
    { label: monthLabel(cm.month), real: observed, proy: pendingCurrent },
    { label: monthLabel(nm.month), real: 0, proy: nm.projected_amount },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="space-y-2 text-xs text-text-muted">
          <p>
            <strong className="text-text-primary">Cómo se calcula:</strong>{" "}
            el ritmo de venta diario se toma de los <strong>últimos 90 días completos</strong>{" "}
            (excluyendo el mes en curso) y se proyecta a los días restantes del mes actual y a todo el mes siguiente.
          </p>
          <p>
            <strong className="text-text-primary">Por qué no cambia día a día:</strong>{" "}
            el rate se &ldquo;congela&rdquo; sobre datos cerrados, así el número proyectado del mes en curso
            sólo se mueve por lo que vas vendiendo (parte real), no por re-cálculos del rate.
            Al cerrar el mes, el rate se actualiza naturalmente con el mes recién terminado.
          </p>
          {data.rate_basis && data.rate_basis !== "rolling_90d_complete" && (
            <p className="text-amber-700">
              ⚠️ Forecast usando fallback: <strong>{data.rate_basis}</strong> (no hay 90d completos de datos).
            </p>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <Stat
            label={`Mes en curso — ${monthLabel(cm.month)}`}
            value={formatMoneyFull(cm.projected_amount)}
            subtitle={`Real hasta hoy: ${formatMoneyFull(observed)} · proyectado: ${formatMoneyFull(pendingCurrent)} · confianza ${cm.confidence}`}
          />
        </Card>
        <Card>
          <Stat
            label={`Próximo mes — ${monthLabel(nm.month)}`}
            value={formatMoneyFull(nm.projected_amount)}
            subtitle={`${nm.days_total} días · confianza ${nm.confidence}${
              nm.last_year_same_month ? ` · año pasado mismo mes: ${formatMoneyFull(nm.last_year_same_month)}` : ""
            }`}
          />
        </Card>
      </div>

      <Card header={<h2 className="font-semibold text-text-primary">Mes actual y siguiente</h2>}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#a3a3a3" />
            <YAxis tick={{ fontSize: 10 }} stroke="#a3a3a3" tickFormatter={(v: number) => `$${(v / 1e6).toFixed(1)}M`} />
            <Tooltip
              formatter={(value, name) => [formatMoneyFull(Number(value)), name === "real" ? "Real" : "Proyectado"]}
              contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
            />
            <Bar dataKey="real" fill="#7B1818" stackId="a" radius={[0, 0, 0, 0]} name="real" />
            <Bar dataKey="proy" fill="#FCD34D" stackId="a" radius={[4, 4, 0, 0]} name="proy" />
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 flex items-center gap-4 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded" style={{ background: "#7B1818" }} /> Real (ya vendido)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded" style={{ background: "#FCD34D" }} /> Proyectado
          </span>
        </div>
      </Card>

      <Card>
        <div className="text-xs text-text-muted">
          <strong className="text-text-primary">Modelo:</strong> {data.model_version}
          {data.rate_window && (
            <> · <strong className="text-text-primary">Ventana base:</strong> {data.rate_window.start} → {data.rate_window.end} ({data.rate_window.days_with_sales} días con venta)</>
          )}
        </div>
      </Card>
    </div>
  );
}

// ── TAB 2: Por demanda — vista de decisiones ────────────────────────────

function currentMonthYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function DemandaTab(): JSX.Element {
  const router = useRouter();
  const { data: inv, isLoading: invLoading } = useInventarioOverview();
  const { data: forecast } = useSalesForecastMonthly();
  const sales = useSalesSummaryV2();
  const monthDetail = useSalesMonthDetail(sales.data?.business_month ?? currentMonthYM());

  // Cálculos de demanda esperada por SKU (rotacion_diaria × 30)
  const itemsConDemanda = useMemo(() => {
    if (!inv) return [];
    return inv.items
      .filter((it) => it.rotacion_diaria > 0)
      .map((it) => {
        const demanda30d = it.rotacion_diaria * 30;
        const faltante = Math.max(0, demanda30d - it.stock);
        const cobertura = it.rotacion_diaria > 0 ? it.stock / it.rotacion_diaria : null;
        const revenueEsperado = demanda30d * it.precio_venta;
        const estado: "ok" | "ajustado" | "faltante" =
          faltante > 0 ? "faltante" : (cobertura !== null && cobertura < 45) ? "ajustado" : "ok";
        return { ...it, demanda30d, faltante, cobertura, revenueEsperado, estado };
      })
      .sort((a, b) => b.revenueEsperado - a.revenueEsperado);
  }, [inv]);

  const kpiUnidades30d = useMemo(
    () => itemsConDemanda.reduce((s, it) => s + it.demanda30d, 0),
    [itemsConDemanda],
  );
  const kpiSkusEnRiesgo = useMemo(
    () => itemsConDemanda.filter((it) => it.faltante > 0).length,
    [itemsConDemanda],
  );
  const kpiInversionSugerida = useMemo(
    () => itemsConDemanda.reduce((s, it) => s + it.faltante * it.costo_unit, 0),
    [itemsConDemanda],
  );
  const top30 = useMemo(() => itemsConDemanda.slice(0, 30), [itemsConDemanda]);

  if (invLoading && !inv) {
    return <Card><Skeleton className="h-96 rounded-lg" /></Card>;
  }

  return (
    <div className="space-y-4">
      {/* Hero: KPIs accionables */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <Stat
            label="Vas a facturar — próximo mes"
            value={forecast ? formatMoneyFull(forecast.next_month.projected_amount) : "—"}
            subtitle={forecast ? `${forecast.next_month.month} · confianza ${forecast.next_month.confidence}` : ""}
          />
        </Card>
        <Card>
          <Stat
            label="Vas a vender — próximos 30 días"
            value={`${Math.round(kpiUnidades30d).toLocaleString("es-CO")} u`}
            subtitle={`estimado sobre ${itemsConDemanda.length.toLocaleString("es-CO")} SKUs activos`}
          />
        </Card>
        <Card>
          <Stat
            label="Productos a quedarse cortos"
            value={kpiSkusEnRiesgo.toLocaleString("es-CO")}
            subtitle={`inversión sugerida: ${formatMoneyFull(kpiInversionSugerida)}`}
          />
        </Card>
      </div>

      {/* Tabla principal: Demanda esperada vs stock */}
      <Card header={
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-text-primary">Demanda esperada próximos 30 días</h2>
            <p className="text-xs text-text-muted">
              Top {top30.length} por ingreso esperado · click en fila → ficha del producto
            </p>
          </div>
          <Badge variant="default" size="sm">
            {kpiSkusEnRiesgo} en riesgo
          </Badge>
        </div>
      }>
        {top30.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">Sin datos suficientes.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto md:mx-0">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                  <th className="py-2 pl-4 pr-2 md:pl-2">#</th>
                  <th className="py-2 px-2">Producto</th>
                  <th className="py-2 px-2 text-right">Stock</th>
                  <th className="py-2 px-2 text-right">Demanda 30d</th>
                  <th className="py-2 px-2 text-right">Faltante</th>
                  <th className="py-2 px-2 text-right">Cobertura</th>
                  <th className="py-2 px-2 text-right">$ esperado</th>
                  <th className="py-2 pl-2 pr-4 md:pr-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {top30.map((it, idx) => (
                  <tr
                    key={it.cod_producto}
                    className="border-b border-border/60 hover:bg-surface-alt cursor-pointer"
                    onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(it.cod_producto)}`)}
                  >
                    <td className="py-2 pr-2 text-xs text-text-muted tabular-nums">{idx + 1}</td>
                    <td className="py-2 px-2">
                      <div className="font-medium text-text-primary truncate max-w-xs">{it.nom_producto}</div>
                      <div className="text-[0.65rem] text-text-muted">{it.cod_producto}</div>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{Math.round(it.stock).toLocaleString("es-CO")}</td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium">
                      {Math.round(it.demanda30d).toLocaleString("es-CO")} {it.unidad_medida ?? "u"}
                    </td>
                    <td className={`py-2 px-2 text-right tabular-nums ${it.faltante > 0 ? "text-red-700 font-semibold" : "text-text-muted"}`}>
                      {it.faltante > 0 ? `−${Math.round(it.faltante).toLocaleString("es-CO")}` : "—"}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-text-muted">
                      {it.cobertura !== null ? `${Math.round(it.cobertura)}d` : "—"}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-semibold">
                      {formatMoneyFull(it.revenueEsperado)}
                    </td>
                    <td className="py-2 pl-2">
                      <EstadoChip estado={it.estado} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[0.65rem] text-text-muted">
          Demanda 30d = rotación diaria × 30 sobre datos cerrados de los últimos 90 días.
          Faltante = lo que necesitarías comprar para cubrir la demanda esperada.
        </p>
      </Card>

      {/* Aceleradores / Frenadores */}
      {monthDetail.data && (monthDetail.data.aceleradores.length > 0 || monthDetail.data.frenadores.length > 0) && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card header={<h2 className="font-semibold text-green-700">📈 Aceleradores — productos que están creciendo</h2>}>
            {monthDetail.data.aceleradores.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">Sin aceleradores este mes.</p>
            ) : (
              <ul className="space-y-1.5">
                {monthDetail.data.aceleradores.slice(0, 10).map((p: TopSkuItem) => (
                  <li
                    key={p.cod_producto}
                    onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(p.cod_producto)}`)}
                    className="flex cursor-pointer items-center justify-between gap-2 hover:bg-surface-alt rounded px-1.5 py-1"
                  >
                    <span className="text-sm text-text-primary truncate">{p.nom_producto}</span>
                    <span className="text-sm font-semibold text-green-700 shrink-0">
                      {formatMoneyFull(p.valor_total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[0.65rem] text-text-muted">
              Considerá reforzar stock — la demanda está empujando.
            </p>
          </Card>

          <Card header={<h2 className="font-semibold text-red-700">📉 Frenadores — productos que se están enfriando</h2>}>
            {monthDetail.data.frenadores.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">No hay productos en caída relevante.</p>
            ) : (
              <ul className="space-y-1.5">
                {monthDetail.data.frenadores.slice(0, 10).map((p: TopSkuItem) => (
                  <li
                    key={p.cod_producto}
                    onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(p.cod_producto)}`)}
                    className="flex cursor-pointer items-center justify-between gap-2 hover:bg-surface-alt rounded px-1.5 py-1"
                  >
                    <span className="text-sm text-text-primary truncate">{p.nom_producto}</span>
                    <span className="text-sm font-semibold text-red-700 shrink-0">
                      {formatMoneyFull(p.valor_total)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[0.65rem] text-text-muted">
              Frená compras de estos — el stock actual puede estar excedido.
            </p>
          </Card>
        </div>
      )}

      {/* Análisis técnico (colapsable) — para devs/data */}
      <Card>
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-text-primary">
            🔬 Análisis técnico del modelo (avanzado)
          </summary>
          <div className="mt-4 space-y-4">
            <SeccionTecnica />
          </div>
        </details>
      </Card>
    </div>
  );
}

/** Chip de estado del item en la tabla de demanda esperada. */
function EstadoChip({ estado }: { estado: "ok" | "ajustado" | "faltante" }): JSX.Element {
  const cfg = {
    ok: { label: "✓ OK", color: "#15803D", bg: "#DCFCE7" },
    ajustado: { label: "● Ajustado", color: "#C2410C", bg: "#FFEDD5" },
    faltante: { label: "▲ Faltante", color: "#B91C1C", bg: "#FEE2E2" },
  }[estado];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

/** Sección técnica: confiabilidad del modelo, drilldown SKU, comparativa por categoría. */
function SeccionTecnica(): JSX.Element {
  const [sku, setSku] = useState("");
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [horizon, setHorizon] = useState<number>(7);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data, error, isLoading } = useForecast(selectedSku, horizon);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(sku), 300);
    return () => clearTimeout(timer);
  }, [sku]);

  const { data: productsData } = useProducts(searchQuery, 1, 20);

  const suggestions = useMemo(() => {
    if (!productsData?.items) return [];
    return productsData.items
      .filter((p) => p.has_forecast === true)
      .map((p) => ({ sku: p.codprod, label: p.nomprod }));
  }, [productsData]);

  const chartData = useMemo(() => {
    if (!data?.forecast) return [];
    return data.forecast.map((f) => ({
      date: f.forecast_date.slice(5),
      predicted: f.predicted_qty,
      lower: f.confidence_lower ?? f.predicted_qty * 0.8,
      upper: f.confidence_upper ?? f.predicted_qty * 1.2,
    }));
  }, [data]);

  const { data: categoriaData } = useForecastCategoria();
  const { data: narrative, isLoading: narrativeLoading, mutate: refreshNarrative } = useForecastNarrative();

  function handleSelect(suggestionSku: string) {
    setSku(suggestionSku);
    setSelectedSku(suggestionSku);
    setShowSuggestions(false);
  }

  function handleSearch() {
    if (sku.trim()) {
      setSelectedSku(sku.trim().toUpperCase());
      setShowSuggestions(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Narrativa LLM */}
      {narrativeLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : narrative ? (
        <div className="rounded-lg border border-border bg-surface-alt/40 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Análisis IA</span>
            <button
              onClick={() => refreshNarrative()}
              className="rounded px-2 py-0.5 text-[0.65rem] text-text-muted hover:bg-surface hover:text-text-secondary"
            >
              Regenerar
            </button>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
            {narrative.text}
          </p>
        </div>
      ) : null}

      {/* Confiabilidad por categoría */}
      {categoriaData?.items && categoriaData.items.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-text-primary">Confiabilidad por categoría</h3>
            <Badge variant="default" size="sm">
              WAPE: {categoriaData.wape_promedio?.toFixed(1)}% · {categoriaData.total_categorias} cat.
            </Badge>
          </div>
          <div className="space-y-1.5">
            {categoriaData.items.slice().sort((a, b) => b.demanda_real - a.demanda_real).map((cat) => (
              <div
                key={cat.cod_grupo}
                className="flex items-center justify-between gap-3 rounded border border-border bg-surface px-3 py-2 text-xs"
              >
                <span className="font-mono font-medium text-text-primary">
                  {cat.cod_grupo === "SIN_GRUPO" ? "Sin clasificar" : cat.cod_grupo}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-text-muted">Real {cat.demanda_real.toFixed(0)}u</span>
                  <span className="text-text-muted">Pred {cat.demanda_predicha.toFixed(0)}u</span>
                  <Badge
                    variant={Math.abs(cat.desviacion_pct) > 20 ? "error" : Math.abs(cat.desviacion_pct) > 10 ? "warning" : "success"}
                    size="sm"
                  >
                    {cat.desviacion_pct > 0 ? "+" : ""}{cat.desviacion_pct.toFixed(1)}%
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drilldown SKU */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Drilldown por SKU</h3>
        <p className="text-xs text-text-muted mb-2">
          Predicción individual del modelo formal (Prophet/ARIMA). Sólo SKUs con suficiente historia.
        </p>
        <div className="relative">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={sku}
                onChange={(e) => {
                  setSku(e.target.value);
                  setShowSuggestions(true);
                  if (selectedSku && e.target.value !== selectedSku) setSelectedSku(null);
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Ej: MOTS1297"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg">
                  {suggestions.map((s) => (
                    <button
                      key={s.sku}
                      onMouseDown={() => handleSelect(s.sku)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-alt"
                    >
                      <span className="font-mono text-xs font-medium text-primary">{s.sku}</span>
                      <span className="truncate text-text-secondary">{s.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleSearch}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:bg-primary-light"
            >
              Buscar
            </button>
          </div>
        </div>

        {selectedSku && (
          <div className="mt-2 flex gap-2">
            {HORIZON_OPTIONS.map((h) => (
              <button
                key={h}
                onClick={() => setHorizon(h)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  horizon === h ? "bg-primary text-primary-fg" : "bg-surface-alt text-text-secondary hover:bg-surface-alt/80"
                }`}
              >
                {h} días
              </button>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-60 rounded-xl" />
          </div>
        )}

        {error && (
          <div className="mt-3">
            <ErrorState title="Error al cargar" message="No se pudieron obtener los datos de predicciones." severity="warning" />
          </div>
        )}

        {data && chartData.length > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-surface p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-text-primary">{data.sku}</h4>
              {data.metrics && (
                <Badge variant="default" size="sm">
                  MAPE: {data.metrics.mape?.toFixed(1)}% · v{data.metrics.model_version}
                </Badge>
              )}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#a3a3a3" />
                <YAxis tick={{ fontSize: 11 }} stroke="#a3a3a3" tickFormatter={(v: number) => Math.round(v).toString()} />
                <Tooltip
                  formatter={(value) => [Math.round(Number(value ?? 0)).toString(), "unidades"]}
                  contentStyle={{ borderRadius: "8px", border: "1px solid #d4d4d4", fontSize: "12px" }}
                />
                <Area type="monotone" dataKey="upper" stroke="none" fill="#0EA5E9" fillOpacity={0.1} />
                <Area type="monotone" dataKey="lower" stroke="none" fill="#FFFFFF" fillOpacity={0.3} />
                <Line type="monotone" dataKey="predicted" stroke="#0EA5E9" strokeWidth={2} dot={{ r: 3, fill: "#0EA5E9" }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Nota metodológica */}
      <details className="text-xs text-text-muted">
        <summary className="cursor-pointer font-medium">¿Por qué el forecast principal usa rotación y no Prophet por SKU?</summary>
        <div className="mt-2 space-y-1">
          <p>
            El catálogo tiene ~6.000 SKUs. La mayoría con &lt;30 ventas/año — demanda intermitente, sin
            confianza estadística para Prophet por SKU.
          </p>
          <p>
            Por eso la tabla principal usa rotación diaria (últimos 90d cerrados) × 30 → demanda esperada.
            Es simple pero estable y accionable. El modelo formal Prophet/ARIMA queda como drilldown
            para los SKUs que sí tienen historia (WAPE ~34% por categoría vs 45%+ por SKU).
          </p>
        </div>
      </details>
    </div>
  );
}

