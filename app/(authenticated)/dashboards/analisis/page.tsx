"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSWRConfig } from "swr";
import {
  CATEGORIA_LABELS,
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
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  ComposedChart, Bar, Line, LineChart,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

type Tab = "balance" | "horas" | "gastos";
type Shortcut = "semana" | "mes" | "3meses" | "anio" | "todo" | "custom";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftISO(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
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

// ── Balance Tab ─────────────────────────────────────────────────────────────

function BalanceTab({ ini, fin }: { ini: string; fin: string }): JSX.Element {
  const { data, isLoading, error } = useAnalisisBalance(ini, fin);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.items.map((it: BalanceDiaItem) => ({
      label: formatDateLabel(it.date),
      ventas: it.ventas,
      gastos: it.costo_mercancia + it.gastos_operativos,
      ganancia: it.ganancia_neta,
      acumulado: it.balance_acumulado,
    }));
  }, [data]);

  if (isLoading && !data) return <Skeleton className="h-96 rounded-xl" />;
  if (error) return <Card><p className="py-8 text-center text-sm text-error">Error cargando balance.</p></Card>;
  if (!data || data.items.length === 0) {
    return <Card><p className="py-12 text-center text-sm text-text-muted">Sin datos en el período {ini} → {fin}.</p></Card>;
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card><Stat label="Ventas" value={formatMoneyFull(data.total_ventas)} subtitle={`${data.items.length} días`} /></Card>
        <Card><Stat label="Costo mercancía" value={formatMoneyFull(data.total_costo_mercancia)} subtitle="lo que te costó" /></Card>
        <Card><Stat label="Gastos operativos" value={formatMoneyFull(data.total_gastos_operativos)} subtitle="arriendo, nómina, etc." /></Card>
        <Card>
          <Stat
            label="Ganancia bruta"
            value={formatMoneyFull(data.total_ganancia_bruta)}
            subtitle={data.margen_bruto_pct != null ? `${data.margen_bruto_pct.toFixed(1)}% margen` : "—"}
          />
        </Card>
        <Card>
          <Stat
            label="Ganancia neta"
            value={formatMoneyFull(data.total_ganancia_neta)}
            subtitle={data.margen_neto_pct != null ? `${data.margen_neto_pct.toFixed(1)}% neto` : "Cargá gastos operativos"}
          />
        </Card>
      </div>

      {/* Banner explicativo */}
      <div className="rounded-lg border border-border bg-surface-alt/40 px-4 py-3 text-sm">
        <p className="text-text-secondary">
          <strong>Ventas</strong> (verde) = lo que vendiste.{" "}
          <strong>Gastos</strong> (rojo) = lo que te costó la mercancía vendida + gastos operativos.{" "}
          <strong>Balance acumulado</strong> (línea negra) = ganancia neta sumada en el tiempo.
        </p>
      </div>

      {/* Gráfico principal */}
      <Card header={<h2 className="font-semibold text-text-primary">Evolución financiera — {ini} → {fin}</h2>}>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 9, angle: -45, textAnchor: "end" }} height={55} stroke="#a3a3a3" interval={Math.max(0, Math.floor(chartData.length / 15))} />
            <YAxis yAxisId="l" tick={{ fontSize: 10 }} stroke="#a3a3a3" tickFormatter={(v: number) => `$${(v / 1e6).toFixed(1)}M`} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} stroke="#000" tickFormatter={(v: number) => `$${(v / 1e6).toFixed(1)}M`} />
            <Tooltip
              formatter={(v, name) => [formatMoneyFull(Number(v)), name === "ventas" ? "Ventas" : name === "gastos" ? "Gastos (costo + op.)" : name === "ganancia" ? "Ganancia día" : "Balance acumulado"]}
              contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
            />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <ReferenceLine yAxisId="r" y={0} stroke="#666" strokeDasharray="3 3" />
            <Bar yAxisId="l" dataKey="ventas" fill="#16A34A" name="Ventas" radius={[2, 2, 0, 0]} />
            <Bar yAxisId="l" dataKey="gastos" fill="#DC2626" name="Gastos" radius={[2, 2, 0, 0]} />
            <Line yAxisId="r" type="monotone" dataKey="ganancia" stroke="#2563EB" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Ganancia día" />
            <Line yAxisId="r" type="monotone" dataKey="acumulado" stroke="#000" strokeWidth={2.5} dot={false} name="Balance acumulado" />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* Tabla detalle */}
      <Card header={<h2 className="font-semibold text-text-primary">Detalle diario</h2>}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-2">Día</th>
                <th className="px-2 text-right">Ventas</th>
                <th className="px-2 text-right">Costo mercancía</th>
                <th className="px-2 text-right">Gastos op.</th>
                <th className="px-2 text-right">Ganancia bruta</th>
                <th className="px-2 text-right">Ganancia neta</th>
                <th className="px-2 text-right">Balance acum.</th>
              </tr>
            </thead>
            <tbody>
              {data.items.slice().reverse().map((it) => (
                <tr key={it.date} className="border-b border-border/60">
                  <td className="py-2 pr-2 font-medium text-text-primary">{it.date}</td>
                  <td className="px-2 text-right tabular-nums">{formatMoneyFull(it.ventas)}</td>
                  <td className="px-2 text-right tabular-nums text-text-muted">{formatMoneyFull(it.costo_mercancia)}</td>
                  <td className="px-2 text-right tabular-nums text-text-muted">{formatMoneyFull(it.gastos_operativos)}</td>
                  <td className="px-2 text-right tabular-nums text-green-700">{formatMoneyFull(it.ganancia_bruta)}</td>
                  <td className={`px-2 text-right tabular-nums font-semibold ${it.ganancia_neta >= 0 ? "text-green-700" : "text-red-600"}`}>{formatMoneyFull(it.ganancia_neta)}</td>
                  <td className={`px-2 text-right tabular-nums font-semibold ${it.balance_acumulado >= 0 ? "text-text-primary" : "text-red-600"}`}>{formatMoneyFull(it.balance_acumulado)}</td>
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
  if (!data) return <Card><p className="py-12 text-center text-sm text-text-muted">Sin datos.</p></Card>;

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
            <button
              type="button"
              onClick={() => { resetForm(); setShowForm((v) => !v); }}
              className="rounded-lg bg-surface-dark px-3 py-1.5 text-xs font-medium text-text-inverse hover:opacity-90"
            >
              {showForm ? "Cancelar" : "+ Nuevo gasto"}
            </button>
          )}
        </div>

        {!canEdit && (
          <p className="mt-2 text-xs text-text-muted">
            Solo admin/gerente puede crear, editar o eliminar gastos.
          </p>
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

export default function AnalisisPage(): JSX.Element {
  const [shortcut, setShortcut] = useState<Shortcut>("mes");
  const initialRange = rangeFromShortcut("mes");
  const [ini, setIni] = useState<string>(initialRange.ini);
  const [fin, setFin] = useState<string>(initialRange.fin);
  const [tab, setTab] = useState<Tab>("balance");

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

  const tabs: { key: Tab; label: string }[] = [
    { key: "balance", label: "Balance" },
    { key: "horas", label: "Horas pico" },
    { key: "gastos", label: "Gastos operativos" },
  ];

  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-accent hover:underline">← Volver a inicio</Link>

      <div>
        <h1 className="text-xl font-bold text-text-primary">Análisis financiero</h1>
        <p className="text-sm text-text-muted">
          Balance, horas pico y rentabilidad real del negocio
        </p>
      </div>

      {/* Selector de rango */}
      <Card>
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
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${tab === t.key ? "bg-surface-dark text-text-inverse" : "bg-surface-alt text-text-secondary"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "balance" && <BalanceTab ini={ini} fin={fin} />}
      {tab === "horas" && <HorasPicoTab ini={ini} fin={fin} />}
      {tab === "gastos" && <GastosTab />}
    </div>
  );
}
