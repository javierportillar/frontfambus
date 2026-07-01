"use client";

// V1.23: Extraído desde app/dashboards/ventas/page.tsx para unificar con Compras
// bajo /dashboards/movimientos. Lógica idéntica al original — sólo se removió
// el header de página (volver/título), ahora lo provee MovimientosPage.

import { useMemo, useState, useEffect } from "react";
import {
  useSalesSummaryV2,
  useSalesDailyMonth,
  useSalesForecastMonthly,
  useSalesHistorical,
  useSalesTrend,
  useSalesTrendByYear,
  useSalesMonthDetail,
  useSalesMonthlyFor,
  useProductAbcMap,
  useVendorDataFlag,
  type FormaPagoItem,
  type VendedorDayItem,
  type TopSkuItem,
} from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Table } from "@/components/ui/Table";
import { Skeleton } from "@/components/ui/Skeleton";
import { Calendar } from "@/components/ui/Calendar";
import { CajaTab } from "@/components/sales/CajaTab";
import { DayDetailContent } from "@/components/sales/DayDetailContent";
import { MixAbc } from "@/components/ventas/TopProductos";
import { HistoricaTab } from "@/components/ventas/HistoricaTab";
import { MargenMensualTable } from "@/components/ventas/MargenMensualTable";
import { ProductosVendidosTabla } from "@/components/ventas/ProductosVendidosTabla";
import {
  LineChart, Line, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
// V1.24: agregado tab "anual" — absorbe la comparativa año actual vs anterior
//        que vivía dentro de Mensual. Orden: Diaria → Mensual → Anual → Histórica → Caja.
// V1.23: tab "forecast" eliminado de Ventas — unificado en /decisiones.
type Tab = "diaria" | "mensual" | "anual" | "historica" | "caja";

type DailyPoint = {
  date: string;
  day: number;
  sales: number;
  invoices: number;
  avg_ticket: number;
  accumulated: number;
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [year, rawMonth] = month.split("-");
  const idx = Number(rawMonth) - 1;
  return `${MONTHS[idx] ?? rawMonth} ${year}`;
}

function parseMonth(month: string): { year: number; monthNumber: number } {
  const [yearPart = "0", monthPart = "1"] = month.split("-");
  return { year: Number(yearPart), monthNumber: Number(monthPart) };
}

function previousMonth(month: string): string {
  const { year, monthNumber } = parseMonth(month);
  const date = new Date(year, monthNumber - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function previousYearMonth(month: string): string {
  const { year, monthNumber } = parseMonth(month);
  return `${year - 1}-${String(monthNumber).padStart(2, "0")}`;
}

function daysInMonth(month: string): number {
  const { year, monthNumber } = parseMonth(month);
  return new Date(year, monthNumber, 0).getDate();
}

function dayFromDate(date: string | undefined): number {
  if (!date) return 0;
  return Number(date.slice(8, 10)) || 0;
}

function shiftDay(date: string, delta: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

const formatCurrencyFull = formatMoneyFull;

function pctDelta(current: number, previous: number): string {
  if (!previous) return "—";
  const pct = ((current - previous) / previous) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function fillDailySeries(days: DailyPoint[] | undefined, month: string, visibleDays: number): DailyPoint[] {
  const byDay = new Map((days ?? []).map((item) => [item.day, item]));
  let accumulated = 0;
  return Array.from({ length: visibleDays }, (_, index) => {
    const day = index + 1;
    const existing = byDay.get(day);
    accumulated += existing?.sales ?? 0;
    return {
      date: existing?.date ?? `${month}-${String(day).padStart(2, "0")}`,
      day,
      sales: existing?.sales ?? 0,
      invoices: existing?.invoices ?? 0,
      avg_ticket: existing?.avg_ticket ?? 0,
      accumulated: Number(accumulated.toFixed(2)),
    };
  });
}

export function VentasView(): JSX.Element {
  const [tab, setTab] = useState<Tab>("diaria");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [selectedDate, setSelectedDate] = useState<string>("");

  const selectedYear = Number(selectedMonth.slice(0, 4));
  const prevYearMonth = previousYearMonth(selectedMonth);
  const prevMonth = previousMonth(selectedMonth);

  const sales = useSalesSummaryV2();

  useEffect(() => {
    const maxDate = sales.data?.max_sales_date;
    if (maxDate) {
      setSelectedDate((prev) => prev || maxDate);
    }
  }, [sales.data?.max_sales_date]);
  const daily = useSalesDailyMonth(selectedMonth);
  const dailyPrevYear = useSalesDailyMonth(prevYearMonth);
  const dailyPrevMonth = useSalesDailyMonth(prevMonth);
  const hist = useSalesHistorical();
  const fc = useSalesForecastMonthly();
  const trend = useSalesTrend(24);
  const trendPrev = useSalesTrendByYear(selectedYear - 1);
  const monthDetail = useSalesMonthDetail(selectedMonth);
  const [monthlyExpanded, setMonthlyExpanded] = useState(false);
  const monthly = useSalesMonthlyFor(selectedMonth, monthlyExpanded ? 5000 : 10);
  const abcMap = useProductAbcMap(180);
  const vendorFlag = useVendorDataFlag();
  const hasVendorData = vendorFlag.data?.has_vendor_data ?? true;

  const d = sales.data;
  const dm = daily.data;
  const dp = dailyPrevYear.data;
  const dpm = dailyPrevMonth.data;
  // hist no se usa directamente; HistoricaTab tiene su propio hook interno
  void hist;
  const df = fc.data;

  const selectedMonthDays = daysInMonth(selectedMonth);
  const maxRawDay = Math.max(0, ...(dm?.days ?? []).map((item) => item.day));
  const isCurrentBusinessMonth = selectedMonth === d?.business_month;
  const visibleDays = isCurrentBusinessMonth
    ? Math.max(1, Math.min(selectedMonthDays, Math.max(dayFromDate(d?.max_sales_date), maxRawDay)))
    : selectedMonthDays;

  const selectedDays = useMemo(() => fillDailySeries(dm?.days, selectedMonth, visibleDays), [dm?.days, selectedMonth, visibleDays]);
  const prevYearDays = useMemo(() => fillDailySeries(dp?.days, prevYearMonth, Math.min(visibleDays, daysInMonth(prevYearMonth))), [dp?.days, prevYearMonth, visibleDays]);
  const prevMonthDays = useMemo(() => fillDailySeries(dpm?.days, prevMonth, Math.min(visibleDays, daysInMonth(prevMonth))), [dpm?.days, prevMonth, visibleDays]);

  const monthlyTotal = selectedDays.reduce((sum, item) => sum + item.sales, 0);
  const monthlyInvoices = selectedDays.reduce((sum, item) => sum + item.invoices, 0);
  const monthlyTicket = monthlyInvoices ? monthlyTotal / monthlyInvoices : 0;
  const prevYearTotal = prevYearDays.reduce((sum, item) => sum + item.sales, 0);
  const prevMonthTotal = prevMonthDays.reduce((sum, item) => sum + item.sales, 0);

  const trendCurr = new Map((trend.data?.items??[]).filter(i=>i.year===selectedYear).map(i=>[i.month,i.total_ventas]));
  const trendP = new Map((trendPrev.data?.items??[]).map(i=>[i.month,i.total_ventas]));

  if (!d) return <div className="p-4"><Skeleton className="h-60 rounded-xl" /></div>;

  const tabs: Tab[] = ["diaria","mensual","anual","historica","caja"];
  const labels: Record<Tab,string> = {diaria:"Diaria",mensual:"Mensual",anual:"Anual",historica:"Histórica",caja:"Caja"};

  const comparisonData = Array.from({ length: visibleDays }, (_, index) => {
    const day = index + 1;
    return {
      day,
      curr: selectedDays.find((item) => item.day === day)?.sales ?? 0,
      prev: prevYearDays.find((item) => item.day === day)?.sales ?? 0,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <p className="text-xs text-text-muted">Datos hasta {d.max_sales_date}</p>
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
          Mes a analizar
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            className="mt-1 block rounded-xl border border-border bg-surface px-3 py-2 text-sm font-normal normal-case tracking-normal text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
      </div>

      <div className="-mx-4 overflow-x-auto border-b border-border pb-2 md:mx-0 md:border-b-0 md:pb-0">
        <div className="flex gap-2 whitespace-nowrap px-4 md:flex-wrap md:px-0">
          {tabs.map(v=>(<button key={v} onClick={()=>setTab(v)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab===v?"bg-surface-dark text-text-inverse":"bg-surface-alt text-text-secondary"}`}>{labels[v]}</button>))}
        </div>
      </div>

      {tab === "mensual" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Card><Stat label="Ventas del mes" value={formatMoneyFull(monthlyTotal)} subtitle={`${dm?.total_days_with_sales ?? 0} días con venta · ${monthLabel(selectedMonth)}`} /></Card>
            <Card><Stat label="Facturas" value={monthlyInvoices.toLocaleString("es-CO")} subtitle="mes seleccionado" /></Card>
            <Card><Stat label="Ticket promedio" value={formatMoneyFull(monthlyTicket)} subtitle="por factura" /></Card>
            <Card><Stat label={`vs ${monthLabel(prevMonth)}`} value={pctDelta(monthlyTotal, prevMonthTotal)} subtitle={`${formatCurrencyFull(prevMonthTotal)} base`} /></Card>
            <Card><Stat label={`vs ${monthLabel(prevYearMonth)}`} value={pctDelta(monthlyTotal, prevYearTotal)} subtitle={`${formatCurrencyFull(prevYearTotal)} base`} /></Card>
          </div>

          {monthly.data && monthly.data.productos_top.length > 0 && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <Card className="lg:col-span-2" header={
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-text-primary">Productos vendidos — {monthLabel(selectedMonth)}</h2>
                  <span className="text-xs text-text-muted">click en fila → ficha</span>
                </div>
              }>
                <ProductosVendidosTabla
                  productos={monthly.data.productos_top}
                  abcMap={abcMap.data}
                  initialLimit={10}
                  isFullDataset={monthlyExpanded}
                  loadingAll={monthlyExpanded && monthly.isLoading}
                  onLoadAll={() => setMonthlyExpanded(true)}
                />
              </Card>
              <Card header={<h2 className="font-semibold text-text-primary">Mezcla por categoría</h2>}>
                <p className="mb-3 text-xs text-text-muted">
                  Cuánto de las ventas del top viene de productos <strong>A</strong> (los que generan el 80%),
                  <strong> B</strong> (siguiente 15%) y <strong>C</strong> (cola).
                </p>
                <MixAbc productos={monthly.data.productos_top.slice(0, 10)} abcMap={abcMap.data} />
                <p className="mt-4 text-[0.7rem] text-text-muted">
                  Una venta sana se apoya en sus productos A. Si tu top está lleno de C, revisá tu surtido.
                </p>
              </Card>
            </div>
          )}

          <Card
            header={<h2 className="font-semibold text-text-primary">Calendario — {monthLabel(selectedMonth)}</h2>}
          >
            {daily.isLoading && !dm ? (
              <Skeleton className="h-80 rounded-lg" />
            ) : selectedDays.some((d) => d.sales > 0 || d.invoices > 0) ? (
              <Calendar
                month={selectedMonth}
                days={selectedDays
                  .filter((d) => d.sales > 0 || d.invoices > 0)
                  .map((d) => ({
                    date: d.date,
                    day: d.day,
                    sales: d.sales,
                    invoices: d.invoices,
                    avgTicket: d.avg_ticket,
                  }))}
                onDayClick={(date) => {
                  setSelectedDate(date);
                  setTab("diaria");
                }}
              />
            ) : (
              <p className="py-12 text-center text-sm text-text-muted">Sin ventas registradas en {monthLabel(selectedMonth)}.</p>
            )}
          </Card>

          <Card header={<h2 className="font-semibold text-text-primary">Evolución diaria — {monthLabel(selectedMonth)}</h2>}>
            {daily.isLoading && !dm ? (
              <Skeleton className="h-56 rounded-lg" />
            ) : !selectedDays.some((d) => d.sales > 0) ? (
              <p className="py-12 text-center text-sm text-text-muted">Sin datos diarios para {monthLabel(selectedMonth)}.</p>
            ) : (
            <ResponsiveContainer width="100%" height={230}>
              <ComposedChart data={selectedDays.map(item=>({label:item.day,ventas:item.sales,acumulado:item.accumulated}))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{fontSize:10}} stroke="#a3a3a3" />
                <YAxis yAxisId="left" tick={{fontSize:10}} stroke="#a3a3a3" tickFormatter={(v:number)=>`$${(v/1e3).toFixed(0)}K`} />
                <YAxis yAxisId="right" orientation="right" tick={{fontSize:10}} stroke="#2563EB" tickFormatter={(v:number)=>`$${(v/1e6).toFixed(1)}M`} />
                <Tooltip formatter={(value, name) => [formatCurrencyFull(Number(value)), name === "ventas" ? "Ventas día" : "Acumulado"]} contentStyle={{borderRadius:"8px",fontSize:"12px"}} />
                <Bar yAxisId="left" dataKey="ventas" fill="#7B1818" radius={[2,2,0,0]} />
                <Line yAxisId="right" type="monotone" dataKey="acumulado" stroke="#2563EB" strokeWidth={2} dot={{r:2,fill:"#2563EB"}} activeDot={{r:5}} />
              </ComposedChart>
            </ResponsiveContainer>
            )}
          </Card>

          <Card header={<h2 className="font-semibold text-text-primary">Comparativa diaria: {selectedYear} vs {selectedYear-1}</h2>}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{fontSize:10}} stroke="#a3a3a3" />
                <YAxis tick={{fontSize:10}} stroke="#a3a3a3" tickFormatter={(v:number)=>`$${(v/1e3).toFixed(0)}K`} />
                <Tooltip formatter={(value, name) => [formatCurrencyFull(Number(value)), name === "curr" ? `${selectedYear}` : `${selectedYear-1}`]} contentStyle={{borderRadius:"8px",fontSize:"12px"}} />
                <Line type="linear" dataKey="curr" stroke="#7B1818" strokeWidth={2} dot={{r:3,fill:"#7B1818"}} activeDot={{r:6}} name="curr" connectNulls={false} />
                <Line type="linear" dataKey="prev" stroke="#4B5563" strokeWidth={1.5} strokeDasharray="5 5" dot={{r:3,fill:"#4B5563"}} activeDot={{r:5}} name="prev" connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap items-center gap-4 mt-1 text-xs text-text-muted">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{background:"#7B1818"}} /> {selectedYear}</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{background:"#4B5563"}} /> {selectedYear-1}</span>
              <span>Los días sin venta se muestran en $0 para que una venta aislada sí deje punto visible.</span>
            </div>
          </Card>

          {/* V1.24: el chart "Año actual vs anterior" se movió al nuevo tab Anual. */}

          {monthDetail.data && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card>
                  <Stat
                    label="Margen bruto"
                    value={formatMoneyFull(monthDetail.data.margen_bruto)}
                    subtitle={monthDetail.data.margen_porcentaje !== null ? `${monthDetail.data.margen_porcentaje.toFixed(1)}% del revenue` : "—"}
                  />
                </Card>
                <Card>
                  <Stat
                    label="Mejor día"
                    value={monthDetail.data.mejor_dia ? formatMoneyFull(monthDetail.data.mejor_dia.total_ventas) : "—"}
                    subtitle={monthDetail.data.mejor_dia ? `${monthDetail.data.mejor_dia.date} · ${monthDetail.data.mejor_dia.num_facturas} fact` : ""}
                  />
                </Card>
                <Card>
                  <Stat
                    label="Peor día"
                    value={monthDetail.data.peor_dia ? formatMoneyFull(monthDetail.data.peor_dia.total_ventas) : "—"}
                    subtitle={monthDetail.data.peor_dia ? `${monthDetail.data.peor_dia.date} · ${monthDetail.data.peor_dia.num_facturas} fact` : ""}
                  />
                </Card>
                {hasVendorData ? (
                  <Card>
                    <Stat
                      label="Top vendedor"
                      value={monthDetail.data.vendedores_top[0]?.nombre_vendedor ?? "—"}
                      subtitle={monthDetail.data.vendedores_top[0] ? formatMoneyFull(monthDetail.data.vendedores_top[0].total_ventas) : ""}
                    />
                  </Card>
                ) : (
                  <Card>
                    <Stat
                      label="Margen bruto"
                      value={monthDetail.data.margen_porcentaje != null ? `${monthDetail.data.margen_porcentaje.toFixed(1)}%` : "—"}
                      subtitle="del revenue del mes"
                    />
                  </Card>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Card header={<h2 className="font-semibold text-text-primary">Forma de pago del mes</h2>}>
                  {monthDetail.data.formas_pago.length === 0 ? (
                    <p className="py-4 text-sm text-text-muted text-center">Sin datos.</p>
                  ) : (
                    <div className="space-y-2">
                      {monthDetail.data.formas_pago.map((f: FormaPagoItem) => (
                        <div key={f.cod_formapago}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-text-secondary">{f.nombre}</span>
                            <span className="font-semibold text-text-primary">
                              {formatMoneyFull(f.total_ventas)} <span className="text-text-muted text-xs font-normal">({f.porcentaje.toFixed(0)}%)</span>
                            </span>
                          </div>
                          <div className="h-1.5 mt-1 rounded-full bg-surface-alt overflow-hidden">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${f.porcentaje}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                {hasVendorData ? (
                  <Card header={<h2 className="font-semibold text-text-primary">Vendedores top del mes</h2>}>
                    {monthDetail.data.vendedores_top.length === 0 ? (
                      <p className="py-4 text-sm text-text-muted text-center">Sin datos de vendedor.</p>
                    ) : (
                      <Table
                        columns={[
                          { header: "#", cell: (_: VendedorDayItem, idx?: number) => String((idx ?? 0) + 1), align: "right" },
                          { header: "Vendedor", cell: (r: VendedorDayItem) => r.nombre_vendedor },
                          { header: "Ventas", cell: (r: VendedorDayItem) => formatMoneyFull(r.total_ventas), align: "right" },
                          { header: "Fact.", cell: (r: VendedorDayItem) => String(r.num_facturas), align: "right" },
                          { header: "%", cell: (r: VendedorDayItem) => (r.porcentaje !== null ? `${r.porcentaje.toFixed(1)}%` : "—"), align: "right" },
                        ]}
                        data={monthDetail.data.vendedores_top.slice(0, 7)}
                        keyFn={(r: VendedorDayItem, idx?: number) => `${r.nit_vendedor ?? ""}-${idx ?? 0}`}
                        striped
                      />
                    )}
                  </Card>
                ) : (
                  <Card header={<h2 className="font-semibold text-text-primary">Vendedores</h2>}>
                    <p className="py-4 text-sm text-text-muted text-center">
                      Este negocio no registra vendedor en las facturas
                      ({vendorFlag.data?.porcentaje_sin_vendedor}% sin asignar).
                    </p>
                    <p className="text-xs text-text-muted text-center">
                      Para activar este reporte: configurar el POS para que pida vendedor en cada venta.
                    </p>
                  </Card>
                )}
              </div>

              {(monthDetail.data.aceleradores.length > 0 || monthDetail.data.frenadores.length > 0) && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Card header={<h2 className="font-semibold text-green-700">📈 Aceleradores — más crecieron vs mes anterior</h2>}>
                    {monthDetail.data.aceleradores.length === 0 ? (
                      <p className="py-4 text-sm text-text-muted text-center">Sin datos.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {monthDetail.data.aceleradores.map((p: TopSkuItem) => (
                          <li key={p.cod_producto} className="flex items-start justify-between gap-2">
                            <span className="text-sm text-text-primary">{p.nom_producto}</span>
                            <span className="text-sm font-semibold text-green-700 shrink-0">{formatMoneyFull(p.valor_total)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>

                  <Card header={<h2 className="font-semibold text-red-700">📉 Frenadores — más cayeron vs mes anterior</h2>}>
                    {monthDetail.data.frenadores.length === 0 ? (
                      <p className="py-4 text-sm text-text-muted text-center">No hay productos en caída relevante.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {monthDetail.data.frenadores.map((p: TopSkuItem) => (
                          <li key={p.cod_producto} className="flex items-start justify-between gap-2">
                            <span className="text-sm text-text-primary">{p.nom_producto}</span>
                            <span className="text-sm font-semibold text-red-700 shrink-0">{formatMoneyFull(p.valor_total)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>
              )}
            </>
          )}

          <MargenMensualTable
            highlightMonth={selectedMonth}
            initialLimit={12}
            title={`Margen mensual — destacado ${monthLabel(selectedMonth)}`}
          />
        </>
      )}

      {tab === "diaria" && (
        <>
          <Card
            header={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold text-text-primary">Detalle diario</h2>
                <span className="text-xs text-text-muted">
                  Última fecha con datos: {d?.max_sales_date ?? "—"}
                </span>
              </div>
            }
          >
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedDate(shiftDay(selectedDate, -1))}
                disabled={!selectedDate}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-sm transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Día anterior"
              >
                ◀
              </button>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                max={d?.max_sales_date ?? undefined}
                className="block rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              <button
                type="button"
                onClick={() => setSelectedDate(shiftDay(selectedDate, 1))}
                disabled={!selectedDate || selectedDate >= (d?.max_sales_date ?? "")}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-sm transition hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Día siguiente"
              >
                ▶
              </button>
              <span className="text-sm text-text-muted">
                {selectedDate ? (() => {
                  const dt = new Date(`${selectedDate}T00:00:00`);
                  const days = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
                  const months = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
                  return `${days[dt.getDay()]}, ${dt.getDate()} de ${months[dt.getMonth()]} de ${dt.getFullYear()}`;
                })() : "Seleccioná una fecha"}
              </span>
            </div>
          </Card>

          <DayDetailContent date={selectedDate} />

          <MargenMensualTable
            highlightMonth={selectedDate ? selectedDate.slice(0, 7) : undefined}
            initialLimit={6}
            title="Margen mensual — contexto del día"
          />
        </>
      )}

      {tab === "historica" && (
        <>
          <HistoricaTab />
          <MargenMensualTable initialLimit={12} title="Margen mensual — histórico completo" />
        </>
      )}

      {tab === "anual" && (
        <>
          {(!trend.data || !trendPrev.data || !dm) ? (
            // Esperar a que TODAS las fuentes que alimentan los KPIs terminen
            // de cargar, sino los reduce() sobre maps vacíos daban "$ 0" durante
            // los primeros segundos (bug visible sobre todo en mobile con red lenta).
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card><Skeleton className="h-16 rounded" /></Card>
                <Card><Skeleton className="h-16 rounded" /></Card>
                <Card><Skeleton className="h-16 rounded" /></Card>
                <Card><Skeleton className="h-16 rounded" /></Card>
              </div>
              <Card><Skeleton className="h-72 rounded-lg" /></Card>
              <Card><Skeleton className="h-48 rounded-lg" /></Card>
            </div>
          ) : (trendCurr.size === 0 && trendP.size === 0 && monthlyTotal === 0) ? (
            <Card>
              <p className="py-8 text-center text-sm text-text-muted">
                Sin datos históricos para comparar. Requiere ventas de al menos 2 meses.
              </p>
            </Card>
          ) : (<>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card>
              <Stat
                label={`Acumulado ${selectedYear}`}
                value={formatMoneyFull(
                  Array.from(trendCurr.values()).reduce((s, v) => s + v, 0) + monthlyTotal,
                )}
                subtitle="ventas reales hasta hoy"
              />
            </Card>
            <Card>
              <Stat
                label={`Acumulado ${selectedYear - 1}`}
                value={formatMoneyFull(Array.from(trendP.values()).reduce((s, v) => s + v, 0))}
                subtitle={`mismo período año anterior`}
              />
            </Card>
            <Card>
              <Stat
                label="Mejor mes del año"
                value={(() => {
                  let bestM = 0, bestV = 0;
                  for (const [m, v] of trendCurr) if (v > bestV) { bestV = v; bestM = m; }
                  if (monthlyTotal > bestV) { bestV = monthlyTotal; bestM = Number(selectedMonth.slice(5)); }
                  return bestM ? `${MONTHS[bestM - 1]} · ${formatMoneyFull(bestV)}` : "—";
                })()}
                subtitle={`${selectedYear}`}
              />
            </Card>
            <Card>
              <Stat
                label="Proyección fin de año"
                value={(() => {
                  const acumCurr = Array.from(trendCurr.values()).reduce((s, v) => s + v, 0) + monthlyTotal;
                  const mesesTranscurridos = Number(selectedMonth.slice(5));
                  if (mesesTranscurridos === 0) return "—";
                  const promedio = acumCurr / mesesTranscurridos;
                  const proyAnual = promedio * 12;
                  return formatMoneyFull(proyAnual);
                })()}
                subtitle="al ritmo actual × 12 meses"
              />
            </Card>
          </div>

          <Card header={<h2 className="font-semibold text-text-primary">Año actual vs anterior</h2>}>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={MONTHS.map((lbl,i)=>{
                const m=i+1;
                const currentMonthNumber=Number(selectedMonth.slice(5));
                return {
                  label:lbl,
                  prev:trendP.get(m)??null,
                  curr:m<currentMonthNumber?(trendCurr.get(m)??null):m===currentMonthNumber?monthlyTotal:null,
                  proj:selectedMonth === d.business_month && m>=currentMonthNumber?(df?m===currentMonthNumber?df.current_month.projected_amount:m===currentMonthNumber+1?df.next_month.projected_amount:null:null):null,
                };
              })}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{fontSize:10}} stroke="#a3a3a3" />
                <YAxis tick={{fontSize:10}} stroke="#a3a3a3" tickFormatter={(v:number)=>`$${(v/1e6).toFixed(1)}M`} />
                <Tooltip formatter={(value) => formatCurrencyFull(Number(value))} contentStyle={{borderRadius:"8px",fontSize:"12px"}} />
                <Line type="monotone" dataKey="prev" stroke="#94A3B8" strokeDasharray="5 5" dot={{r:2}} name={`${selectedYear-1}`} />
                <Line type="monotone" dataKey="curr" stroke="#7B1818" strokeWidth={2} dot={{r:3,fill:"#7B1818"}} name={`${selectedYear}`} connectNulls={false} />
                <Line type="monotone" dataKey="proj" stroke="#FCD34D" strokeWidth={2} strokeDasharray="6 3" dot={{r:3,fill:"#FCD34D"}} name="Proyección" connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-text-muted">
              <span className="flex items-center gap-1">
                <span className="h-2 w-4 rounded" style={{background:"#7B1818"}} /> {selectedYear} (real)
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-4 rounded" style={{background:"#94A3B8"}} /> {selectedYear-1} (real)
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-4 rounded" style={{background:"#FCD34D"}} /> Proyección
              </span>
              <span>Proyección viene del forecast estable rolling 90d.</span>
            </div>
          </Card>

          {/* Tabla mes a mes con delta */}
          <Card header={<h2 className="font-semibold text-text-primary">Comparativa mes a mes</h2>}>
            <div className="-mx-4 overflow-x-auto md:mx-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                    <th className="py-2 pr-2">Mes</th>
                    <th className="px-2 text-right">{selectedYear}</th>
                    <th className="px-2 text-right">{selectedYear-1}</th>
                    <th className="px-2 text-right">Δ vs año anterior</th>
                    <th className="px-2 text-right">Δ %</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTHS.map((lbl, i) => {
                    const m = i + 1;
                    const currentMonthNumber = Number(selectedMonth.slice(5));
                    const prev = trendP.get(m) ?? null;
                    const curr = m < currentMonthNumber ? (trendCurr.get(m) ?? null) : m === currentMonthNumber ? monthlyTotal : null;
                    if (curr === null && prev === null) return null;
                    const delta = (curr ?? 0) - (prev ?? 0);
                    const deltaPct = prev && prev > 0 ? (delta / prev) * 100 : null;
                    const sign = delta >= 0 ? "+" : "−";
                    const color = delta >= 0 ? "text-green-700" : "text-red-700";
                    return (
                      <tr key={m} className="border-b border-border/60">
                        <td className="py-1.5 pr-2 font-medium text-text-primary">{lbl}</td>
                        <td className="px-2 text-right tabular-nums">{curr !== null ? formatMoneyFull(curr) : "—"}</td>
                        <td className="px-2 text-right tabular-nums text-text-muted">{prev !== null ? formatMoneyFull(prev) : "—"}</td>
                        <td className={`px-2 text-right tabular-nums ${color}`}>
                          {curr !== null && prev !== null ? `${sign}${formatMoneyFull(Math.abs(delta))}` : "—"}
                        </td>
                        <td className={`px-2 text-right tabular-nums font-semibold ${color}`}>
                          {deltaPct !== null && curr !== null ? `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          </>)}
        </>
      )}

      {tab === "caja" && <CajaTab />}
    </div>
  );
}
