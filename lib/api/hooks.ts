import useSWR, { type KeyedMutator } from "swr";
import { apiFetch, apiFetchJson } from "./client";
import { getCached, setCache } from "@/lib/offline/cache";
import { useAuthStore } from "@/lib/auth/store";

interface Product {
  codprod: string;
  nomprod: string;
  codbar?: string;
  precio?: number;
  [key: string]: unknown;
}

interface ProductsResponse {
  items: Product[];
  total: number;
  limit: number;
  offset: number;
}

interface StockItem {
  codbod: string;
  nombod?: string;
  cantidad: number;
}

interface StockResponse {
  sku: string;
  total: number;
  by_bodega: StockItem[];
}

const CACHE_TTL_CATALOG = 60 * 60 * 1000; // 1 hour
const CACHE_TTL_STOCK = 5 * 60 * 1000; // 5 min

async function fetchWithOfflineFallback<T>(
  url: string,
  ttlMs: number,
): Promise<T> {
  try {
    const data = await apiFetchJson<T>(url);
    await setCache(url, data, ttlMs);
    return data;
  } catch {
    const cached = await getCached<T>(url);
    if (cached) return cached;
    throw new Error("Sin conexión y sin datos cacheados");
  }
}

export function useProducts(query: string, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const url = `/api/products?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`;
  const tenant = useAuthStore((s) => s.currentTenant) ?? "_no_tenant";
  const swrKey: readonly [string, string] = [tenant, url];

  return useSWR<ProductsResponse>(
    swrKey,
    (k: readonly [string, string]) => fetchWithOfflineFallback<ProductsResponse>(k[1], CACHE_TTL_CATALOG),
    {
      revalidateOnFocus: false,
      dedupingInterval: 30_000,
      keepPreviousData: false,
    },
  );
}

export function useStock(sku: string | null) {
  const url = sku ? `/api/products/${encodeURIComponent(sku)}/stock` : null;
  const tenant = useAuthStore((s) => s.currentTenant) ?? "_no_tenant";
  const swrKey: readonly [string, string] | null = url ? [tenant, url] : null;

  return useSWR<StockResponse>(
    swrKey,
    (k: readonly [string, string]) => fetchWithOfflineFallback<StockResponse>(k[1], CACHE_TTL_STOCK),
    {
      revalidateOnFocus: false,
      dedupingInterval: 10_000,
      keepPreviousData: false,
    },
  );
}

// ── Metrics / Dashboards ─────────────────────────────────────────────────

interface TopSkuItem {
  cod_producto: string;
  nom_producto: string;
  cantidad_total: number;
  valor_total: number;
  porcentaje_ingreso?: number;
}

interface SalesSummary {
  business_month: string;
  ventas_mes_actual: number;
  ventas_mes_anterior: number;
  delta_porcentual?: number;
  ticket_promedio: number;
  num_facturas: number;
  top_skus: TopSkuItem[];
}

interface BodegaItem {
  cod_bodega: string;
  nom_bodega: string;
  cantidad: number;
  porcentaje: number;
}

interface InventorySummary {
  stock_total: number;
  valor_total: number;
  num_productos: number;
  por_bodega: BodegaItem[];
}

interface AbcBucket {
  categoria: string;
  num_skus: number;
  valor_total: number;
  porcentaje_ingreso: number;
}

interface AbcSegmentation {
  business_month: string;
  total_skus: number;
  total_ingresos: number;
  bucket_a: AbcBucket;
  bucket_b: AbcBucket;
  bucket_c: AbcBucket;
}

interface DormidoItem {
  cod_producto: string;
  nom_producto: string;
  ultima_compra: string | null;
  dias_sin_venta: number;
  stock_actual: number | null;
}

interface DormidosResponse {
  total: number;
  productos: DormidoItem[];
}

interface CohorteItem {
  cohorte_mes: string;
  mes_observacion: string;
  num_clientes: number;
  ticket_promedio: number;
  tasa_recurrencia?: number | null;
  muestra_pequena?: boolean;
}

