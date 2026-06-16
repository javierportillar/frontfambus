"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useSalesSummaryV2,
  useSalesDailyMonth,
  useSalesForecastMonthly,
  useSalesHistorical,
  useSalesTrend,
  useSalesTrendByYear,
  useSalesMonthDetail,
  useSalesMonthlyFor,
  type FormaPagoItem,
  type VendedorDayItem,
  type TopSkuItem,
} from "@/lib/api/hooks";
import { formatMoney } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Table } from "@/components/ui/Table";
import { Skeleton } from "@/components/ui/Skeleton";
import { Calendar } from "@/components/ui/Calendar";
import { DayDetailModal } from "@/components/sales/DayDetailModal";
import { CajaTab } from "@/components/sales/CajaTab";
import {
  LineChart, Line, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
type Tab = "mensual" | "diaria" | "historica" | "forecast" | "caja";

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

function formatCurrencyFull(value: number): string {
  return `$${Math.round(value || 0).toLocaleString("es-CO")}`;
}

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

export default function VentasPage(): JSX.Element {
  const [tab, setTab] = useState<Tab>("mensual");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  // V1.9: estado del modal del día (popup del calendario)
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const selectedYear = Number(selectedMonth.slice(0, 4));
  const prevYearMonth = previousYearMonth(selectedMonth);
  const prevMonth = previousMonth(selectedMonth);

  const sales = useSalesSummaryV2();
  const daily = useSalesDailyMonth(selectedMonth);
  const dailyPrevYear = useSalesDailyMonth(prevYearMonth);
  const dailyPrevMonth = useSalesDailyMonth(prevMonth);
  const hist = useSalesHistorical();
  const fc = useSalesForecastMonthly();
  const trend = useSalesTrend(24);
  const trendPrev = useSalesTrendByYear(selectedYear - 1);
  // V1.9: detalle enriquecido del mes (margen, vendedores, forma de pago, aceleradores)
  const monthDetail = useSalesMonthDetail(selectedMonth);
  // V1.9: top productos del mes seleccionado (para card "más vendidos")
  const monthly = useSalesMonthlyFor(selectedMonth);

  const d = sales.data;
  const dm = daily.data;
  const dp = dailyPrevYear.data;
  const dpm = dailyPrevMonth.data;
  const dh = hist.data;
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

  const tabs: Tab[] = ["mensual","diaria","caja","historica","forecast"];
  const labels: Record<Tab,string> = {mensual:"Mensual",diaria:"Diaria",caja:"Caja",historica:"Histórica",forecast:"Forecast"};

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
      <Link href="/" className="text-sm text-accent hover:underline">← Volver a inicio</Link>
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Ventas</h1>
          <p className="text-sm text-text-muted">Datos hasta {d.max_sales_date}</p>
        </div>
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

      <div className="flex gap-2 flex-wrap">{tabs.map(v=>(<button key={v} onClick={()=>setTab(v)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab===v?"bg-surface-dark text-text-inverse":"bg-surface-alt text-text-secondary"}`}>{labels[v]}</button>))}</div>

      {tab === "mensual" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Card><Stat label="Ventas del mes" value={formatMoney(monthlyTotal)} subtitle={`${dm?.total_days_with_sales ?? 0} días con venta · ${monthLabel(selectedMonth)}`} /></Card>
            <Card><Stat label="Facturas" value={monthlyInvoices.toLocaleString("es-CO")} subtitle="mes seleccionado" /></Card>
            <Card><Stat label="Ticket promedio" value={formatMoney(monthlyTicket)} subtitle="por factura" /></Card>
            <Card><Stat label={`vs ${monthLabel(prevMonth)}`} value={pctDelta(monthlyTotal, prevMonthTotal)} subtitle={`${formatCurrencyFull(prevMonthTotal)} base`} /></Card>
            <Card><Stat label={`vs ${monthLabel(prevYearMonth)}`} value={pctDelta(monthlyTotal, prevYearTotal)} subtitle={`${formatCurrencyFull(prevYearTotal)} base`} /></Card>
          </div>

          <Card header={<h2 className="font-semibold text-text-primary">Evolución diaria — {monthLabel(selectedMonth)}</h2>}>
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

          <Card header={<h2 className="font-semibold text-text-primary">Año actual vs anterior</h2>}>
            <ResponsiveContainer width="100%" height={240}>
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
          </Card>

          {/* V1.9: top productos del mes seleccionado */}
          {monthly.data && monthly.data.productos_top.length > 0 && (
            <Card header={<h2 className="font-semibold text-text-primary">Productos más vendidos del mes — top 10</h2>}>
              <div className="space-y-1.5">
                {monthly.data.productos_top.slice(0, 10).map((sku: TopSkuItem, idx: number) => {
                  const maxValor = monthly.data!.productos_top[0]?.valor_total ?? 1;
                  const intensity = maxValor ? sku.valor_total / maxValor : 0;
                  return (
                    <div key={sku.cod_producto} className="flex items-center gap-3">
                      <span className="w-6 text-right text-xs font-bold text-text-muted">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">{sku.nom_producto}</div>
                        <div className="h-1.5 mt-1 rounded-full bg-surface-alt overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(5, intensity * 100)}%` }} />
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-text-primary">{formatMoney(sku.valor_total)}</div>
                        <div className="text-[10px] text-text-muted">
                          {sku.cantidad_total.toLocaleString("es-CO")} u
                          {sku.porcentaje_ingreso !== null && sku.porcentaje_ingreso !== undefined ? ` · ${sku.porcentaje_ingreso.toFixed(1)}%` : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {monthDetail.data && (
            <>
              {/* Margen, mejor/peor día */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Card>
                  <Stat
                    label="Margen bruto"
                    value={formatMoney(monthDetail.data.margen_bruto)}
                    subtitle={monthDetail.data.margen_porcentaje !== null ? `${monthDetail.data.margen_porcentaje.toFixed(1)}% del revenue` : "—"}
                  />
                </Card>
                <Card>
                  <Stat
                    label="Mejor día"
                    value={monthDetail.data.mejor_dia ? formatMoney(monthDetail.data.mejor_dia.total_ventas) : "—"}
                    subtitle={monthDetail.data.mejor_dia ? `${monthDetail.data.mejor_dia.date} · ${monthDetail.data.mejor_dia.num_facturas} fact` : ""}
                  />
                </Card>
                <Card>
                  <Stat
                    label="Peor día"
                    value={monthDetail.data.peor_dia ? formatMoney(monthDetail.data.peor_dia.total_ventas) : "—"}
                    subtitle={monthDetail.data.peor_dia ? `${monthDetail.data.peor_dia.date} · ${monthDetail.data.peor_dia.num_facturas} fact` : ""}
                  />
                </Card>
                <Card>
                  <Stat
                    label="Top vendedor"
                    value={monthDetail.data.vendedores_top[0]?.nombre_vendedor ?? "—"}
                    subtitle={monthDetail.data.vendedores_top[0] ? formatMoney(monthDetail.data.vendedores_top[0].total_ventas) : ""}
                  />
                </Card>
              </div>

              {/* Forma de pago + Vendedores top */}
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
                              {formatMoney(f.total_ventas)} <span className="text-text-muted text-xs font-normal">({f.porcentaje.toFixed(0)}%)</span>
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

                <Card header={<h2 className="font-semibold text-text-primary">Vendedores top del mes</h2>}>
                  {monthDetail.data.vendedores_top.length === 0 ? (
                    <p className="py-4 text-sm text-text-muted text-center">Sin datos de vendedor.</p>
                  ) : (
                    <Table
                      columns={[
                        { header: "#", cell: (_: VendedorDayItem, idx?: number) => String((idx ?? 0) + 1), align: "right" },
                        { header: "Vendedor", cell: (r: VendedorDayItem) => r.nombre_vendedor },
                        { header: "Ventas", cell: (r: VendedorDayItem) => formatMoney(r.total_ventas), align: "right" },
                        { header: "Fact.", cell: (r: VendedorDayItem) => String(r.num_facturas), align: "right" },
                        { header: "%", cell: (r: VendedorDayItem) => (r.porcentaje !== null ? `${r.porcentaje.toFixed(1)}%` : "—"), align: "right" },
                      ]}
                      data={monthDetail.data.vendedores_top.slice(0, 7)}
                      keyFn={(r: VendedorDayItem, idx?: number) => `${r.nit_vendedor ?? ""}-${idx ?? 0}`}
                      striped
                    />
                  )}
                </Card>
              </div>

              {/* Aceleradores / Frenadores */}
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
                            <span className="text-sm font-semibold text-green-700 shrink-0">{formatMoney(p.valor_total)}</span>
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
                            <span className="text-sm font-semibold text-red-700 shrink-0">{formatMoney(p.valor_total)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === "diaria" && (
        <>
          <Card
            header={
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-text-primary">Calendario — {monthLabel(selectedMonth)}</h2>
                <span className="text-xs text-text-muted">
                  Click en un día para ver el detalle con horas, productos y vendedores
                </span>
              </div>
            }
          >
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
              onDayClick={(date) => setSelectedDate(date)}
              selectedDate={selectedDate ?? undefined}
            />
          </Card>

          <Card header={<h2 className="font-semibold text-text-primary">Tabla detallada</h2>}>
            <Table columns={[
              {header:"Día",cell:(r:DailyPoint)=>String(r.day).padStart(2,"0")},
              {header:"Ventas",cell:(r:DailyPoint)=>formatCurrencyFull(r.sales),align:"right"},
              {header:"Facturas",cell:(r:DailyPoint)=>String(r.invoices),align:"right"},
              {header:"Acumulado",cell:(r:DailyPoint)=>formatCurrencyFull(r.accumulated),align:"right"},
              {header:"Ticket",cell:(r:DailyPoint)=>formatCurrencyFull(r.avg_ticket),align:"right"},
            ]} data={selectedDays} keyFn={(r:DailyPoint)=>r.date} striped />
          </Card>
        </>
      )}

      {tab === "historica" && dh && (
        <>
          <Card header={<h2 className="font-semibold text-text-primary">Tendencia histórica</h2>}>
            {dh.meses.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={(() => {
                  const data: { month: string; ventas: number; tendencia: number | null; proy: number | null }[] = dh.meses.map(m => ({
                    month: `${MONTHS[m.month-1]??""} ${String(m.year).slice(2)}`,
                    ventas: m.total_ventas,
                    tendencia: m.total_ventas,
                    proy: null,
                  }));
                  if (df) {
                    const cmIdx = data.findIndex(item => item.month === `${MONTHS[new Date().getMonth()]??""} ${String(new Date().getFullYear()).slice(2)}`);
                    if (cmIdx >= 0) {
                      const actual = data[cmIdx]!.ventas;
                      data[cmIdx]!.proy = df.current_month.projected_amount - actual;
                    }
                    data.push({
                      month: `${MONTHS[new Date().getMonth()+1]??""} ${String(new Date().getFullYear()).slice(2)}`,
                      ventas: 0, tendencia: null, proy: df.next_month.projected_amount,
                    });
                  }
                  return data;
                })()}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 7, angle: -60, textAnchor: "end" }} stroke="#a3a3a3" height={70} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} stroke="#a3a3a3" tickFormatter={(v: number) => `$${(v/1e6).toFixed(1)}M`} />
                  <Tooltip formatter={(value) => formatCurrencyFull(Number(value))} contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
                  <Bar dataKey="ventas" fill="#7B1818" stackId="a" radius={[2,2,0,0]} name="Real" />
                  <Bar dataKey="proy" fill="#FCD34D" stackId="a" radius={[2,2,0,0]} name="Proyección" />
                  <Line type="monotone" dataKey="tendencia" stroke="#7B1818" strokeWidth={1.5} dot={false} name="Tendencia" connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            ) : <p className="py-6 text-sm text-text-muted text-center">Sin datos históricos.</p>}
            <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{background:"#7B1818"}} /> Real</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{background:"#FCD34D"}} /> Proyección</span>
            </div>
          </Card>
          <Card header={<h2 className="font-semibold text-text-primary">Histórico mensual</h2>}>
            <Table columns={[
              {header:"Mes",cell:(r:typeof dh.meses[number])=>`${MONTHS[r.month-1]??""} ${r.year}`},
              {header:"Ventas",cell:(r:typeof dh.meses[number])=>formatCurrencyFull(r.total_ventas),align:"right"},
              {header:"Facturas",cell:(r:typeof dh.meses[number])=>String(r.num_facturas),align:"right"},
              {header:"Ticket",cell:(r:typeof dh.meses[number])=>formatCurrencyFull(r.ticket_promedio),align:"right"},
            ]} data={dh.meses} keyFn={(r:typeof dh.meses[number])=>`${r.year}-${r.month}`} striped />
          </Card>
        </>
      )}

      {tab === "forecast" && df && (
        <Card header={<h2 className="font-semibold text-text-primary">Proyección</h2>}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Card><Stat label={df.current_month.month} value={formatMoney(df.current_month.projected_amount)} subtitle={`${df.current_month.days_observed}/${df.current_month.days_total}d · ${formatMoney(df.current_month.observed_amount??0)} real`} /></Card>
            <Card><Stat label={df.next_month.month} value={formatMoney(df.next_month.projected_amount)} subtitle={`${df.next_month.days_total} días (${df.next_month.confidence})`} /></Card>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={[
              {label:df.current_month.month.slice(5),real:df.current_month.observed_amount??0,proy:df.current_month.projected_amount-(df.current_month.observed_amount??0)},
              {label:df.next_month.month.slice(5),real:0,proy:df.next_month.projected_amount},
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{fontSize:10}} stroke="#a3a3a3" />
              <YAxis tick={{fontSize:10}} stroke="#a3a3a3" tickFormatter={(v:number)=>`$${(v/1e6).toFixed(1)}M`} />
              <Tooltip formatter={(value) => formatCurrencyFull(Number(value))} contentStyle={{borderRadius:"8px",fontSize:"12px"}} />
              <Bar dataKey="real" fill="#7B1818" stackId="a" radius={[4,4,0,0]} />
              <Bar dataKey="proy" fill="#FCD34D" stackId="a" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-text-muted mt-1">Modelo: {df.model_version}</p>
        </Card>
      )}

      {tab === "caja" && <CajaTab />}

      {/* V1.9: Modal popup detalle del dia (sirve a la tab Diaria) */}
      <DayDetailModal
        isOpen={selectedDate !== null}
        onClose={() => setSelectedDate(null)}
        date={selectedDate}
      />
    </div>
  );
}
