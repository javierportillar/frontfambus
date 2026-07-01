"use client";

// V1.23: Extraído desde app/dashboards/compras/page.tsx para unificar con Ventas
// bajo /dashboards/movimientos. Lógica idéntica al original — sólo se removió
// el header de página (volver/título), ahora lo provee MovimientosPage.

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useComprasOverview,
  useComprasHistorico,
  useComprasPorProveedor,
  useComprasProveedorDetalle,
} from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import { Calendar } from "@/components/ui/Calendar";
import {
  Bar, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

type Tab = "mensual" | "proveedor" | "historico";

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
        <p className="text-xs text-text-muted">Vista mensual, por proveedor e histórica de tus compras</p>
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

      <div className="-mx-4 overflow-x-auto border-b border-border pb-2 md:mx-0">
        <div className="flex gap-2 whitespace-nowrap px-4 md:flex-wrap md:px-0">
          <TabPill active={tab === "mensual"} onClick={() => setTab("mensual")} label="📅 Mensual" />
          <TabPill active={tab === "proveedor"} onClick={() => setTab("proveedor")} label="🏷 Por proveedor" />
          <TabPill active={tab === "historico"} onClick={() => setTab("historico")} label="📈 Histórica" />
        </div>
      </div>

      {tab === "mensual" && <MensualTab mes={mes} />}
      {tab === "proveedor" && <ProveedorTab />}
      {tab === "historico" && <HistoricaTab onClickMes={(m) => { setMes(m); setTab("mensual"); }} />}
    </div>
  );
}

function TabPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
        active ? "bg-surface-dark text-text-inverse" : "bg-surface-alt text-text-secondary hover:bg-surface-alt/70"
      }`}
    >
      {label}
    </button>
  );
}

function monthRange(mes: string): { ini: string; fin: string } {
  const [y, m] = mes.split("-");
  const last = new Date(Number(y), Number(m), 0).getDate();
  return { ini: `${mes}-01`, fin: `${mes}-${String(last).padStart(2, "0")}` };
}

function MensualTab({ mes }: { mes: string }): JSX.Element {
  const { data, isLoading } = useComprasOverview(mes);
  const [selectedProv, setSelectedProv] = useState<{ nit: string } | null>(null);
  const router = useRouter();
  const range = useMemo(() => monthRange(mes), [mes]);

  if (isLoading && !data) return <Card><Skeleton className="h-96 rounded-lg" /></Card>;
  if (!data) return <Card><p className="py-8 text-center text-sm text-text-muted">Sin datos.</p></Card>;

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

      {selectedProv && (
        <ProveedorDetalle
          nit={selectedProv.nit}
          fechaInicio={range.ini}
          fechaFin={range.fin}
          contextoLabel={mesLabel(mes)}
          onClose={() => setSelectedProv(null)}
        />
      )}

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
                const canClick = !!p.nit;
                return (
                  <button
                    key={`${p.nit}-${idx}`}
                    type="button"
                    disabled={!canClick}
                    onClick={() => canClick && p.nit && setSelectedProv({ nit: p.nit })}
                    className={`block w-full rounded-lg border border-border bg-surface px-3 py-2 text-left ${
                      canClick ? "hover:bg-surface-alt cursor-pointer" : "opacity-60 cursor-default"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">{p.nombre}</div>
                        <div className="text-[0.65rem] text-text-muted">NIT {p.nit ?? "?"} · {p.num_documentos} doc</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold tabular-nums">{formatMoneyFull(p.total_compras)}</div>
                      </div>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-alt">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, intensity * 100)}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card header={<h2 className="font-semibold text-text-primary">Top 15 productos comprados</h2>}>
          {data.top_productos.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">Sin productos en el mes.</p>
          ) : (
            <div className="overflow-x-auto">
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
          )}
        </Card>
      </div>
    </div>
  );
}