interface CohortesResponse {
  cohortes: CohorteItem[];
}

const DEDUP_METRICS = 60_000; // 1 min (DT-F3-10)

function useMetrics<T>(key: string | null): {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<T>;
} {
  // BUG-FIX 2026-06-16: la cache key de SWR era solo la URL, sin el tenant.
  // Al cambiar de negocio, SWR devolvia el response cacheado del tenant
  // anterior porque la key /api/metrics/foo es identica. Resultado: ~2 min
  // de datos congelados hasta el siguiente refresh.
  //
  // Fix: incluir currentTenant en la cache key como tupla [tenant, url].
  // SWR considera arrays como keys distintas → al cambiar tenant, la key
  // cambia → SWR refetch inmediato, no espera el dedupingInterval.
  // Las entradas viejas se mantienen en cache (no las purgamos) pero ya
  // no se devuelven, asi que volver al tenant original tampoco refetch.
  const currentTenant = useAuthStore((s) => s.currentTenant);
  const swrKey: readonly [string, string] | null = key && currentTenant
    ? [currentTenant, key]
    : key
      ? ["_no_tenant", key]
      : null;

  const fetcher = (k: readonly [string, string]): Promise<T> => apiFetchJson<T>(k[1]);

  const { data, error, isLoading, mutate } = useSWR<T>(swrKey, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: DEDUP_METRICS,
    refreshInterval: 60_000, // refresh cada 60s (F7-PERF-1)
    keepPreviousData: false, // al cambiar tenant, NO mostrar datos viejos del anterior
  });
  return { data, error, isLoading, mutate };
}

export function useSalesSummary() {
  return useMetrics<SalesSummary>("/api/metrics/sales-summary");
}

// ── V1.8: Sales Summary V2 ────────────────────────────────────────────

interface SalesSummaryV2PrevWindow {
  from: string;
  to: string;
  amount: number;
  delta_pct: number;
}

interface SalesSummaryV2PrevYear {
  year: number;
  same_day_window_amount: number;
  full_month_amount: number;
  delta_same_window_pct: number | null;
}

interface SalesSummaryV2 {
  business_month: string;
  max_sales_date: string;
  current_month_accumulated: number;
  current_month_days_with_sales: number;
  previous_month_same_window: SalesSummaryV2PrevWindow;
  same_month_previous_years: SalesSummaryV2PrevYear[];
  ticket_promedio: number;
  num_facturas: number;
}

export function useSalesSummaryV2() {
  return useMetrics<SalesSummaryV2>("/api/metrics/sales-summary-v2");
}

// ── V1.8: Daily Month ─────────────────────────────────────────────────

interface SalesDailyDay {
  date: string;
  day: number;
  sales: number;
  invoices: number;
  avg_ticket: number;
  accumulated: number;
}

interface SalesDailyMonth {
  month: string;
  days: SalesDailyDay[];
  total_days_with_sales: number;
}

export function useSalesDailyMonth(month: string) {
  return useMetrics<SalesDailyMonth>(`/api/metrics/sales-daily-month?month=${month}`);
}

// ── V1.8: Forecast Monthly ────────────────────────────────────────────

interface SalesForecastMonth {
  month: string;
  observed_amount?: number;
  projected_amount: number;
  daily_rate?: number;
  days_observed?: number;
  days_total: number;
  last_year_same_month?: number;
  confidence: string;
}

interface SalesForecastMonthly {
  current_month: SalesForecastMonth;
  next_month: SalesForecastMonth;
  model_version: string;
  drivers: string[];
}

export function useSalesForecastMonthly() {
  return useMetrics<SalesForecastMonthly>("/api/metrics/sales-forecast-monthly");
}

// ── V1.8: Data Status ─────────────────────────────────────────────────

