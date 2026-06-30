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
  /** V1.15: unidad real (u, g, kg, L, etc.) — default "u". */
  unidad_medida?: string;
  presentacion?: string | null;
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

  const { data, error, isLoading, isValidating, mutate } = useSWR<T>(swrKey, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: DEDUP_METRICS,
    refreshInterval: 60_000, // refresh cada 60s (F7-PERF-1)
    keepPreviousData: false, // al cambiar tenant, NO mostrar datos viejos del anterior
    // RESILIENCIA COLD START (2026-06-16): Render Free duerme el servidor;
    // la 1ra request tras inactividad tarda 30-60s y puede fallar. Antes el
    // usuario veia error y tenia que recargar a mano. Ahora SWR reintenta
    // automaticamente hasta 6 veces cada 4s, asi se recupera solo cuando el
    // backend despierta.
    shouldRetryOnError: true,
    errorRetryCount: 6,
    errorRetryInterval: 4000,
  });
  // isLoadingOrRetrying: true mientras carga O reintenta sin data aun.
  // Los componentes lo usan para mostrar "cargando" en vez de vacio/error.
  const isLoadingOrRetrying = (isLoading || (isValidating && data === undefined));
  return { data, error, isLoading: isLoadingOrRetrying, mutate };
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
  /** V1.15: unidad real (u, g, kg, L, etc.) — default "u". */
  unidad_medida?: string;
  presentacion?: string | null;
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
 *
 * productsLimit: cuantos productos top traer. Default 10 para el preview.
 * Pasar un numero grande (ej 5000) para "ver todos" sin paginacion.
 */
export function useSalesMonthlyFor(month: string, productsLimit = 10) {
  return useMetrics<SalesMonthlyForResponse>(
    `/api/metrics/sales-monthly?month=${month}&products_limit=${productsLimit}`,
  );
}

export interface SalesHistoricalProductsResponse {
  items: TopSkuItem[];
  total_skus_con_venta: number;
}

/**
 * Top productos vendidos en TODO el histórico (agregado por SKU).
 * productsLimit: 10 para preview, 5000 para "ver todos".
 */