function ProveedorDetalle({
  nit,
  fechaInicio,
  fechaFin,
  contextoLabel,
  onClose,
}: {
  nit: string;
  fechaInicio: string;
  fechaFin: string;
  contextoLabel: string;
  onClose: () => void;
}): JSX.Element {
  const { data, isLoading } = useComprasProveedorDetalle(nit, fechaInicio, fechaFin);

  return (
    <Card header={
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-text-primary">
            {data?.nombre_proveedor ?? "Proveedor"}
          </h2>
          <p className="text-xs text-text-muted">
            NIT {nit} · {contextoLabel}
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-accent hover:underline">
          Cerrar ×
        </button>
      </div>
    }>
      {isLoading ? (
        <Skeleton className="h-32 rounded-lg" />
      ) : !data || data.documentos.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">Sin compras a este proveedor en el período.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 text-xs">
            <div className="rounded-md border border-border bg-surface-alt/40 px-2 py-1.5">
              <div className="text-text-muted">Total comprado</div>
              <div className="font-semibold text-text-primary tabular-nums">
                {formatMoneyFull(data.total_compras)}
              </div>
            </div>
            <div className="rounded-md border border-border bg-surface-alt/40 px-2 py-1.5">
              <div className="text-text-muted">Documentos</div>
              <div className="font-semibold text-text-primary">{data.total_documentos}</div>
            </div>
            <div className="rounded-md border border-border bg-surface-alt/40 px-2 py-1.5">
              <div className="text-text-muted">Productos distintos</div>
              <div className="font-semibold text-text-primary">{data.productos_resumen.length}</div>
            </div>
          </div>

          {data.productos_resumen.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-text-primary">Resumen — qué le compraste</h3>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-alt text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Producto</th>
                      <th className="py-2 px-3 text-right">Cantidad</th>
                      <th className="py-2 px-3 text-right">Veces</th>
                      <th className="py-2 px-3 text-right">Valor total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.productos_resumen.slice(0, 20).map((p, idx) => (
                      <tr key={p.cod_producto} className="border-b border-border/60">
                        <td className="py-2 px-3 text-xs text-text-muted">{idx + 1}</td>
                        <td className="py-2 px-3">
                          <div className="text-text-primary truncate max-w-md">{p.nom_producto}</div>
                          <div className="text-[0.6rem] text-text-muted">{p.cod_producto}</div>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums">
                          {p.cantidad_total.toLocaleString("es-CO", { maximumFractionDigits: 2 })}{" "}
                          <span className="text-xs text-text-muted">{p.unidad_medida ?? "u"}</span>
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums text-text-muted">
                          {p.veces_comprado}
                        </td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold">
                          {formatMoneyFull(p.valor_total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.productos_resumen.length > 20 && (
                  <p className="border-t border-border bg-surface-alt/40 px-3 py-1.5 text-center text-[0.65rem] text-text-muted">
                    Mostrando 20 de {data.productos_resumen.length}
                  </p>
                )}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-text-primary">
              Documentos individuales ({data.documentos.length})
            </h3>
            <div className="space-y-2">
              {data.documentos.map((d, idx) => (
                <details key={`${d.num_documento}-${idx}`} className="rounded-lg border border-border bg-surface">
                  <summary className="cursor-pointer px-3 py-2 hover:bg-surface-alt">
                    <span className="text-sm">
                      <strong>{d.fecha}</strong> · Factura {d.num_documento}
                      {d.cod_clase ? ` · ${d.cod_clase}` : ""}
                      <span className="ml-3 text-text-muted">— {d.num_items} prod</span>
                    </span>
                    <span className="float-right text-sm font-bold tabular-nums">
                      {formatMoneyFull(d.total_factura)}
                    </span>
                  </summary>
                  {d.items.length > 0 && (
                    <div className="border-t border-border overflow-x-auto">
                      <table className="w-full text-xs">
                        <tbody>
                          {d.items.map((it, i) => (
                            <tr key={`${it.cod_producto}-${i}`} className="border-t border-border/40">
                              <td className="py-1.5 px-3 truncate max-w-md">{it.nom_producto}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums">
                                {it.cantidad} {it.unidad_medida ?? "u"}
                              </td>
                              <td className="py-1.5 px-3 text-right tabular-nums">
                                {formatMoneyFull(it.valor_unitario)}
                              </td>
                              <td className="py-1.5 px-3 text-right tabular-nums font-semibold">
                                {formatMoneyFull(it.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </details>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
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
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-text-muted">
            Desde
            <input
              type="date"
              value={ini}
              max={fin}
              onChange={(e) => setIni(e.target.value)}
              className="mt-1 block rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-text-muted">
            Hasta
            <input
              type="date"
              value={fin}
              min={ini}
              max={today}
              onChange={(e) => setFin(e.target.value)}
              className="mt-1 block rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
            />
          </label>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar proveedor (nombre o NIT)..."
            className="flex-1 min-w-[200px] rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
          />
        </div>
      </Card>

      {isLoading && !data ? (
        <Card><Skeleton className="h-64 rounded-lg" /></Card>
      ) : !data || data.proveedores.length === 0 ? (
        <Card><p className="py-8 text-center text-sm text-text-muted">Sin compras en el rango seleccionado.</p></Card>
      ) : (
        <Card header={
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text-primary">
              {visibles.length} proveedor{visibles.length === 1 ? "" : "es"} en el rango
            </h2>
            <span className="text-sm font-semibold text-text-primary tabular-nums">
              Total: {formatMoneyFull(totalRango)}
            </span>
          </div>
        }>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
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
                    <td className="py-2 px-3 font-medium text-text-primary">{p.nombre}</td>
                    <td className="py-2 px-3 text-text-muted">{p.nit ?? "?"}</td>
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
  const [selectedProv, setSelectedProv] = useState<{ nit: string } | null>(null);
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
        <div className="overflow-x-auto">
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

      {selectedProv && data.fecha_primera_compra && data.fecha_ultima_compra && (
        <ProveedorDetalle
          nit={selectedProv.nit}
          fechaInicio={data.fecha_primera_compra}
          fechaFin={data.fecha_ultima_compra}
          contextoLabel="histórico completo"
          onClose={() => setSelectedProv(null)}
        />
      )}

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
                const canClick = !!p.nit;
                return (
                  <button
                    key={`${p.nit}-${idx}`}
                    type="button"
                    disabled={!canClick}
                    onClick={() => canClick && setSelectedProv({ nit: p.nit })}
                    className={`block w-full rounded-lg border border-border bg-surface px-3 py-2 text-left ${
                      canClick ? "hover:bg-surface-alt cursor-pointer" : "opacity-60 cursor-default"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">{p.nombre}</div>
                        <div className="text-[0.65rem] text-text-muted">
                          NIT {p.nit} · {p.num_documentos} doc ·{" "}
                          {p.primera_compra && p.ultima_compra ? `${p.primera_compra} → ${p.ultima_compra}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold tabular-nums">{formatMoneyFull(p.total_compras)}</div>
                      </div>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-alt">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, intensity * 100)}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card header={
          <div>
            <h2 className="font-semibold text-text-primary">Top 15 productos comprados (histórico)</h2>
            <p className="text-xs text-text-muted">click → ficha del producto</p>
          </div>
        }>
          {!data.top_productos || data.top_productos.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">Sin productos registrados.</p>
          ) : (
            <div className="overflow-x-auto">
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
          )}
        </Card>
      </div>
    </div>
  );
}