interface DataStatus {
  sales_max_date: string;
  sales_days_lag: number;
  inventory_snapshot_date: string;
  invalid_future_sales_rows: number;
  latest_pipeline_run_status: string | null;
  duckdb_freshness_utc: string;
  duckdb_backend: string;
}

export function useDataStatus() {
  return useMetrics<DataStatus>("/api/admin/data/status");
}

export function useInventorySummary() {
  return useMetrics<InventorySummary>("/api/metrics/inventory-summary");
}

export function useAbcSegmentation() {
  return useMetrics<AbcSegmentation>("/api/metrics/abc-segmentation");
}

interface AbcDetalleItem {
  cod_producto: string;
  nom_producto: string;
  valor_total: number;
  porcentaje_bucket: number;
}

interface AbcDetalleResponse {
  bucket: string;
  total_skus: number;
  total_valor: number;
  items: AbcDetalleItem[];
}

export function useAbcDetalle(bucket: string | null, limit = 20) {
  const key = bucket
    ? `/api/metrics/abc-detalle?bucket=${bucket}&limit=${limit}`
    : null;
  return useMetrics<AbcDetalleResponse>(key);
}

export function useDormidos(page = 1, pageSize = 10) {
  return useMetrics<DormidosResponse>(
    `/api/metrics/dormidos?page=${page}&page_size=${pageSize}`,
  );
}

export function useCohortes() {
  return useMetrics<CohortesResponse>("/api/metrics/cohortes");
}

interface SalesTrendItem {
  year: number;
  month: number;
  total_ventas: number;
  num_facturas: number;
  ticket_promedio: number;
}

interface SalesTrendResponse {
  periods: number;
  items: SalesTrendItem[];
}

export function useSalesTrend(periods = 6) {
  return useMetrics<SalesTrendResponse>(
    `/api/metrics/sales-trend?periods=${periods}`,
  );
}

// F7-FIX1 bug 5.4: para comparativa año actual vs año anterior
export function useSalesTrendByYear(year: number, periods = 24) {
  return useMetrics<SalesTrendResponse>(
    `/api/metrics/sales-trend?periods=${periods}&year=${year}`,
  );
}

// ── Nuevos endpoints F7-D (Dev A2) ──────────────────────────────────────────

interface VendedorItem {
  nit_vendedor: string;
  nombre_vendedor: string;
  facturas: number;
  total_ventas: number;
  ticket_promedio: number;
}

interface VendedoresSummaryResponse {
  items: VendedorItem[];
}

export function useVendedoresSummary(period = "month") {
  return useMetrics<VendedoresSummaryResponse>(
    `/api/metrics/vendedores-summary?period=${period}`,
  );
}

interface VendedorCategoriaItem {
  categoria: string;
  total: number;
}

interface VendedorComparacion {
  actual: number;
  anterior: number;
  delta?: number;
}

interface VendedorDetailResponse {
  vendedor_id: string;
  nombre: string;
  ventas_total: number;
  ventas_por_categoria: VendedorCategoriaItem[];
  ticket_promedio: number;
  productos_vendidos: number;
  comparacion_mes_anterior: VendedorComparacion;
}

export function useVendedorDetail(vendedorId: string | null, period = "month") {
  const key = vendedorId
    ? `/api/metrics/vendedores-summary?vendedor_id=${encodeURIComponent(vendedorId)}&period=${period}`
    : null;
  return useMetrics<VendedorDetailResponse>(key);
}

// ── Sales Daily / Historical ────────────────────────────────────────────

export interface SalesDailyItem {
  sku: string;
  nombre: string;
  cantidad: number;
  valor: number;
}

interface SalesDailyResponse {
  date: string;
  total_ventas: number;
  total_facturas: number;
  productos_vendidos: SalesDailyItem[];
}

export function useSalesDaily(date?: string) {
  const qs = date ? `?date=${date}` : "";
  return useMetrics<SalesDailyResponse>(`/api/metrics/sales-daily${qs}`);
}