export function useSalesHistoricalProducts(productsLimit = 10) {
  return useMetrics<SalesHistoricalProductsResponse>(
    `/api/metrics/sales-historical-products?limit=${productsLimit}`,
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
  costo_unitario: number;
  costo_total: number;
  ganancia: number | null;
  margen_pct: number | null;
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
  costo_total: number;
  ganancia: number | null;
  margen_pct: number | null;
  items: InvoiceItem[];
}

export interface SalesDayInvoicesResponse {
  date: string;
  total_facturas: number;
  total_dia: number;
  total_costo: number;
  total_ganancia: number | null;
  total_items: number;
  invoices: DayInvoice[];
}

export function useSalesDayInvoices(date: string | null) {
  return useMetrics<SalesDayInvoicesResponse>(
    date ? `/api/metrics/sales-day-invoices?date=${date}` : null,
  );
}

// ── V1.10 — Analítica de productos / inventario ──────────────────────────

export type ProductEstado =
  | "saludable" | "quiebre" | "agotado" | "sobrestock"
  | "dormido" | "sin_stock" | "sin_movimiento" | "servicio";
export type ProductAccion = "reabastecer" | "liquidar" | "revisar" | "ok" | "n/a";
export type ProductAbc = "A" | "B" | "C" | "sin_venta";

export interface ProductMetric {
  cod_producto: string;
  nombre: string;
  cantidad_actual: number;
  costo_unit: number;
  precio: number;
  valor_inventario: number;
  revenue_win: number;
  unidades_win: number;
  margen_win: number;
  margen_pct: number | null;
  velocidad_mensual: number;
  dias_stock: number | null;
  rotacion_anual: number | null;
  ultima_venta: string | null;
  dias_sin_venta: number | null;
  ultima_compra: string | null;
  dias_sin_compra: number | null;
  proveedor: string | null;
  pct_revenue: number;
  rank_rev: number | null;
  abc: ProductAbc;
  estado: ProductEstado;
  es_servicio: boolean;
  accion: ProductAccion;
}

export interface DecisionList {
  total: number;
  valor: number;
  items: ProductMetric[];
}

export interface InventoryOverview {
  window_days: number;
  kpis: {
    valor_inventario_total: number;
    skus_con_stock: number;
    skus_activos: number;
    rotacion_promedio: number;
    revenue_total_win: number;
    margen_total_win: number;
  };
  pareto: {
    skus_activos: number;
    skus_para_80: number;
    skus_para_50: number;
    pct_para_80: number;
    curva: { pct_productos: number; pct_revenue_acum: number }[];
  };
  estados: { estado: string; n: number; valor: number }[];
  listas: {
    quiebre_inminente: DecisionList;
    capital_atrapado: DecisionList;
    importantes_sin_recompra: DecisionList;
    dormidos_premium: DecisionList;
  };
}

export function useInventoryOverview(window = 180) {
  return useMetrics<InventoryOverview>(`/api/metrics/inventory-overview?window=${window}`);
}

export interface ProductAnalyticsResponse {
  window_days: number;
  page: number;
  page_size: number;
  total: number;
  items: ProductMetric[];
}

export interface ProductAnalyticsParams {
  window?: number;
  page?: number;
  pageSize?: number;
  q?: string;
  abc?: string;
  estado?: string;
  sort?: string;
  order?: "asc" | "desc";
}

export function useProductAnalytics(p: ProductAnalyticsParams = {}) {
  const qs = new URLSearchParams();
  qs.set("window", String(p.window ?? 180));
  qs.set("page", String(p.page ?? 1));
  qs.set("page_size", String(p.pageSize ?? 50));
  if (p.q) qs.set("q", p.q);
  if (p.abc) qs.set("abc", p.abc);
  if (p.estado) qs.set("estado", p.estado);
  qs.set("sort", p.sort ?? "revenue_win");
  qs.set("order", p.order ?? "desc");
  return useMetrics<ProductAnalyticsResponse>(`/api/metrics/product-analytics?${qs.toString()}`);
}

export interface ProductTimelineMonth {
  mes: string;
  unidades_vendidas: number;
  valor_vendido: number;
  unidades_compradas: number;
  valor_comprado: number;
}

export interface ProductMovimiento {
  fecha: string;
  tipo: "venta" | "compra";
  cantidad: number;
  valor: number;
  num_documento: string;
}

export interface ProductDetailResponse {
  found: boolean;
  sku?: string;
  window_days?: number;
  metrics?: ProductMetric;
  timeline?: ProductTimelineMonth[];
  movimientos?: ProductMovimiento[];
}

export function useProductDetail(sku: string | null, window = 180) {
  return useMetrics<ProductDetailResponse>(
    sku ? `/api/metrics/product-detail/${encodeURIComponent(sku)}?window=${window}` : null,
  );
}

// ── V1.10.1 — Mapa ABC + historico extendido ─────────────────────────────

export interface AbcMapEntry {
  abc: ProductAbc;
  estado: ProductEstado;
  pct_revenue: number;
  rank: number | null;
}
export interface ProductAbcMap {
  window_days: number;
  productos: Record<string, AbcMapEntry>;
}
export function useProductAbcMap(window = 180) {
  return useMetrics<ProductAbcMap>(`/api/metrics/product-abc-map?window=${window}`);
}

export interface HistoryMonth {
  mes: string;
  revenue: number;
  margen: number;
  margen_pct: number | null;
  facturas: number;
  unidades: number;
  ticket_promedio: number;
}
export interface HistoryYoY {
  mes: string;
  revenue_actual: number;
  revenue_anterior: number;
  delta_pct: number | null;
}
export interface SalesHistoryExtended {
  serie: HistoryMonth[];
  mejor_mes: HistoryMonth | null;
  peor_mes: HistoryMonth | null;
  yoy: HistoryYoY[];
  total_revenue: number;
  total_margen: number;
}
export function useSalesHistoryExtended() {
  return useMetrics<SalesHistoryExtended>("/api/metrics/sales-history-extended");
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

// ── Gastos operativos (V1.11 — Supabase) ─────────────────────────────────

export type GastoCategoria =
  | "arriendo"
  | "nomina"
  | "servicios"
  | "mantenimiento"
  | "marketing"
  | "impuestos"
  | "combustible"
  | "transporte"
  | "papeleria"
  | "seguros"
  | "otros";

export const CATEGORIA_LABELS: Record<GastoCategoria, string> = {
  arriendo: "Arriendo",
  nomina: "Nómina",
  servicios: "Servicios (luz/agua/internet/gas)",
  mantenimiento: "Mantenimiento",
  marketing: "Marketing",
  impuestos: "Impuestos",
  combustible: "Combustible",
  transporte: "Transporte",
  papeleria: "Papelería",
  seguros: "Seguros",
  otros: "Otros",
};

export interface Gasto {
  id: number;
  tenant: string;
  mes: string;
  categoria: GastoCategoria;
  monto: number;
  descripcion: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface GastosListResponse {
  items: Gasto[];
  total: number;
}

export interface GastoCreatePayload {
  mes: string;
  categoria: GastoCategoria;
  monto: number;
  descripcion?: string | null;
}

export interface GastoUpdatePayload {
  mes?: string;
  categoria?: GastoCategoria;
  monto?: number;
  descripcion?: string | null;
}

export function useGastos(mes?: string) {
  const qs = mes ? `?mes=${mes}` : "";
  return useMetrics<GastosListResponse>(`/api/gastos${qs}`);
}

export async function createGasto(payload: GastoCreatePayload): Promise<Gasto> {
  return apiFetchJson<Gasto>("/api/gastos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateGasto(id: number, payload: GastoUpdatePayload): Promise<Gasto> {
  return apiFetchJson<Gasto>(`/api/gastos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteGasto(id: number): Promise<void> {
  await apiFetch(`/api/gastos/${id}`, { method: "DELETE" });
}


// ── Análisis financiero (V1.11) ──────────────────────────────────────────

export interface HoraPicoItem {
  hour: number;
  total_ventas: number;
  num_facturas: number;
  ticket_promedio: number;
}

export interface HoraPicoResponse {
  fecha_inicio: string;
  fecha_fin: string;
  items: HoraPicoItem[];
  hora_pico_facturas: number | null;
  hora_pico_ventas: number | null;
}

export interface BalanceDiaItem {
  date: string;
  ventas: number;
  costo_mercancia: number;
  gastos_operativos: number;
  ganancia_bruta: number;
  ganancia_neta: number;
  balance_acumulado: number;
}

export interface BalanceResponse {
  fecha_inicio: string;
  fecha_fin: string;
  items: BalanceDiaItem[];
  total_ventas: number;
  total_costo_mercancia: number;
  total_gastos_operativos: number;
  total_ganancia_bruta: number;
  total_ganancia_neta: number;
  margen_bruto_pct: number | null;
  margen_neto_pct: number | null;
}

export function useHorasPico(fechaInicio: string, fechaFin: string) {
  const ok = !!fechaInicio && !!fechaFin && fechaInicio <= fechaFin;
  return useMetrics<HoraPicoResponse>(
    ok ? `/api/metrics/horas-pico?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}` : null,
  );
}

export function useAnalisisBalance(fechaInicio: string, fechaFin: string) {
  const ok = !!fechaInicio && !!fechaFin && fechaInicio <= fechaFin;
  return useMetrics<BalanceResponse>(
    ok ? `/api/metrics/analisis-balance?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}` : null,
  );
}

// ── V1.16: zombie, salud, heatmap, vendor-flag (derivados del EDA) ──────

export interface ProductoZombieItem {
  cod_producto: string;
  nom_producto: string;
  stock_actual: number;
  costo_unitario: number;
  capital_invertido: number;
  ultima_compra: string | null;
  dias_en_catalogo: number | null;
  presentacion: string | null;
  unidad_medida: string;
}
export interface ProductosZombieResponse {
  page: number;
  page_size: number;
  total: number;
  capital_inmovilizado: number;
  items: ProductoZombieItem[];
}
export function useProductosZombie(page = 1, pageSize = 50) {
  return useMetrics<ProductosZombieResponse>(
    `/api/metrics/productos-zombie?page=${page}&page_size=${pageSize}`,
  );
}

export interface SaludCatalogoResponse {
  total_skus: number;
  activos: number;
  activos_pct: number;
  lentos: number;
  lentos_pct: number;
  dormidos: number;
  dormidos_pct: number;
  zombie: number;
  zombie_pct: number;
  salud_pct: number;
}
export function useSaludCatalogo() {
  return useMetrics<SaludCatalogoResponse>("/api/metrics/salud-catalogo");
}

export interface HeatmapCell {
  dow: number;
  dow_label: string;
  hora: number;
  num_facturas: number;
  total_ventas: number;
  ticket_promedio: number;
}
export interface HeatmapResponse {
  fecha_inicio: string;
  fecha_fin: string;
  cells: HeatmapCell[];
  max_facturas: number;
  max_ventas: number;
}
export function useHeatmapDiaHora(fechaInicio: string, fechaFin: string) {
  const ok = !!fechaInicio && !!fechaFin && fechaInicio <= fechaFin;
  return useMetrics<HeatmapResponse>(
    ok ? `/api/metrics/heatmap-dia-hora?fecha_inicio=${fechaInicio}&fecha_fin=${fechaFin}` : null,
  );
}

export interface VendorDataFlagResponse {
  has_vendor_data: boolean;
  facturas_sin_vendedor: number;
  facturas_totales: number;
  porcentaje_sin_vendedor: number;
}
export function useVendorDataFlag() {
  return useMetrics<VendorDataFlagResponse>("/api/metrics/vendor-data-flag");
}

// ── V1.17: Inventario inteligente (refactor /dashboards/inventario) ──────

export type InventarioAccion =
  | "comprar_ya"
  | "comprar_pronto"
  | "sobrestock"
  | "liquidar"
  | "zombie_con_stock"
  | "ok"
  | "sin_accion";

export interface InventarioItem {
  cod_producto: string;
  nom_producto: string;
  stock: number;
  uds_90d: number;
  rev_90d: number;
  rotacion_diaria: number;
  cobertura_dias: number | null;
  ultima_venta: string | null;
  ultima_compra: string | null;
  dias_desde_venta: number | null;
  costo_unit: number;
  precio_venta: number;
  capital_inmovilizado: number;
  sugerido_comprar: number;
  abc: string | null;
  presentacion: string | null;
  unidad_medida: string;
  accion: InventarioAccion;
  ingreso_perdido_estimado: number;
  /** V1.18: proveedor de la última compra. null si nunca se compró por canal trackeado. */
  nit_proveedor?: string | null;
  nombre_proveedor?: string | null;
}

export interface InventarioOverviewResponse {
  total_skus: number;
  lead_time_dias: number;
  colchon_dias: number;
  umbral_sobrestock_dias: number;
  valor_total_inventario: number;
  capital_ocioso: number;
  ingreso_perdido_estimado_mensual: number;
  buckets_count: Record<InventarioAccion, number>;
  items: InventarioItem[];
}

export function useInventarioOverview(leadTime = 7, colchon = 14, sobrestock = 180) {
  return useMetrics<InventarioOverviewResponse>(
    `/api/metrics/inventario-overview?lead_time_dias=${leadTime}&colchon_dias=${colchon}&umbral_sobrestock_dias=${sobrestock}`,
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
