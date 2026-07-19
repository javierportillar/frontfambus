"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSWRConfig } from "swr";
import {
  CATEGORIA_LABELS,
  copiarGastos,
  createGasto,
  deleteGasto,
  updateGasto,
  useAnalisisBalance,
  useGastos,
  useHorasPico,
  type BalanceDiaItem,
  type Gasto,
  type GastoCategoria,
  type HoraPicoItem,
} from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/auth/store";
import { HeatmapDiaHora } from "@/components/ventas/HeatmapDiaHora";
import { ProductosTopTab } from "@/components/analisis/ProductosTopTab";
import { ProveedoresTab } from "@/components/analisis/ProveedoresTab";
import { ProyeccionTab } from "@/components/analisis/ProyeccionTab";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  allowedAnalysisTabs,
  resolveAnalysisTab,
  type AnalysisTab,
} from "@/lib/auth/analysis";
import { nextTabIndex } from "@/lib/accessibility/tabs";
import { businessDateISO, shiftDateISO } from "@/lib/date/business";
import {
  ComposedChart, Bar, Line, LineChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

type Tab = AnalysisTab;
type Shortcut = "semana" | "mes" | "3meses" | "anio" | "todo" | "custom";

function todayISO(): string {
  return businessDateISO();
}

function shiftISO(date: string, days: number): string {
  return shiftDateISO(date, days);
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function startOfYear(date: string): string {
  return `${date.slice(0, 4)}-01-01`;
}

function rangeFromShortcut(shortcut: Shortcut): { ini: string; fin: string } {
  const fin = todayISO();
  switch (shortcut) {
    case "semana": return { ini: shiftISO(fin, -7), fin };
    case "mes":    return { ini: startOfMonth(fin), fin };
    case "3meses": return { ini: shiftISO(fin, -90), fin };
    case "anio":   return { ini: startOfYear(fin), fin };
    case "todo":   return { ini: "2020-01-01", fin };
    default:       return { ini: shiftISO(fin, -30), fin };
  }
}

function formatDateLabel(d: string): string {
  // 2026-06-14 → 14 jun
  const months = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const [, m, day] = d.split("-");
  return `${day} ${months[Number(m) - 1] ?? m}`;
}

function formatHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

// ── Drill-down helpers ──────────────────────────────────────────────────────

type DrillLevel = "year" | "month" | "week" | "day";

function levelFromShortcut(sc: Shortcut): DrillLevel {
  switch (sc) {
    case "semana": return "day";
    case "mes":    return "week";
    case "3meses": return "month";
    case "anio":   return "month";
    case "todo":   return "year";
    default:       return "week";
  }
}

function getWeekMonday(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay(); // 0=dom,1=lun,...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

const F_MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function monthLabel(key: string): string {
  const m = Number(key.split("-")[1]);
  return F_MONTHS[m - 1] ?? key;
}

function weekLabel(monday: string): string {
  const [, m, day] = monday.split("-");
  return `Sem ${day} ${F_MONTHS[Number(m) - 1]?.slice(0, 3).toLowerCase()}`;
}

function lastDayOfMonth(monthKey: string): string {
  const d = new Date(`${monthKey}-01T12:00:00`);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0); // last day of previous month → end of `monthKey`
  return d.toISOString().slice(0, 10);
}

interface AggRow {
  key: string;
  label: string;
  dateFrom: string;
  dateTo: string;
  numDays: number;
  ventas: number;
  costo_mercancia: number;
  gastos_operativos: number;
  ganancia_bruta: number;
  ganancia_neta: number;
  balance_acumulado: number;
}

function computeAgg(items: BalanceDiaItem[], level: DrillLevel): AggRow[] {
  const groups = new Map<string, BalanceDiaItem[]>();
  for (const item of items) {
    let k: string;
    if (level === "year") k = item.date.slice(0, 4);
    else if (level === "month") k = item.date.slice(0, 7);
    else if (level === "week") k = getWeekMonday(item.date);
    else k = item.date;
    const arr = groups.get(k) ?? [];
    arr.push(item);
    groups.set(k, arr);
  }

  const rows: AggRow[] = [];
  for (const [key, dayItems] of groups) {
    const last = dayItems[dayItems.length - 1]!;
    let label: string;
    let dateFrom: string;
    let dateTo: string;
    if (level === "year") {
      label = key;
      dateFrom = `${key}-01-01`;
      dateTo = `${key}-12-31`;
    } else if (level === "month") {
      label = monthLabel(key);
      dateFrom = `${key}-01`;
      dateTo = lastDayOfMonth(key);
    } else if (level === "week") {
      label = weekLabel(key);
      dateFrom = key;
      const d = new Date(`${key}T12:00:00`);
      d.setDate(d.getDate() + 6);
      dateTo = d.toISOString().slice(0, 10);
    } else {
      label = formatDateLabel(key);
      dateFrom = key;
      dateTo = key;
    }
    rows.push({
      key, label, dateFrom, dateTo, numDays: dayItems.length,
      ventas: dayItems.reduce((s, i) => s + i.ventas, 0),
      costo_mercancia: dayItems.reduce((s, i) => s + i.costo_mercancia, 0),
      gastos_operativos: dayItems.reduce((s, i) => s + i.gastos_operativos, 0),
      ganancia_bruta: dayItems.reduce((s, i) => s + i.ganancia_bruta, 0),
      ganancia_neta: dayItems.reduce((s, i) => s + i.ganancia_neta, 0),
      balance_acumulado: last.balance_acumulado,
    });
  }
  rows.sort((a, b) => a.key.localeCompare(b.key));
  return rows;
}

const LEVEL_ORDER: Record<DrillLevel, number> = { year: 0, month: 1, week: 2, day: 3 };

// ── Balance Tab ─────────────────────────────────────────────────────────────

function BalanceTab({ ini, fin, shortcut }: { ini: string; fin: string; shortcut: Shortcut }): JSX.Element {
  const { data, isLoading, error } = useAnalisisBalance(ini, fin);

  const initialLevel = levelFromShortcut(shortcut);
  const [displayLevel, setDisplayLevel] = useState<DrillLevel>(initialLevel);
  const [selYear, setSelYear] = useState<string | null>(null);
  const [selMonth, setSelMonth] = useState<string | null>(null);
  const [selWeek, setSelWeek] = useState<string | null>(null);

  // Reset drill when range or shortcut changes
  useEffect(() => {
    setDisplayLevel(initialLevel);
    setSelYear(null);
    setSelMonth(null);
    setSelWeek(null);
  }, [ini, fin, initialLevel]);

  // ── ALL useMemo hooks BEFORE early returns ──────────────────────────────
  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.items;
    if (selYear) items = items.filter((i) => i.date.startsWith(selYear!));
    if (selMonth) items = items.filter((i) => i.date.startsWith(selMonth!));
    if (selWeek) items = items.filter((i) => getWeekMonday(i.date) === selWeek);
    return items;
  }, [data, selYear, selMonth, selWeek]);

  const rows = useMemo(() => {
    if (filtered.length === 0) return [];
    return computeAgg(filtered, displayLevel);
  }, [filtered, displayLevel]);

  const chartData = useMemo(() => {
    if (displayLevel !== "day" || filtered.length === 0) return [];
    return filtered.map((it: BalanceDiaItem) => ({
      label: formatDateLabel(it.date),
      ventas: it.ventas,
      gastos: it.costo_mercancia + it.gastos_operativos,
      ganancia: it.ganancia_neta,
      acumulado: it.balance_acumulado,
    }));
  }, [filtered, displayLevel]);

  // ── Early returns (after ALL hooks) ─────────────────────────────────────
  if (isLoading && !data) return <Skeleton className="h-96 rounded-xl" />;
  if (error) return <Card><p className="py-8 text-center text-sm text-error">Error cargando balance.</p></Card>;
  if (!data || data.items.length === 0) {
    return <Card><p className="py-12 text-center text-sm text-text-muted">Sin datos en el período {ini} → {fin}.</p></Card>;
  }

  // ── Drill logic ──────────────────────────────────────────────────────────
  const canGoUp = displayLevel !== initialLevel;

  const drillDown = (key: string) => {
    if (displayLevel === "year") { setSelYear(key); setDisplayLevel("month"); }
    else if (displayLevel === "month") { setSelMonth(key); setDisplayLevel("week"); }
    else if (displayLevel === "week") { setSelWeek(key); setDisplayLevel("day"); }
  };

  const goBack = () => {
    if (displayLevel === "day") { setSelWeek(null); setDisplayLevel("week"); }
    else if (displayLevel === "week") { setSelMonth(null); setDisplayLevel("month"); }
    else if (displayLevel === "month") { setSelYear(null); setDisplayLevel("year"); }
  };

  const goToLevel = (level: DrillLevel) => {
    const idx = LEVEL_ORDER[level];
    const minIdx = LEVEL_ORDER[initialLevel];
    if (idx < minIdx) return;
    if (level === "year") { setSelYear(null); setSelMonth(null); setSelWeek(null); }
    else if (level === "month") { setSelMonth(null); setSelWeek(null); }
    else if (level === "week") { setSelWeek(null); }
    setDisplayLevel(level);
  };

  // ── KPI totals (plain computations, not hooks) ─────────────────────────
  const totVtas = filtered.reduce((s, i) => s + i.ventas, 0);
  const totCsto = filtered.reduce((s, i) => s + i.costo_mercancia, 0);
  const totGast = filtered.reduce((s, i) => s + i.gastos_operativos, 0);
  const totGBru = filtered.reduce((s, i) => s + i.ganancia_bruta, 0);
  const totGNet = filtered.reduce((s, i) => s + i.ganancia_neta, 0);
  const mBrutoPct = totVtas > 0 ? (totGBru / totVtas) * 100 : null;
  const mNetoPct = totVtas > 0 ? (totGNet / totVtas) * 100 : null;

  // ── Breadcrumb ──────────────────────────────────────────────────────────
  const bc: { label: string; level: DrillLevel }[] = [];
  if (selYear) bc.push({ label: selYear, level: "year" });
  if (selMonth) bc.push({ label: monthLabel(selMonth), level: "month" });
  if (selWeek) bc.push({ label: weekLabel(selWeek), level: "week" });

  // ── Level labels for table header ───────────────────────────────────────
  const levelLabel: Record<DrillLevel, string> = {
    year: "Año",
    month: "Mes",
    week: "Semana",
    day: "Día",
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Navigation header */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {canGoUp && (
          <button type="button" onClick={goBack} className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-alt">
            ← Volver
          </button>
        )}
        <span className="text-xs text-text-muted">
          {bc.length === 0 ? (
            <span className="font-medium text-text-primary">Inicio</span>
          ) : (
            bc.map((b, i) => (
              <span key={b.level}>
                {i > 0 && <span className="mx-1">›</span>}
                {i < bc.length - 1 ? (
                  <button type="button" onClick={() => goToLevel(b.level)} className="text-accent hover:underline">
                    {b.label}
                  </button>
                ) : (
                  <span className="font-medium text-text-primary">{b.label}</span>
                )}
              </span>
            ))
          )}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card><Stat label="Ventas" value={formatMoneyFull(totVtas)} subtitle={`${filtered.length} días`} /></Card>
        <Card><Stat label="Costo mercancía" value={formatMoneyFull(totCsto)} subtitle="lo que te costó" /></Card>
        <Card><Stat label="Gastos operativos" value={formatMoneyFull(totGast)} subtitle="arriendo, nómina, etc." /></Card>
        <Card>
          <Stat
            label="Ganancia bruta"
            value={formatMoneyFull(totGBru)}
            subtitle={mBrutoPct != null ? `${mBrutoPct.toFixed(1)}% margen` : "—"}
          />
        </Card>
        <Card>
          <Stat
            label="Ganancia neta"
            value={formatMoneyFull(totGNet)}
            subtitle={mNetoPct != null ? `${mNetoPct.toFixed(1)}% neto` : "Cargá gastos operativos"}
          />
        </Card>
      </div>

      {/* Banner + Chart: only at day level */}
      {displayLevel === "day" && (
        <>
          <div className="rounded-lg border border-border bg-surface-alt/40 px-4 py-3 text-sm">
            <p className="mb-2 font-semibold text-text-primary">Cómo leer el gráfico</p>
            <ul className="space-y-1 text-text-secondary">
              <li><span className="inline-block h-3 w-3 rounded-sm align-middle" style={{ background: "#16A34A" }} />{" "}<strong>Ventas del día</strong> (barra verde, eje izquierdo) — lo que vendiste ese día.</li>
              <li><span className="inline-block h-3 w-3 rounded-sm align-middle" style={{ background: "#DC2626" }} />{" "}<strong>Gastos del día</strong> (barra roja, eje izquierdo) — costo de la mercancía vendida + prorrateo de gastos operativos del mes.</li>
              <li><span className="inline-block h-2 w-4 align-middle" style={{ borderTop: "2px dashed #2563EB" }} />{" "}<strong>Ganancia neta del día</strong> (línea azul punteada, eje derecho).</li>
              <li><span className="inline-block h-2 w-4 align-middle" style={{ borderTop: "3px solid #000" }} />{" "}<strong>Balance acumulado</strong> (línea negra gruesa, eje derecho).</li>
            </ul>
          </div>

          {chartData.length > 0 && (
            <Card header={<h2 className="font-semibold text-text-primary">Evolución financiera — {selWeek ? `Semana del ${selWeek}` : `${ini} → ${fin}`}</h2>}>
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, angle: -45, textAnchor: "end" }} height={55} stroke="#a3a3a3" interval={Math.max(0, Math.floor(chartData.length / 15))} />
                  <YAxis yAxisId="l" tick={{ fontSize: 10 }} stroke="#a3a3a3" tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} label={{ value: "Día ($)", angle: -90, position: "insideLeft", fontSize: 10, fill: "#666" }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} stroke="#000" tickFormatter={(v) => `$${(v / 1e6).toFixed(1)}M`} label={{ value: "Acumulado ($)", angle: 90, position: "insideRight", fontSize: 10, fill: "#666" }} />
                  <Tooltip
                    labelFormatter={(label) => `Día: ${label}`}
                    formatter={(value, name) => [formatMoneyFull(Number(value)), String(name)]}
                    itemSorter={(item) => {
                      const order: Record<string, number> = { "Ventas del día": 1, "Gastos del día (costo + operativos)": 2, "Ganancia neta del día": 3, "Balance acumulado": 4 };
                      return order[String(item.name)] ?? 99;
                    }}
                    contentStyle={{ borderRadius: "8px", fontSize: "12px", padding: "8px 12px" }}
                    itemStyle={{ padding: "2px 0" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} iconType="rect" />
                  <ReferenceLine yAxisId="r" y={0} stroke="#666" strokeDasharray="3 3" />
                  <Bar yAxisId="l" dataKey="ventas" fill="#16A34A" name="Ventas del día" radius={[2, 2, 0, 0]} />
                  <Bar yAxisId="l" dataKey="gastos" fill="#DC2626" name="Gastos del día (costo + operativos)" radius={[2, 2, 0, 0]} />
                  <Line yAxisId="r" type="monotone" dataKey="ganancia" stroke="#2563EB" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Ganancia neta del día" />
                  <Line yAxisId="r" type="monotone" dataKey="acumulado" stroke="#000" strokeWidth={2.5} dot={false} name="Balance acumulado" />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          )}
        </>
      )}

      {/* Table: aggregated or daily */}
      <Card header={<h2 className="font-semibold text-text-primary">{displayLevel === "day" ? "Detalle diario" : `${levelLabel[displayLevel]}s del período`}</h2>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-2">{levelLabel[displayLevel]}</th>
                <th className="px-2 text-right">Ventas</th>
                <th className="px-2 text-right">Costo mercancía</th>
                <th className="px-2 text-right">Gastos op.</th>
                <th className="px-2 text-right">Ganancia bruta</th>
                <th className="px-2 text-right">Ganancia neta</th>
                <th className="px-2 text-right">Balance acum.</th>
                {displayLevel !== "day" && <th className="px-2 text-right">Días</th>}
              </tr>
            </thead>
            <tbody>
              {rows.slice().reverse().map((r) => (
                <tr
                  key={r.key}
                  onClick={displayLevel !== "day" ? () => drillDown(r.key) : undefined}
                  className={`border-b border-border/60 ${displayLevel !== "day" ? "cursor-pointer hover:bg-surface-alt/60" : ""}`}
                >
                  <td className={`py-2 pr-2 font-medium ${displayLevel !== "day" ? "text-accent" : "text-text-primary"}`}>
                    {r.label}
                    {displayLevel !== "day" && <span className="ml-1 text-[0.65rem] text-text-muted">→</span>}
                  </td>
                  <td className="px-2 text-right tabular-nums">{formatMoneyFull(r.ventas)}</td>
                  <td className="px-2 text-right tabular-nums text-text-muted">{formatMoneyFull(r.costo_mercancia)}</td>
                  <td className="px-2 text-right tabular-nums text-text-muted">{formatMoneyFull(r.gastos_operativos)}</td>
                  <td className="px-2 text-right tabular-nums text-green-700">{formatMoneyFull(r.ganancia_bruta)}</td>
                  <td className={`px-2 text-right tabular-nums font-semibold ${r.ganancia_neta >= 0 ? "text-green-700" : "text-red-600"}`}>{formatMoneyFull(r.ganancia_neta)}</td>
                  <td className={`px-2 text-right tabular-nums font-semibold ${r.balance_acumulado >= 0 ? "text-text-primary" : "text-red-600"}`}>{formatMoneyFull(r.balance_acumulado)}</td>
                  {displayLevel !== "day" && <td className="px-2 text-right text-text-muted tabular-nums">{r.numDays}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Horas Pico Tab ──────────────────────────────────────────────────────────

function HorasPicoTab({ ini, fin }: { ini: string; fin: string }): JSX.Element {
  const { data, isLoading, error } = useHorasPico(ini, fin);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.items.map((it: HoraPicoItem) => ({
      label: formatHour(it.hour),
      ventas: it.total_ventas,
      facturas: it.num_facturas,
      ticket: it.ticket_promedio,
    }));
  }, [data]);

  if (isLoading && !data) return <Skeleton className="h-96 rounded-xl" />;
  if (error) return <Card><p className="py-8 text-center text-sm text-error">Error cargando horas pico.</p></Card>;
  if (!data) return <Card><Skeleton className="h-48 rounded-lg" /></Card>;

  const sinDatos = data.items.every((i) => i.num_facturas === 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card>
          <Stat
            label="Hora pico (facturas)"
            value={data.hora_pico_facturas != null ? formatHour(data.hora_pico_facturas) : "—"}
            subtitle="hora con más pedidos"
          />
        </Card>
        <Card>
          <Stat
            label="Hora pico (ventas $)"
            value={data.hora_pico_ventas != null ? formatHour(data.hora_pico_ventas) : "—"}
            subtitle="hora con más ingresos"
          />
        </Card>
        <Card>
          <Stat
            label="Rango analizado"
            value={`${ini.slice(5)} → ${fin.slice(5)}`}
            subtitle={`${data.items.reduce((s, i) => s + i.num_facturas, 0).toLocaleString("es-CO")} facturas`}
          />
        </Card>
      </div>

      <div className="rounded-lg border border-border bg-surface-alt/40 px-4 py-3 text-sm">
        <p className="text-text-secondary">
          Saber a qué hora vendés más te ayuda a <strong>programar personal</strong>, planificar
          campañas y entender el ritmo del negocio. Si entre las 17 y 19 hay pico,
          es la peor hora para irte a almorzar.
        </p>
      </div>

      {sinDatos ? (
        <Card><p className="py-12 text-center text-sm text-text-muted">Sin facturas en el período.</p></Card>
      ) : (
        <>
          <Card header={<h2 className="font-semibold text-text-primary">Pedidos por hora del día</h2>}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#a3a3a3" />
                <YAxis tick={{ fontSize: 10 }} stroke="#a3a3a3" />
                <Tooltip
                  formatter={(v, name) => name === "facturas" ? [String(v), "Facturas"] : [formatMoneyFull(Number(v)), name === "ventas" ? "Ventas" : "Ticket prom."]}
                  contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                />
                <Line type="monotone" dataKey="facturas" stroke="#7B1818" strokeWidth={2.5} dot={{ r: 3, fill: "#7B1818" }} activeDot={{ r: 6 }} name="facturas" />
              </LineChart>
            </ResponsiveContainer>
            <p className="mt-1 text-[0.7rem] text-text-muted">Eje Y: cantidad de facturas · Eje X: hora del día (0-23)</p>
          </Card>

          <Card header={<h2 className="font-semibold text-text-primary">Ventas $ por hora del día</h2>}>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#a3a3a3" />
                <YAxis yAxisId="l" tick={{ fontSize: 10 }} stroke="#a3a3a3" tickFormatter={(v: number) => `$${(v / 1e6).toFixed(1)}M`} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} stroke="#2563EB" tickFormatter={(v: number) => `$${(v / 1e3).toFixed(0)}K`} />
                <Tooltip formatter={(v, name) => [formatMoneyFull(Number(v)), name === "ventas" ? "Ventas $" : "Ticket prom."]} contentStyle={{ borderRadius: "8px", fontSize: "12px" }} />
                <Bar yAxisId="l" dataKey="ventas" fill="#16A34A" radius={[2, 2, 0, 0]} name="ventas" />
                <Line yAxisId="r" type="monotone" dataKey="ticket" stroke="#2563EB" strokeWidth={2} dot={false} name="ticket" />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* V1.16: Heatmap día × hora — combina horas pico con día de semana */}
          <HeatmapDiaHora fechaInicio={ini} fechaFin={fin} />
        </>
      )}
    </div>
  );
}

// ── Gastos Tab (CRUD Supabase) ──────────────────────────────────────────────

const CATEGORIAS_LIST: GastoCategoria[] = [
  "arriendo", "nomina", "servicios", "mantenimiento", "marketing",
  "impuestos", "combustible", "transporte", "papeleria", "seguros", "otros",
];

function thisMonthISO(): string {
  return new Date().toISOString().slice(0, 7);
}

function prevMonthISO(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function GastosTab(): JSX.Element {
  const [filterMes, setFilterMes] = useState<string>(""); // vacío = todos los meses
  const { data, isLoading, error } = useGastos(filterMes || undefined);
  const { mutate } = useSWRConfig();
  const currentTenant = useAuthStore((s) => s.currentTenant);
  const role = useAuthStore((s) => s.role ?? "");
  const canEdit = role === "admin" || role === "gerente";

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formMes, setFormMes] = useState<string>(thisMonthISO());
  const [formCategoria, setFormCategoria] = useState<GastoCategoria>("arriendo");
  const [formMonto, setFormMonto] = useState<string>("");
  const [formDescripcion, setFormDescripcion] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string>("");

  // ── Copiar gastos del mes anterior (con selección) ──────────────────────
  const [showCopy, setShowCopy] = useState(false);
  const [copyOrigen, setCopyOrigen] = useState<string>(prevMonthISO());
  const [copyDestino, setCopyDestino] = useState<string>(thisMonthISO());
  const [copySel, setCopySel] = useState<Set<number>>(new Set());
  const [copying, setCopying] = useState(false);
  const [copyMsg, setCopyMsg] = useState<string>("");
  const origenReq = useGastos(copyOrigen);
  const origenItems = useMemo(() => origenReq.data?.items ?? [], [origenReq.data]);
  // Al abrir el panel o cambiar el mes origen, tildar todos por defecto.
  useEffect(() => {
    if (showCopy) setCopySel(new Set(origenItems.map((g) => g.id)));
  }, [showCopy, origenItems]);

  const totalMes = useMemo(() => {
    if (!data) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const g of data.items) {
      m.set(g.mes, (m.get(g.mes) ?? 0) + g.monto);
    }
    return m;
  }, [data]);

  const resetForm = () => {
    setEditingId(null);
    setFormMes(thisMonthISO());
    setFormCategoria("arriendo");
    setFormMonto("");
    setFormDescripcion("");
    setErrMsg("");
  };

  const startEdit = (g: Gasto) => {
    setEditingId(g.id);
    setFormMes(g.mes);
    setFormCategoria(g.categoria);
    setFormMonto(String(g.monto));
    setFormDescripcion(g.descripcion ?? "");
    setShowForm(true);
    setErrMsg("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const monto = Number(formMonto);
    if (!Number.isFinite(monto) || monto < 0) {
      setErrMsg("Monto inválido");
      return;
    }
    setSubmitting(true);
    setErrMsg("");
    try {
      if (editingId == null) {
        await createGasto({
          mes: formMes,
          categoria: formCategoria,
          monto,
          descripcion: formDescripcion.trim() || null,
        });
      } else {
        await updateGasto(editingId, {
          mes: formMes,
          categoria: formCategoria,
          monto,
          descripcion: formDescripcion.trim() || null,
        });
      }
      // Invalidar cache de gastos + balance del tenant
      await mutate(
        (key) => Array.isArray(key) && typeof key[1] === "string" &&
          (key[1].startsWith("/api/gastos") || key[1].startsWith("/api/metrics/analisis-balance")),
        undefined,
        { revalidate: true },
      );
      resetForm();
      setShowForm(false);
    } catch (e2) {
      setErrMsg(e2 instanceof Error ? e2.message : "Error al guardar");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (g: Gasto) => {
    if (!confirm(`¿Eliminar gasto de ${CATEGORIA_LABELS[g.categoria]} (${g.mes}, ${formatMoneyFull(g.monto)})?`)) return;
    try {
      await deleteGasto(g.id);
      await mutate(
        (key) => Array.isArray(key) && typeof key[1] === "string" &&
          (key[1].startsWith("/api/gastos") || key[1].startsWith("/api/metrics/analisis-balance")),
        undefined,
        { revalidate: true },
      );
    } catch (e2) {
      alert(e2 instanceof Error ? e2.message : "Error al eliminar");
    }
  };

  const toggleCopySel = (id: number) => {
    setCopySel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = async () => {
    setCopyMsg("");
    if (copyOrigen === copyDestino) {
      setCopyMsg("El mes origen y destino no pueden ser iguales.");
      return;
    }
    const ids = [...copySel];
    if (ids.length === 0) {
      setCopyMsg("Seleccioná al menos un gasto para copiar.");
      return;
    }
    setCopying(true);
    try {
      const res = await copiarGastos({ mes_origen: copyOrigen, mes_destino: copyDestino, ids });
      await mutate(
        (key) => Array.isArray(key) && typeof key[1] === "string" &&
          (key[1].startsWith("/api/gastos") || key[1].startsWith("/api/metrics/analisis-balance")),
        undefined,
        { revalidate: true },
      );
      const omitidos = ids.length - res.total;
      setShowCopy(false);
      setCopyMsg("");
      setErrMsg("");
      alert(
        `Se copiaron ${res.total} gasto(s) a ${copyDestino}` +
          (omitidos > 0 ? `. Se omitieron ${omitidos} que ya existían en el mes destino.` : "."),
      );
    } catch (e2) {
      setCopyMsg(e2 instanceof Error ? e2.message.replace(/^.*\d{3}\s/, "") : "No se pudo copiar.");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Banner */}
      <div className="rounded-lg border border-border bg-surface-alt/40 px-4 py-3 text-sm">
        <p className="text-text-secondary">
          Cargá los gastos que <strong>no vienen de Hermes</strong>: arriendo, nómina, servicios,
          impuestos, etc. Cada gasto se ingresa <strong>por mes</strong> y se prorratea entre los
          días del mes para descontarse del balance diario. Tenant actual: <strong>{currentTenant ?? "—"}</strong>.
        </p>
      </div>

      {/* Toolbar */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-text-muted">
            Filtrar por mes
            <input
              type="month"
              value={filterMes}
              onChange={(e) => setFilterMes(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
            />
            {filterMes && (
              <button
                type="button"
                onClick={() => setFilterMes("")}
                className="text-xs text-accent hover:underline"
              >
                limpiar
              </button>
            )}
          </label>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { setShowCopy((v) => !v); setCopyMsg(""); }}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-alt"
              >
                {showCopy ? "Cerrar copia" : "Copiar del mes anterior"}
              </button>
              <button
                type="button"
                onClick={() => { resetForm(); setShowForm((v) => !v); }}
                className="rounded-lg bg-surface-dark px-3 py-1.5 text-xs font-medium text-text-inverse hover:opacity-90"
              >
                {showForm ? "Cancelar" : "+ Nuevo gasto"}
              </button>
            </div>
          )}
        </div>

        {!canEdit && (
          <p className="mt-2 text-xs text-text-muted">
            Solo admin/gerente puede crear, editar o eliminar gastos.
          </p>
        )}

        {/* Panel: copiar gastos del mes anterior con selección */}
        {canEdit && showCopy && (
          <div className="mt-4 rounded-lg border border-border bg-surface-alt/30 p-3">
            <p className="text-sm font-medium text-text-primary">Copiar gastos de un mes a otro</p>
            <p className="mt-0.5 text-xs text-text-muted">
              Elegí el mes origen y destino, y tildá cuáles gastos querés copiar. Los que ya existan
              en el mes destino se omiten (no se duplican).
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-text-muted">
                Origen
                <input
                  type="month"
                  value={copyOrigen}
                  onChange={(e) => setCopyOrigen(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
                />
              </label>
              <span className="text-text-muted">→</span>
              <label className="flex items-center gap-2 text-xs text-text-muted">
                Destino
                <input
                  type="month"
                  value={copyDestino}
                  onChange={(e) => setCopyDestino(e.target.value)}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
                />
              </label>
            </div>

            <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface">
              {origenReq.isLoading ? (
                <p className="px-3 py-4 text-sm text-text-muted">Cargando gastos de {copyOrigen}…</p>
              ) : origenItems.length === 0 ? (
                <p className="px-3 py-4 text-sm text-text-muted">No hay gastos en {copyOrigen}.</p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {origenItems.map((g) => (
                    <li key={g.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={copySel.has(g.id)}
                        onChange={() => toggleCopySel(g.id)}
                      />
                      <span className="flex-1 text-text-primary">{CATEGORIA_LABELS[g.categoria]}</span>
                      <span className="text-text-muted">{g.descripcion || "—"}</span>
                      <span className="tabular-nums font-medium text-text-primary">{formatMoneyFull(g.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {copyMsg && <p className="mt-2 text-xs text-red-700">{copyMsg}</p>}

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                disabled={copying || origenItems.length === 0}
                onClick={handleCopy}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60"
              >
                {copying ? "Copiando…" : `Copiar ${copySel.size} gasto(s)`}
              </button>
              <button
                type="button"
                onClick={() => setCopySel(new Set(origenItems.map((g) => g.id)))}
                className="text-xs text-accent hover:underline"
              >
                Tildar todos
              </button>
              <button
                type="button"
                onClick={() => setCopySel(new Set())}
                className="text-xs text-accent hover:underline"
              >
                Destildar todos
              </button>
            </div>
          </div>
        )}

        {/* Formulario */}
        {showForm && canEdit && (
          <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-5">
            <label className="text-xs text-text-muted md:col-span-1">
              Mes
              <input
                type="month"
                value={formMes}
                onChange={(e) => setFormMes(e.target.value)}
                required
                className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text-primary outline-none focus:border-primary"
              />
            </label>
            <label className="text-xs text-text-muted md:col-span-2">
              Categoría
              <select
                value={formCategoria}
                onChange={(e) => setFormCategoria(e.target.value as GastoCategoria)}
                required
                className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text-primary outline-none focus:border-primary"
              >
                {CATEGORIAS_LIST.map((c) => (
                  <option key={c} value={c}>{CATEGORIA_LABELS[c]}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-text-muted md:col-span-1">
              Monto (COP)
              <input
                type="number"
                min={0}
                step={1000}
                value={formMonto}
                onChange={(e) => setFormMonto(e.target.value)}
                required
                placeholder="1500000"
                className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text-primary outline-none focus:border-primary"
              />
            </label>
            <label className="text-xs text-text-muted md:col-span-1">
              Descripción (opcional)
              <input
                type="text"
                value={formDescripcion}
                onChange={(e) => setFormDescripcion(e.target.value)}
                placeholder="Local centro"
                className="mt-1 block w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text-primary outline-none focus:border-primary"
              />
            </label>
            <div className="md:col-span-5 flex items-center justify-between gap-3">
              {errMsg && <p className="text-xs text-error">{errMsg}</p>}
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => { resetForm(); setShowForm(false); }}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-alt"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-text-inverse hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? "Guardando..." : editingId ? "Guardar cambios" : "Crear gasto"}
                </button>
              </div>
            </div>
          </form>
        )}
      </Card>

      {/* Resumen por mes */}
      {totalMes.size > 0 && (
        <Card header={<h2 className="font-semibold text-text-primary">Resumen por mes</h2>}>
          <div className="flex flex-wrap gap-2">
            {Array.from(totalMes.entries()).sort((a, b) => b[0].localeCompare(a[0])).map(([mes, total]) => (
              <div key={mes} className="rounded-lg border border-border bg-surface-alt/40 px-3 py-2 text-sm">
                <span className="font-medium text-text-primary">{mes}</span>
                <span className="ml-2 text-text-muted">·</span>
                <span className="ml-2 text-red-600 font-semibold tabular-nums">{formatMoneyFull(total)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Lista */}
      <Card header={
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-text-primary">Gastos cargados</h2>
          <span className="text-xs text-text-muted">{data?.total ?? 0} registros</span>
        </div>
      }>
        {isLoading && !data ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : error ? (
          <p className="py-8 text-center text-sm text-error">Error al cargar gastos.</p>
        ) : !data || data.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">
            {filterMes ? `Sin gastos en ${filterMes}.` : "No hay gastos cargados todavía. Apretá \"+ Nuevo gasto\"."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                  <th className="py-2 pr-2">Mes</th>
                  <th className="px-2">Categoría</th>
                  <th className="px-2 text-right">Monto</th>
                  <th className="px-2">Descripción</th>
                  <th className="px-2">Creado por</th>
                  {canEdit && <th className="px-2 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {data.items.map((g) => (
                  <tr key={g.id} className="border-b border-border/60">
                    <td className="py-2 pr-2 font-medium text-text-primary">{g.mes}</td>
                    <td className="px-2 text-text-secondary">{CATEGORIA_LABELS[g.categoria]}</td>
                    <td className="px-2 text-right tabular-nums font-semibold text-red-600">{formatMoneyFull(g.monto)}</td>
                    <td className="px-2 text-text-muted">{g.descripcion ?? "—"}</td>
                    <td className="px-2 text-text-muted">{g.created_by ?? "—"}</td>
                    {canEdit && (
                      <td className="px-2 text-right">
                        <button
                          type="button"
                          onClick={() => startEdit(g)}
                          className="mr-2 text-xs text-accent hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(g)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Eliminar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function AnalisisContent(): JSX.Element {
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const role = useAuthStore((state) => state.role);
  const enabledFeatures = useAuthStore((state) => state.enabledFeatures);
  const allowedModules = useAuthStore((state) => state.allowedModules);
  const allowedTabs = useMemo(
    () => allowedAnalysisTabs({ role, enabledFeatures, allowedModules }),
    [allowedModules, enabledFeatures, role],
  );
  const canSeeAnalysis = allowedTabs.includes("balance");
  const canSeeProjection = allowedTabs.includes("proyeccion");
  const [shortcut, setShortcut] = useState<Shortcut>("mes");
  const initialRange = rangeFromShortcut("mes");
  const [ini, setIni] = useState<string>(initialRange.ini);
  const [fin, setFin] = useState<string>(initialRange.fin);
  const [tab, setTab] = useState<Tab>(() => (
    resolveAnalysisTab(requestedTab, null, allowedTabs) ?? "balance"
  ));
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setTab((current) => resolveAnalysisTab(requestedTab, current, allowedTabs) ?? "balance");
  }, [allowedTabs, requestedTab]);

  function selectTab(nextTab: Tab): void {
    if (!allowedTabs.includes(nextTab)) return;
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState({}, "", url);
  }

  function handleTabKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void {
    const nextIndex = nextTabIndex(index, tabs.length, event.key);
    if (nextIndex === null) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    if (!next) return;
    selectTab(next.key);
    tabRefs.current[nextIndex]?.focus();
  }

  const applyShortcut = (sc: Shortcut) => {
    setShortcut(sc);
    if (sc !== "custom") {
      const r = rangeFromShortcut(sc);
      setIni(r.ini);
      setFin(r.fin);
    }
  };

  const shortcuts: { key: Shortcut; label: string }[] = [
    { key: "semana", label: "Semana" },
    { key: "mes", label: "Mes" },
    { key: "3meses", label: "3 meses" },
    { key: "anio", label: "Año" },
    { key: "todo", label: "Todo" },
  ];

  const allTabs: { key: Tab; label: string }[] = [
    { key: "balance", label: "📊 Balance" },
    { key: "productos", label: "🏆 Productos top" },
    { key: "proveedores", label: "🏷 Proveedores" },
    { key: "horas", label: "⏰ Horas pico" },
    { key: "gastos", label: "💸 Gastos operativos" },
    { key: "proyeccion", label: "◎ Proyección" },
  ];
  const tabs = allTabs.filter((item) => allowedTabs.includes(item.key));

  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-accent hover:underline">← Volver a inicio</Link>

      <div>
        <h1 className="text-xl font-bold text-text-primary">Análisis</h1>
        <p className="text-sm text-text-muted">
          Balance, productos, operación y proyección financiera del negocio
        </p>
      </div>

      {/* La proyección usa su propio horizonte de modelo y no hereda filtros históricos. */}
      {canSeeAnalysis && tab !== "proyeccion" && <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {shortcuts.map((sc) => (
              <button
                key={sc.key}
                type="button"
                onClick={() => applyShortcut(sc.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${shortcut === sc.key ? "bg-surface-dark text-text-inverse" : "bg-surface-alt text-text-secondary hover:bg-surface-alt/80"}`}
              >
                {sc.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-text-muted">
              Desde
              <input
                type="date"
                value={ini}
                max={fin}
                onChange={(e) => { setIni(e.target.value); setShortcut("custom"); }}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
              />
            </label>
            <label className="flex items-center gap-1 text-text-muted">
              Hasta
              <input
                type="date"
                value={fin}
                min={ini}
                max={todayISO()}
                onChange={(e) => { setFin(e.target.value); setShortcut("custom"); }}
                className="rounded-lg border border-border bg-surface px-2 py-1 text-sm text-text-primary outline-none focus:border-primary"
              />
            </label>
          </div>
        </div>
      </Card>}

      {/* Tabs */}
      <div role="tablist" aria-label="Secciones de análisis" className="flex flex-wrap gap-2 border-b border-border pb-3">
        {tabs.map((t, index) => (
          <button
            key={t.key}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            id={`analisis-tab-${t.key}`}
            role="tab"
            aria-selected={tab === t.key}
            aria-controls={`analisis-panel-${t.key}`}
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => selectTab(t.key)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-[background-color,color,transform] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${tab === t.key ? "bg-surface-dark text-text-inverse shadow-sm" : "bg-surface-alt text-text-secondary hover:-translate-y-0.5 hover:text-text-primary motion-reduce:hover:translate-y-0"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabs.map((item) => (
        <div
          key={item.key}
          role="tabpanel"
          id={`analisis-panel-${item.key}`}
          aria-labelledby={`analisis-tab-${item.key}`}
          hidden={tab !== item.key}
          tabIndex={tab === item.key ? 0 : undefined}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {tab === "balance" && item.key === "balance" && <BalanceTab ini={ini} fin={fin} shortcut={shortcut} />}
          {tab === "productos" && item.key === "productos" && <ProductosTopTab ini={ini} fin={fin} />}
          {tab === "proveedores" && item.key === "proveedores" && <ProveedoresTab ini={ini} fin={fin} />}
          {tab === "horas" && item.key === "horas" && <HorasPicoTab ini={ini} fin={fin} />}
          {tab === "gastos" && item.key === "gastos" && <GastosTab />}
          {tab === "proyeccion" && item.key === "proyeccion" && canSeeProjection && <ProyeccionTab />}
        </div>
      ))}
    </div>
  );
}

export default function AnalisisPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <AnalisisContent />
    </Suspense>
  );
}