// ── V1.9 — Sales day & month detail (popup calendario, mensual enriquecido) ──

export interface SalesHourBucket {
  hour: number;
  total_ventas: number;
  num_facturas: number;
  ticket_promedio: number;
}

export interface VendedorDayItem {
  nombre_vendedor: string;
  nit_vendedor: string | null;
  total_ventas: number;
  num_facturas: number;
  porcentaje: number | null;
}

export interface FormaPagoItem {
  cod_formapago: string;
  nombre: string;
  total_ventas: number;
  num_facturas: number;
  porcentaje: number;
}

export interface DayComparativa {
  label: string;
  fecha_comparada: string;
  total_ventas: number;
  delta_porcentaje: number | null;
}

export interface SalesDayDetailResponse {
  date: string;
  total_ventas: number;
  total_facturas: number;
  ticket_promedio: number;
  margen_bruto: number;
  margen_porcentaje: number | null;
  items_por_factura: number;
  ticket_mas_alto: number;
  distribucion_horaria: SalesHourBucket[];
  hora_pico: number | null;
  productos_top: SalesDailyItem[];
  vendedores_top: VendedorDayItem[];
  formas_pago: FormaPagoItem[];
  comparativas: DayComparativa[];
}

export function useSalesDayDetail(date: string | null) {
  return useMetrics<SalesDayDetailResponse>(
    date ? `/api/metrics/sales-day-detail?date=${date}` : null,
  );
}

// TopSkuItem ya definido arriba (linea ~79). Lo re-exportamos para que
// los componentes consumers (page.tsx) puedan tipar usando el mismo shape.
export type { TopSkuItem };

export interface SalesMonthDetailResponse {
  month: string;
  margen_bruto: number;
  margen_porcentaje: number | null;
  vendedores_top: VendedorDayItem[];
  formas_pago: FormaPagoItem[];
  mejor_dia: { date: string; total_ventas: number; num_facturas: number } | null;
  peor_dia: { date: string; total_ventas: number; num_facturas: number } | null;
  aceleradores: TopSkuItem[];
  frenadores: TopSkuItem[];
}

export function useSalesMonthDetail(month: string) {
  return useMetrics<SalesMonthDetailResponse>(
    `/api/metrics/sales-month-detail?month=${month}`,
  );
}

export interface SalesMonthlyForResponse {
  month: string;
  total_ventas: number;
  total_facturas: number;
  delta_porcentaje: number | null;
  productos_top: TopSkuItem[];
}

/**
 * Igual que sales-summary pero parametrizado por mes (el summary clasico
 * siempre devuelve el mes actual, este puede ser cualquiera). Lo usamos
 * para alimentar el card "Productos mas vendidos del mes" cuando el
 * usuario cambia el selector de mes.
 */
export function useSalesMonthlyFor(month: string) {
  return useMetrics<SalesMonthlyForResponse>(
    `/api/metrics/sales-monthly?month=${month}`,
  );
}

// ── V1.9.1 — Cash Closure & Payments History (tab Caja) ──────────────────

export interface CashClosureFormaPago {
  cod_formapago: string;
  nombre: string;
  total_ventas: number;
  num_facturas: number;
  ticket_promedio: number;
  porcentaje: number;
}

export interface CashClosureFactura {
  num_documento: string;
  prefijo: string | null;
  hora: string;
  cliente: string;
  vendedor: string;
  cod_formapago: string;
  nombre_formapago: string;
  total: number;
}

export interface CashClosureResponse {
  date: string;
  total_dia: number;
  total_facturas: number;
  formas_pago: CashClosureFormaPago[];
  facturas: CashClosureFactura[];
  top_facturas_grandes: CashClosureFactura[];
}

export function useCashClosure(date: string | null) {
  return useMetrics<CashClosureResponse>(
    date ? `/api/metrics/cash-closure?date=${date}` : null,
  );
}

