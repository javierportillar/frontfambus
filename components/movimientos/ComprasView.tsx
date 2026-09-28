"use client";

// V1.23: Extraído desde app/dashboards/compras/page.tsx para unificar con Ventas
// bajo /dashboards/movimientos. Lógica idéntica al original — sólo se removió
// el header de página (volver/título), ahora lo provee MovimientosPage.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useComprasOverview,
  useComprasHistorico,
  useComprasPorProveedor,
} from "@/lib/api/hooks";
import { isValidSupplierNit, supplierProfileHref } from "@/lib/compras/routes";
import { formatMoneyFull } from "@/lib/format/currency";
import { BuscarComprasTab } from "@/components/compras/BuscarComprasTab";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import { Calendar } from "@/components/ui/Calendar";
import {
  Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

type Tab = "mensual" | "proveedor" | "historico" | "buscar";

const MONTHS_LABEL = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
function mesLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MONTHS_LABEL[Number(m) - 1] ?? m} ${y}`;
}
function mesShortLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  return `${MONTHS_LABEL[Number(m) - 1] ?? m} ${String(y).slice(2)}`;
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function ComprasView(): JSX.Element {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("mensual");
  const monthFromUrl = searchParams.get("month");
  const initialMonth = monthFromUrl && /^\d{4}-\d{2}$/.test(monthFromUrl) ? monthFromUrl : currentMonth();
  const [mes, setMes] = useState<string>(initialMonth);

  useEffect(() => {
    if (monthFromUrl && /^\d{4}-\d{2}$/.test(monthFromUrl) && monthFromUrl !== mes) {
      setMes(monthFromUrl);
      setTab("mensual");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthFromUrl]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <p className="text-xs text-text-muted">Vista mensual, por proveedor, histórica y búsqueda de compras</p>
        {tab === "mensual" && (
          <label className="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
            Mes a analizar
            <input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="mt-1 block rounded-xl border border-border bg-surface px-3 py-2 text-sm font-normal normal-case tracking-normal"
            />
          </label>
        )}
      </div>

      <div className="border-b border-border pb-2">
        <div role="group" aria-label="Vistas de compras" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <TabPill active={tab === "mensual"} onClick={() => setTab("mensual")} label="📅 Mensual" />
          <TabPill active={tab === "proveedor"} onClick={() => setTab("proveedor")} label="🏷 Por proveedor" />
          <TabPill active={tab === "historico"} onClick={() => setTab("historico")} label="📈 Histórica" />
          <TabPill active={tab === "buscar"} onClick={() => setTab("buscar")} label="🔎 Buscar" />
        </div>
      </div>

      {tab === "mensual" && <MensualTab mes={mes} />}
      {tab === "proveedor" && <ProveedorTab />}
      {tab === "historico" && <HistoricaTab onClickMes={(m) => { setMes(m); setTab("mensual"); }} />}
      {tab === "buscar" && <BuscarComprasTab />}
    </div>
  );
}

function TabPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 w-full whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium sm:w-auto ${
        active ? "bg-surface-dark text-text-inverse" : "bg-surface-alt text-text-secondary hover:bg-surface-alt/70"
      }`}
    >
      {label}
    </button>
  );
}