export interface PaymentsHistoryFormaSimple {
  cod_formapago: string;
  nombre: string;
  total_ventas: number;
}

export interface PaymentsHistoryMonth {
  month: string; // YYYY-MM
  total: number;
  formas_pago: PaymentsHistoryFormaSimple[];
}

export interface PaymentsVariacionItem {
  cod_formapago: string;
  nombre: string;
  pct_actual: number;
  pct_seis_meses_atras: number;
  delta_puntos: number;
}

export interface PaymentsHistoryResponse {
  months: number;
  formas_pago: { cod_formapago: string; nombre: string }[];
  series: PaymentsHistoryMonth[];
  variacion_seis_meses: PaymentsVariacionItem[];
}

export function usePaymentsHistory(months: number = 12) {
  return useMetrics<PaymentsHistoryResponse>(
    `/api/metrics/payments-history?months=${months}`,
  );
}

// ── V1.9.2 — Sales Day Invoices (página dedicada del día) ────────────────

export interface InvoiceItem {
  num_item: number;
  cod_producto: string;
  nombre: string;
  cantidad: number;
  valor_unitario: number;
  descuento_valor: number;
  iva_valor: number;
  total_detalle: number;
  cod_bodega: string | null;
}

export interface DayInvoice {
  num_documento: string;
  cod_clase: string;
  prefijo: string | null;
  hora: string;
  cliente: string;
  vendedor: string;
  cod_formapago: string;
  nombre_formapago: string;
  subtotal: number;
  total_descuentos: number;
  total_iva: number;
  total: number;
  items: InvoiceItem[];
}

export interface SalesDayInvoicesResponse {
  date: string;
  total_facturas: number;
  total_dia: number;
  total_items: number;
  invoices: DayInvoice[];
}

export function useSalesDayInvoices(date: string | null) {
  return useMetrics<SalesDayInvoicesResponse>(
    date ? `/api/metrics/sales-day-invoices?date=${date}` : null,
  );
}

interface SalesHistoricalResponse {
  total_ventas: number;
  total_facturas: number;
  meses: SalesTrendItem[];
  fecha_primera_venta?: string;
}

export function useSalesHistorical() {
  return useMetrics<SalesHistoricalResponse>("/api/metrics/sales-historical");
}

interface CohorteRetencionItem {
  mes_observacion: string;
  num_clientes: number;
  tasa_recurrencia: number;
}

interface CohorteDetailItem {
  cohorte_mes: string;
  total_clientes: number;
  ltv_promedio: number;
  retencion: CohorteRetencionItem[];
}

interface CohortesDetailResponse {
  cohortes: CohorteDetailItem[];
  total_cohortes: number;
  nuevos_este_mes: number;
  recurrentes_este_mes: number;
  top_recurrentes: number;
}

export function useCohortesDetail() {
  return useMetrics<CohortesDetailResponse>("/api/metrics/cohortes-detail");
}

interface DriftItem {
  metric_name: string;
  detected_at: string;
  drift_magnitude: number;
  threshold: number;
  status: string; // active | resolved | warning
  recommended_action: string;
}

interface DriftSummaryResponse {
  items: DriftItem[];
  total_alerts: number;
  active_count: number;
  warning_count: number;
  current_threshold: number;
}

export function useDriftSummary() {
  return useMetrics<DriftSummaryResponse>("/api/metrics/drift-summary");
}

interface PlanCompraItem {
  sku: string;
  nombre: string;
  stock_actual: number;
  demanda_7d: number;
  cantidad_a_comprar: number;
  abc: string; // A | B | C
  urgencia: string | null; // alta | media | baja
  dormido: boolean;
  supplier: string;
}

interface PlanComprasResponse {
  items: PlanCompraItem[];
  total_skus: number;
  total_unidades: number;
  total_valor_estimado: number;
  skus_urgentes: number;
  skus_dormidos: number;
}

export function usePlanCompras() {
  return useMetrics<PlanComprasResponse>("/api/metrics/plan-compras");
}

interface ForecastCategoriaItem {
  cod_grupo: string;
  demanda_real: number;
  demanda_predicha: number;
  desviacion_pct: number;
  metodo: string;
}

interface ForecastCategoriaResponse {
  items: ForecastCategoriaItem[];
  total_categorias: number;
  wape_promedio: number;
  cobertura_pct: number;
}

export function useForecastCategoria() {
  return useMetrics<ForecastCategoriaResponse>("/api/metrics/forecast-categoria");
}

// ── Forecast / Predicciones ────────────────────────────────────────────────

interface ForecastItem {
  sku: string;
  forecast_date: string;
  horizon: number;
  predicted_qty: number;
  model_version: string;
  confidence_lower?: number;
  confidence_upper?: number;
}

interface ForecastMetrics {
  model_version: string;
  mape?: number;
  smape?: number;
  training_date?: string;
}

interface ForecastResponse {
  sku: string;
  forecast: ForecastItem[];
  metrics?: ForecastMetrics;
}

const FORECAST_DEDUP = 60_000;

export function useForecast(sku: string | null, horizon: number) {
  const url = sku ? `/api/forecast/${encodeURIComponent(sku)}?horizon=${horizon}` : null;
  const tenant = useAuthStore((s) => s.currentTenant) ?? "_no_tenant";
  const swrKey: readonly [string, string] | null = url ? [tenant, url] : null;
  return useSWR<ForecastResponse>(swrKey, (k: readonly [string, string]) => apiFetchJson<ForecastResponse>(k[1]), {
    revalidateOnFocus: false,
    dedupingInterval: FORECAST_DEDUP,
    refreshInterval: 5 * 60_000,
    keepPreviousData: false,
  });
}

interface SemanticMatch {
  codprod: string;
  nomprod: string;
  score: number;
}

interface SemanticSearchResponse {
  query: string;
  results: SemanticMatch[];
  total: number;
}

export function useSemanticSearch(query: string, limit = 10) {
  const key = query.trim().length >= 2
    ? `/api/products/search-semantic?q=${encodeURIComponent(query)}&limit=${limit}`
    : null;
  return useMetrics<SemanticSearchResponse>(key);
}

// ── Alerts / Alertas ──────────────────────────────────────────────────────

interface AlertItem {
  sku: string;
  nom_producto: string;
  stock_actual: number;
  demanda_predicha: number;
  dias_hasta_quiebre: number;
  urgencia: "alta" | "media" | "baja";
}

interface AlertsResponse {
  alerts: AlertItem[];
  total: number;
  timestamp: string;
}

export function useAlerts(urgency?: string) {
  const qs = urgency ? `?urgency=${urgency}` : "";
  const tenant = useAuthStore((s) => s.currentTenant) ?? "_no_tenant";
  const swrKey: readonly [string, string] = [tenant, `/api/alerts/stockout${qs}`];
  return useSWR<AlertsResponse>(
    swrKey,
    (k: readonly [string, string]) => apiFetchJson<AlertsResponse>(k[1]),
    {
      revalidateOnFocus: false,
      dedupingInterval: FORECAST_DEDUP,
      refreshInterval: 5 * 60_000,
      keepPreviousData: false,
    },
  );
}

// ── Forecast Narrative (V1.6 Sprint B) ──────────────────────────────────

interface ForecastNarrativeResponse {
  text: string;
  generated_at: string;
}

export function useForecastNarrative() {
  const tenant = useAuthStore((s) => s.currentTenant) ?? "_no_tenant";
  const swrKey: readonly [string, string] = [tenant, "/api/llm/forecast/explain"];
  return useSWR<ForecastNarrativeResponse>(
    swrKey,
    async (k: readonly [string, string]) => {
      const resp = await apiFetch(k[1], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(err);
      }
      return resp.json();
    },
    {
      revalidateOnFocus: false,
      dedupingInterval: 60 * 60 * 1000, // 1h cache cliente
      refreshInterval: 0, // no auto-refresh
      keepPreviousData: false,
    },
  );
}