function MensualTab({ mes }: { mes: string }): JSX.Element {
  const { data, isLoading } = useComprasOverview(mes);
  const router = useRouter();

  // V1.26: skeleton mientras !data (loading o revalidando) — evita flash de "Sin datos".
  if (!data) return <Card><Skeleton className="h-96 rounded-lg" /></Card>;
  void isLoading;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <Stat
            label="Total compras"
            value={formatMoneyFull(data.total_compras)}
            subtitle={mesLabel(mes)}
          />
        </Card>
        <Card>
          <Stat
            label="Documentos"
            value={data.total_documentos.toLocaleString("es-CO")}
            subtitle="facturas de compra"
          />
        </Card>
        <Card>
          <Stat
            label="Proveedores"
            value={data.proveedores_unicos.toLocaleString("es-CO")}
            subtitle="distintos en el mes"
          />
        </Card>
        <Card>
          <Stat
            label="Ticket promedio"
            value={formatMoneyFull(data.ticket_promedio)}
            subtitle="por documento"
          />
        </Card>
      </div>

      <Card header={
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-text-primary">Calendario — {mesLabel(mes)}</h2>
          <span className="text-xs text-text-muted">click en día → detalle</span>
        </div>
      }>
        {data.dias.length === 0 ? (
          <p className="py-12 text-center text-sm text-text-muted">Sin compras registradas en {mesLabel(mes)}.</p>
        ) : (
          <Calendar
            mode="purchases"
            month={mes}
            days={data.dias.map((d) => ({
              date: d.date,
              day: d.day,
              sales: d.total,
              invoices: d.num_documentos,
              avgTicket: d.num_documentos > 0 ? d.total / d.num_documentos : 0,
            }))}
            onDayClick={(date) => router.push(`/dashboards/compras/dia/${date}?from=mensual`)}
          />
        )}
        <p className="mt-2 text-[0.65rem] text-text-muted">
          Las cifras del calendario representan el <strong>monto comprado</strong> ese día (no ventas).
          Click en un día → vista de detalle completa.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card header={
          <div>
            <h2 className="font-semibold text-text-primary">Top 10 proveedores</h2>
            <p className="text-xs text-text-muted">click → detalle de qué le compraste</p>
          </div>
        }>
          {data.top_proveedores.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">Sin proveedores en el mes.</p>
          ) : (
            <div className="space-y-1.5">
              {data.top_proveedores.map((p, idx) => {
                const max = data.top_proveedores[0]?.total_compras ?? 1;
                const intensity = p.total_compras / max;
                const canClick = isValidSupplierNit(p.nit ?? "");
                const summary = (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-text-primary">{p.nombre}</div>
                        <div className="text-[0.65rem] text-text-muted">NIT {p.nit ?? "?"} · {p.num_documentos} doc</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums">{formatMoneyFull(p.total_compras)}</div>
                      </div>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-alt">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, intensity * 100)}%` }} />
                    </div>
                  </>
                );
                return (
                  <div key={`${p.nit}-${idx}`}>
                    {canClick ? (
                      <Link
                        href={supplierProfileHref(p.nit ?? "")}
                        className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-left hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {summary}
                      </Link>
                    ) : (
                      <div className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-left opacity-60">
                        {summary}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card header={<h2 className="font-semibold text-text-primary">Top 15 productos comprados</h2>}>
          {data.top_productos.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">Sin productos en el mes.</p>
          ) : (
            <>
            <ul aria-label="Productos más comprados del mes" className="space-y-2 lg:hidden">
              {data.top_productos.map((product, index) => (
                <li key={product.cod_producto}>
                  <Link
                    href={`/dashboards/productos/${encodeURIComponent(product.cod_producto)}`}
                    className="flex min-h-11 min-w-0 items-start justify-between gap-3 rounded-lg border border-border p-3 hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="shrink-0 pt-0.5 text-xs tabular-nums text-text-muted">{index + 1}.</span>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold leading-snug text-text-primary">{product.nom_producto}</p>
                        <p className="mt-0.5 break-all font-mono text-xs text-text-muted">{product.cod_producto}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <p className="font-semibold tabular-nums text-text-primary">{formatMoneyFull(product.valor_total)}</p>
                      <p className="mt-0.5 text-text-muted">
                        {product.cantidad_total.toLocaleString("es-CO", { maximumFractionDigits: 2 })} {product.unidad_medida ?? "u"}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 px-2">Producto</th>
                    <th className="py-2 px-2 text-right">Cantidad</th>
                    <th className="py-2 px-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_productos.map((p, idx) => (
                    <tr
                      key={p.cod_producto}
                      className="border-b border-border/60 hover:bg-surface-alt cursor-pointer"
                      onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(p.cod_producto)}`)}
                    >
                      <td className="py-2 pr-2 text-xs text-text-muted">{idx + 1}</td>
                      <td className="py-2 px-2">
                        <div className="text-text-primary font-medium text-sm truncate max-w-xs">{p.nom_producto}</div>
                        <div className="text-[0.65rem] text-text-muted">{p.cod_producto}</div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-text-muted">
                        {p.cantidad_total.toLocaleString("es-CO", { maximumFractionDigits: 2 })}{" "}
                        <span className="text-xs">{p.unidad_medida ?? "u"}</span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold">
                        {formatMoneyFull(p.valor_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function ProveedorTab(): JSX.Element {
  const today = todayISO();
  const [ini, setIni] = useState<string>(today.slice(0, 7) + "-01");
  const [fin, setFin] = useState<string>(today);
  const [filter, setFilter] = useState("");
  const { data, isLoading } = useComprasPorProveedor(ini, fin);

  const visibles = useMemo(() => {
    if (!data) return [];
    const q = filter.toLowerCase();
    return data.proveedores.filter(
      (p) => !q || p.nombre.toLowerCase().includes(q) || (p.nit ?? "").includes(q),
    );
  }, [data, filter]);

  const totalRango = useMemo(() => visibles.reduce((s, p) => s + p.total_compras, 0), [visibles]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-xs text-text-muted">
            Desde
            <input
              type="date"
              value={ini}
              max={fin}
              onChange={(e) => setIni(e.target.value)}
              className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="min-w-0 text-xs text-text-muted">
            Hasta
            <input
              type="date"
              value={fin}
              min={ini}
              max={today}
              onChange={(e) => setFin(e.target.value)}
              className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="mt-3 block min-w-0 text-xs text-text-muted">
          Buscar proveedor
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Buscar proveedor o NIT"
            placeholder="Buscar proveedor (nombre o NIT)..."
            className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
          />
        </label>
      </Card>

      {isLoading && !data ? (
        <Card><Skeleton className="h-64 rounded-lg" /></Card>
      ) : !data || data.proveedores.length === 0 ? (
        <Card><p className="py-8 text-center text-sm text-text-muted">Sin compras en el rango seleccionado.</p></Card>
      ) : (
        <Card header={
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-semibold text-text-primary">
              {visibles.length} proveedor{visibles.length === 1 ? "" : "es"} en el rango
            </h2>
            <span className="text-base font-semibold tabular-nums text-text-primary sm:text-sm">
              Total: {formatMoneyFull(totalRango)}
            </span>
          </div>
        }>
          <ul aria-label="Proveedores del período" className="space-y-2 lg:hidden">
            {visibles.map((provider, index) => {
              const profileHref = isValidSupplierNit(provider.nit ?? "")
                ? supplierProfileHref(provider.nit ?? "")
                : null;
              return (
                <li key={`${provider.nit}-${index}`} className="min-w-0 rounded-lg border border-border bg-surface p-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      {profileHref ? (
                        <Link href={profileHref} className="block break-words text-sm font-semibold leading-snug text-primary hover:underline">
                          {provider.nombre}
                        </Link>
                      ) : (
                        <p className="break-words text-sm font-semibold leading-snug text-text-primary">{provider.nombre}</p>
                      )}
                      <p className="mt-1 break-all font-mono text-xs text-text-muted">
                        {profileHref ? (
                          <Link href={profileHref} className="hover:text-primary hover:underline">NIT {provider.nit}</Link>
                        ) : `NIT ${provider.nit ?? "?"}`}
                      </p>
                    </div>
                    <p className="shrink-0 text-right text-sm font-bold tabular-nums text-text-primary">
                      {formatMoneyFull(provider.total_compras)}
                    </p>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/70 pt-2 text-xs">
                    <div>
                      <dt className="text-text-muted">Documentos</dt>
                      <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">
                        {provider.num_documentos.toLocaleString("es-CO")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">Primera compra</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-text-primary">{provider.primera_compra ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-text-muted">Última compra</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-text-primary">{provider.ultima_compra ?? "—"}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
            <table aria-label="Compras por proveedor" className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-alt text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                  <th className="py-2 px-3">#</th>
                  <th className="py-2 px-3">Proveedor</th>
                  <th className="py-2 px-3">NIT</th>
                  <th className="py-2 px-3 text-right">Documentos</th>
                  <th className="py-2 px-3 text-right">Total comprado</th>
                  <th className="py-2 px-3">Primera compra</th>
                  <th className="py-2 px-3">Última compra</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((p, idx) => (
                  <tr key={`${p.nit}-${idx}`} className="border-b border-border/60 hover:bg-surface-alt">
                    <td className="py-2 px-3 text-xs text-text-muted tabular-nums">{idx + 1}</td>
                    <td className="py-2 px-3 font-medium text-text-primary">
                      {isValidSupplierNit(p.nit ?? "") ? (
                        <Link href={supplierProfileHref(p.nit ?? "")} className="text-primary hover:underline">{p.nombre}</Link>
                      ) : p.nombre}
                    </td>
                    <td className="py-2 px-3 text-text-muted">
                      {isValidSupplierNit(p.nit ?? "") ? (
                        <Link href={supplierProfileHref(p.nit ?? "")} className="hover:text-primary hover:underline">{p.nit}</Link>
                      ) : p.nit ?? "?"}
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{p.num_documentos}</td>
                    <td className="py-2 px-3 text-right tabular-nums font-semibold">
                      {formatMoneyFull(p.total_compras)}
                    </td>
                    <td className="py-2 px-3 text-xs text-text-muted">{p.primera_compra}</td>
                    <td className="py-2 px-3 text-xs text-text-muted">{p.ultima_compra}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// eslint-disable-next-line no-unused-vars
function HistoricaTab({ onClickMes }: { onClickMes: (m: string) => void }): JSX.Element {
  const { data, isLoading } = useComprasHistorico();
  const router = useRouter();

  if (isLoading && !data) return <Card><Skeleton className="h-96 rounded-lg" /></Card>;
  if (!data || data.serie.length === 0) return <Card><p className="py-8 text-center text-sm text-text-muted">Sin histórico de compras.</p></Card>;

  const chartData = data.serie.map((s) => ({
    mes: mesShortLabel(s.mes),
    mesRaw: s.mes,
    total: s.total,
    documentos: s.num_documentos,
    proveedores: s.proveedores_unicos,
  }));

  const promedio = data.serie.length > 0 ? data.total_compras / data.serie.length : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <Stat
            label="Total histórico"
            value={formatMoneyFull(data.total_compras)}
            subtitle={`${data.serie.length} meses`}
          />
        </Card>
        <Card>
          <Stat
            label="Documentos totales"
            value={data.total_documentos.toLocaleString("es-CO")}
            subtitle="todo el periodo"
          />
        </Card>
        <Card>
          <Stat
            label="Proveedores únicos"
            value={data.proveedores_totales.toLocaleString("es-CO")}
            subtitle="histórico"
          />
        </Card>
        <Card>
          <Stat
            label="Promedio mensual"
            value={formatMoneyFull(promedio)}
            subtitle={`desde ${data.fecha_primera_compra ?? "—"}`}
          />
        </Card>
      </div>

      <Card header={<h2 className="font-semibold text-text-primary">Compras mensuales — histórico completo</h2>}>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 9, angle: -55, textAnchor: "end" }} height={55} stroke="#a3a3a3" interval={0} />
            <YAxis yAxisId="l" tick={{ fontSize: 10 }} stroke="#a3a3a3" tickFormatter={(v: number) => `$${(v / 1e6).toFixed(0)}M`} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} stroke="#2563EB" />
            <Tooltip
              formatter={(v, name) => name === "documentos" || name === "proveedores"
                ? [String(v), name === "documentos" ? "Documentos" : "Proveedores"]
                : [formatMoneyFull(Number(v)), "Total comprado"]}
              contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
            />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            <Bar yAxisId="l" dataKey="total" fill="#7B1818" radius={[3, 3, 0, 0]} name="Total comprado" />
            <Line yAxisId="r" type="monotone" dataKey="documentos" stroke="#2563EB" strokeWidth={2} dot={{ r: 2 }} name="Documentos" />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card header={<h2 className="font-semibold text-text-primary">Tabla mensual</h2>}>
        <ul aria-label="Compras mensuales históricas" className="space-y-2 lg:hidden">
          {[...data.serie].reverse().map((month) => (
            <li key={month.mes}>
              <button
                type="button"
                onClick={() => onClickMes(month.mes)}
                className="flex min-h-11 w-full min-w-0 items-start justify-between gap-3 rounded-lg border border-border p-3 text-left hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <div>
                  <p className="font-semibold text-text-primary">{mesLabel(month.mes)}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {month.num_documentos.toLocaleString("es-CO")} documentos · {month.proveedores_unicos.toLocaleString("es-CO")} proveedores
                  </p>
                </div>
                <p className="shrink-0 text-right text-sm font-bold tabular-nums text-text-primary">{formatMoneyFull(month.total)}</p>
              </button>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                <th className="py-2 pr-2">Mes</th>
                <th className="px-2 text-right">Total</th>
                <th className="px-2 text-right">Documentos</th>
                <th className="px-2 text-right">Proveedores</th>
              </tr>
            </thead>
            <tbody>
              {[...data.serie].reverse().map((m) => (
                <tr
                  key={m.mes}
                  className="border-b border-border/60 hover:bg-surface-alt cursor-pointer"
                  onClick={() => onClickMes(m.mes)}
                >
                  <td className="py-2 pr-2 font-medium text-text-primary">{mesLabel(m.mes)}</td>
                  <td className="px-2 text-right tabular-nums font-semibold">{formatMoneyFull(m.total)}</td>
                  <td className="px-2 text-right tabular-nums">{m.num_documentos}</td>
                  <td className="px-2 text-right tabular-nums text-text-muted">{m.proveedores_unicos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-text-muted">Click en un mes para ir a su vista detallada</p>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card header={
          <div>
            <h2 className="font-semibold text-text-primary">Top 15 proveedores históricos</h2>
            <p className="text-xs text-text-muted">click → detalle de qué le has comprado</p>
          </div>
        }>
          {!data.top_proveedores || data.top_proveedores.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">Sin proveedores con compras registradas.</p>
          ) : (
            <div className="space-y-1.5">
              {data.top_proveedores.map((p, idx) => {
                const max = data.top_proveedores?.[0]?.total_compras ?? 1;
                const intensity = p.total_compras / max;
                const canClick = isValidSupplierNit(p.nit ?? "");
                const summary = (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-text-primary">{p.nombre}</div>
                        <div className="text-[0.65rem] text-text-muted">
                          NIT {p.nit ?? "?"} · {p.num_documentos} doc ·{" "}
                          {p.primera_compra && p.ultima_compra ? `${p.primera_compra} → ${p.ultima_compra}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums">{formatMoneyFull(p.total_compras)}</div>
                      </div>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-alt">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, intensity * 100)}%` }} />
                    </div>
                  </>
                );
                return (
                  <div key={`${p.nit}-${idx}`}>
                    {canClick ? (
                      <Link href={supplierProfileHref(p.nit ?? "")} className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-left hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                        {summary}
                      </Link>
                    ) : (
                      <div className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-left opacity-60">
                        {summary}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card header={
          <div>
            <h2 className="font-semibold text-text-primary">Top 15 productos comprados (histórico)</h2>
            <p className="text-xs text-text-muted">Seleccioná un producto para abrir su ficha.</p>
          </div>
        }>
          {!data.top_productos || data.top_productos.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">Sin productos registrados.</p>
          ) : (
            <>
            <ul aria-label="Productos más comprados históricamente" className="space-y-2 lg:hidden">
              {data.top_productos.map((product, index) => (
                <li key={product.cod_producto}>
                  <Link
                    href={`/dashboards/productos/${encodeURIComponent(product.cod_producto)}`}
                    className="flex min-h-11 min-w-0 items-start justify-between gap-3 rounded-lg border border-border p-3 hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <div className="flex min-w-0 items-start gap-2">
                      <span className="shrink-0 pt-0.5 text-xs tabular-nums text-text-muted">{index + 1}.</span>
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold leading-snug text-text-primary">{product.nom_producto}</p>
                        <p className="mt-0.5 break-all font-mono text-xs text-text-muted">{product.cod_producto}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-xs">
                      <p className="font-semibold tabular-nums text-text-primary">{formatMoneyFull(product.valor_total)}</p>
                      <p className="mt-0.5 text-text-muted">
                        {product.cantidad_total.toLocaleString("es-CO", { maximumFractionDigits: 2 })} {product.unidad_medida ?? "u"}
                        {` · ${product.veces_comprado} compras`}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                    <th className="py-2 pr-2">#</th>
                    <th className="py-2 px-2">Producto</th>
                    <th className="py-2 px-2 text-right">Cantidad</th>
                    <th className="py-2 px-2 text-right">Veces</th>
                    <th className="py-2 px-2 text-right">Valor total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_productos.map((p, idx) => (
                    <tr
                      key={p.cod_producto}
                      className="border-b border-border/60 hover:bg-surface-alt cursor-pointer"
                      onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(p.cod_producto)}`)}
                    >
                      <td className="py-2 pr-2 text-xs text-text-muted">{idx + 1}</td>
                      <td className="py-2 px-2">
                        <div className="text-text-primary font-medium text-sm truncate max-w-xs">{p.nom_producto}</div>
                        <div className="text-[0.65rem] text-text-muted">{p.cod_producto}</div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-text-muted">
                        {p.cantidad_total.toLocaleString("es-CO", { maximumFractionDigits: 2 })}{" "}
                        <span className="text-xs">{p.unidad_medida ?? "u"}</span>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-text-muted">{p.veces_comprado}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-semibold">{formatMoneyFull(p.valor_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