// ── Q&A Chat (V1.6 Sprint C) ────────────────────────────────────────────

interface QAChatResponse {
  text: string;
  conversation_id: string;
  turn_count: number;
  tools_used: string[];
}

export function useSendMessage(conversationId: string) {
  return async (message: string): Promise<QAChatResponse> => {
    const resp = await apiFetch("/api/llm/qa/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, conversation_id: conversationId }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(err);
    }
    return resp.json();
  };
}

// ── Pipeline Observability (V1.7) ──────────────────────────────────────

export interface PipelineRun {
  id: number;
  pipeline_name: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "failed";
  duration_seconds: number | null;
  rows_processed: number | null;
  triggered_by: string;
  error_message: string | null;
}

export interface PipelineStep {
  id: number;
  run_id: number;
  step_order: number;
  step_name: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "success" | "failed";
  duration_seconds: number | null;
  rows_processed: number | null;
  log_excerpt: string | null;
  error_message: string | null;
}

export interface PipelineSummary {
  success_rate_30d_pct: number;
  avg_duration_seconds: number;
  total_runs_30d: number;
  last_run_status: "running" | "success" | "failed" | null;
  last_run_finished_at: string | null;
}

interface PipelineRunsResponse {
  runs: PipelineRun[];
  total: number;
}

interface PipelineRunDetail extends PipelineRun {
  steps: PipelineStep[];
  log_excerpt: string | null;
}

export function usePipelineRuns(limit = 30, pipeline?: string, status?: string) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (pipeline) params.set("pipeline", pipeline);
  if (status) params.set("status", status);
  return useMetrics<PipelineRunsResponse>(`/api/admin/pipeline/runs?${params.toString()}`);
}

export function usePipelineRun(id: number | null) {
  return useMetrics<PipelineRunDetail>(id ? `/api/admin/pipeline/runs/${id}` : null);
}

export function usePipelineSummary() {
  return useMetrics<PipelineSummary>("/api/admin/pipeline/summary");
}

// ── V1.8.1: Data Catalog ──────────────────────────────────────────────

export interface CatalogTable {
  table_name: string;
  layer: string;
  row_count: number;
  column_count: number;
  date_column: string | null;
  max_date: string | null;
  status: string;
  warnings: string[];
}

export interface CatalogDetail {
  table_name: string;
  layer: string;
  row_count: number;
  columns: { name: string; type: string; null_count: number; null_pct: number }[];
  sample_rows: Record<string, unknown>[];
  quality?: { null_counts?: Record<string,number>; max_date?: string|null; warnings?: string[] };
  max_date?: string | null;
  date_column?: string | null;
  status?: string;
  warnings?: string[];
}

export interface LineageEdge {
  from: string;
  to: string;
  transform: string;
}

export interface CatalogResponse {
  duckdb_freshness_utc?: string;
  layers?: { name: string; table_count: number; total_rows: number; max_date?: string; warnings?: number }[];
  tables: CatalogTable[];
}

export function useCatalog() {
  return useMetrics<CatalogResponse>("/api/admin/data/catalog");
}

export function useCatalogTable(name: string | null) {
  return useMetrics<CatalogDetail>(name ? `/api/admin/data/catalog/${encodeURIComponent(name)}` : null);
}

export function useLineage() {
  return useMetrics<LineageEdge[]>("/api/admin/data/lineage");
}

// ── V1.9: Inventory Detail + Discrepancies ────────────────────────────

interface InventoryItem {
  cod_producto: string;
  nom_producto: string;
  cod_bodega: string;
  nom_bodega: string;
  stock_actual: number;
  costo_unitario: number;
  valor_inventario: number;
  ultima_venta: string | null;
  dias_sin_venta: number;
  es_dormido: boolean;
  abc: string;
}

interface InventoryDetailResponse {
  items: InventoryItem[];
  total: number;
  page: number;
  page_size: number;
}

interface InventoryDiscrepancyItem {
  cod_producto: string;
  nom_producto: string;
  stock_dormidos: number;
  stock_inventario: number;
  diff: number;
  dias_sin_venta: number;
}

interface InventoryDiscrepanciesResponse {
  discrepancies: InventoryDiscrepancyItem[];
  total_discrepancies: number;
  summary: {
    dormidos_total_stock: number;
    inventario_total_stock: number;
    invariant_ok: boolean;
    invariant_msg: string;
  };
}

export function useInventoryDetail(
  page = 1,
  page_size = 30,
  q?: string,
  bodega?: string,
  sort?: string,
  stock?: "todos" | "con_stock" | "sin_stock",
  dormido?: "todos" | "true" | "false",
  abc?: string,
) {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("page_size", String(page_size));
  if (q) params.set("q", q);
  if (bodega) params.set("bodega", bodega);
  if (sort) params.set("sort", sort);
  if (stock) params.set("stock", stock);
  if (dormido) params.set("dormido", dormido);
  if (abc) params.set("abc", abc);
  return useMetrics<InventoryDetailResponse>(`/api/metrics/inventory-detail?${params.toString()}`);
}

export function useInventoryDiscrepancies() {
  return useMetrics<InventoryDiscrepanciesResponse>("/api/metrics/inventory-discrepancies");
}

// ── Product Movements (Inventario popup) ────────────────────────────────

export interface MovementItem {
  tipo: "venta" | "compra";
  fecha: string;
  documento: string;
  cantidad: number;
  valor_unitario: number;
  total: number;
}

export interface ProductMovementsResponse {
  sku: string;
  nom_producto: string | null;
  ventas: MovementItem[];
  compras: MovementItem[];
  stock_actual: number;
  total_ventas: number;
  total_compras: number;
  ultimo_costo_unitario: number | null;
  ultimo_precio_venta: number | null;
}

// ── Purchases Day Detail (V2.0) ───────────────────────────────────────────

export interface PurchaseDayDocument {
  num_documento: string;
  cod_producto: string;
  nom_producto: string;
  cantidad: number;
  valor_unitario: number;
  costo_producto: number | null;
  total: number;
}

export interface PurchasesDayDetailResponse {
  date: string;
  total_compras: number;
  total_documentos: number;
  items: PurchaseDayDocument[];
}

export function usePurchasesDayDetail(date: string | null) {
  return useMetrics<PurchasesDayDetailResponse>(
    date ? `/api/metrics/purchases-day-detail?date=${date}` : null,
  );
}

export function useProductMovements(sku: string | null) {
  const url = sku ? `/api/products/${encodeURIComponent(sku)}/movements` : null;
  const tenant = useAuthStore((s) => s.currentTenant) ?? "_no_tenant";
  const swrKey: readonly [string, string] | null = url ? [tenant, url] : null;

  return useSWR<ProductMovementsResponse>(
    swrKey,
    (k: readonly [string, string]) => apiFetchJson<ProductMovementsResponse>(k[1]),
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
      keepPreviousData: false,
    },
  );
}

// ── Multi-tenant (M2): /api/auth/me ──────────────────────────────────────

export interface MeResponse {
  username: string;
  email: string;
  role: string;
  tenants_allowed: string[];
  current_tenant: string;
  enabled_features: string[];
}

/**
 * Hook que obtiene /api/auth/me con el X-Tenant activo y popula el store.
 * Se invoca después del login o al cambiar de tenant.
 *
 * El fetcher manual (no SWR) porque se llama una vez por flujo de
 * login / change-tenant, no periódicamente.
 */
export async function fetchMe(): Promise<MeResponse> {
  return apiFetchJson<MeResponse>("/api/auth/me");
}
