"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSalesDayDetail, useSalesDayInvoices, useProductAbcMap, type DayInvoice, type InvoiceItem, type SalesDailyItem, type FormaPagoItem, type VendedorDayItem, type ProductAbcMap } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table } from "@/components/ui/Table";
import { Collapsible } from "@/components/ui/Collapsible";
import { AbcChip } from "@/components/productos/Chips";
import { ProductosVendidosTabla } from "@/components/ventas/ProductosVendidosTabla";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const PAY_COLORS = ["#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#84CC16", "#6B7280"];

function formatDateLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${dayNames[d.getDay()]}, ${d.getDate()} de ${monthNames[d.getMonth()]} de ${d.getFullYear()}`;
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export interface DayDetailContentProps {
  date: string;
}

export function DayDetailContent({ date }: DayDetailContentProps): JSX.Element {
  const router = useRouter();
  const detail = useSalesDayDetail(date || null);
  const invoices = useSalesDayInvoices(date || null);
  const abcMap = useProductAbcMap(180);

  const [searchProducto, setSearchProducto] = useState("");
  const [filterFormaPago, setFilterFormaPago] = useState<string | null>(null);

  const productosFiltrados = useMemo(() => {
    if (!detail.data) return [];
    const q = searchProducto.trim().toLowerCase();
    if (!q) return detail.data.productos_top;
    return detail.data.productos_top.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [detail.data, searchProducto]);

  const facturasFiltradas = useMemo(() => {
    if (!invoices.data) return [];
    if (!filterFormaPago) return invoices.data.invoices;
    return invoices.data.invoices.filter((inv) => inv.cod_formapago === filterFormaPago);
  }, [invoices.data, filterFormaPago]);

  if (!date) {
    return <div className="rounded-lg border border-dashed border-border bg-surface-alt p-8 text-center text-sm text-text-muted">Seleccioná un día para ver el detalle.</div>;
  }

  if (detail.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }

  if (detail.error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        No se pudieron cargar los detalles del día.
      </div>
    );
  }

  if (!detail.data) return <DayDetailSkeleton />;

  return (
    <DayContent
      detail={detail.data}
      invoices={invoices}
      productosFiltrados={productosFiltrados}
      facturasFiltradas={facturasFiltradas}
      searchProducto={searchProducto}
      setSearchProducto={setSearchProducto}
      filterFormaPago={filterFormaPago}
      setFilterFormaPago={setFilterFormaPago}
      abcMap={abcMap.data}
      onProductClick={(sku) => router.push(`/dashboards/productos/${encodeURIComponent(sku)}`)}
    />
  );
}

function DayDetailSkeleton(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

// ── DayContent (inner) ──────────────────────────────────────────────────

interface DayContentProps {
  detail: NonNullable<ReturnType<typeof useSalesDayDetail>["data"]>;
  invoices: ReturnType<typeof useSalesDayInvoices>;
  productosFiltrados: SalesDailyItem[];
  facturasFiltradas: DayInvoice[];
  searchProducto: string;
  setSearchProducto: (v: string) => void;
  filterFormaPago: string | null;
  setFilterFormaPago: (v: string | null) => void;
  abcMap?: ProductAbcMap;
  onProductClick: (sku: string) => void;
}

function DayContent({
  detail,
  invoices,
  productosFiltrados,
  facturasFiltradas,
  searchProducto,
  setSearchProducto,
  filterFormaPago,
  setFilterFormaPago,
  abcMap,
  onProductClick,
}: DayContentProps): JSX.Element {
  const hourPico = detail.hora_pico !== null ? hourLabel(detail.hora_pico) : "—";
  const ventasHoraPico = detail.hora_pico !== null
    ? detail.distribucion_horaria.find((h) => h.hour === detail.hora_pico)?.total_ventas ?? 0
    : 0;
  const pctHoraPico = detail.total_ventas > 0 ? (ventasHoraPico / detail.total_ventas) * 100 : 0;

  return (
    <>
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><Stat label="Ventas del día" value={formatMoneyFull(detail.total_ventas)} subtitle={`${detail.total_facturas} facturas`} /></Card>
        <Card><Stat label="Ticket promedio" value={formatMoneyFull(detail.ticket_promedio)} subtitle={`Max ${formatMoneyFull(detail.ticket_mas_alto)}`} /></Card>
        <Card>
          <Stat
            label="Ganancia del día"
            value={formatMoneyFull(detail.margen_bruto)}
            subtitle={detail.margen_porcentaje !== null ? `${detail.margen_porcentaje.toFixed(1)}% de margen` : "venta − costo"}
          />
        </Card>
        <Card><Stat label="Ítems por factura" value={detail.items_por_factura.toFixed(1)} subtitle={`Hora pico ${hourPico}`} /></Card>
      </div>

      {/* Insight box hora pico */}
      {detail.hora_pico !== null && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span className="font-semibold text-primary">Tu pico fue {hourPico}</span>
          <span className="text-text-secondary"> — {pctHoraPico.toFixed(0)}% del día se vendió en esa hora.</span>
        </div>
      )}

      {/* Distribución horaria */}
      <Card header={<h3 className="font-semibold text-text-primary">Distribución por hora</h3>}>
        {detail.distribucion_horaria.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">Sin registros de hora en este día.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={detail.distribucion_horaria}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tickFormatter={(h: number) => hourLabel(h)} tick={{ fontSize: 10 }} stroke="#a3a3a3" />
              <YAxis tick={{ fontSize: 10 }} stroke="#a3a3a3" tickFormatter={(v: number) => `$${(v / 1e6).toFixed(1)}M`} />
              <Tooltip
                formatter={(value) => formatMoneyFull(Number(value))}
                labelFormatter={(h) => hourLabel(Number(h))}
                contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
              />
              <Bar dataKey="total_ventas" fill="var(--color-primary, #C83828)" name="Ventas" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* V1.13: TODOS los productos vendidos del día — sortable + buscable */}
      <Collapsible
        header={
          <div>
            <div className="text-sm font-semibold text-text-primary">Productos vendidos del día</div>
            <div className="text-xs text-text-muted">{detail.productos_top.length} productos · ordenable por columnas</div>
          </div>
        }
        badge={`${detail.productos_top.length} productos`}
      >
        <input
          type="search"
          value={searchProducto}
          onChange={(e) => setSearchProducto(e.target.value)}
          placeholder="Buscar producto o SKU…"
          className="mb-3 block w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        {productosFiltrados.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-muted">Sin resultados.</p>
        ) : (
          <ProductosVendidosTabla
            productos={productosFiltrados}
            abcMap={abcMap}
            initialLimit={10}
            isFullDataset={true}
          />
        )}
      </Collapsible>

      {/* Facturas del día con sus items — todas colapsables */}
      <Collapsible
        header={
          <div>
            <div className="text-sm font-semibold text-text-primary">Facturas del día con sus productos</div>
            <div className="text-xs text-text-muted">
              {invoices.data ? `${invoices.data.total_facturas} facturas · ${invoices.data.total_items} items` : "cargando…"}
            </div>
          </div>
        }
        badge={invoices.data ? `${invoices.data.total_facturas}` : ""}
        defaultOpen
      >
        {invoices.isLoading ? (
          <Skeleton className="h-32 rounded-lg" />
        ) : invoices.error ? (
          <p className="py-4 text-sm text-red-600 text-center">No se pudieron cargar las facturas.</p>
        ) : invoices.data && invoices.data.invoices.length > 0 ? (
          <>
            {/* Filtro por forma de pago */}
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-text-muted">Filtrar por forma de pago:</span>
              {Array.from(new Set(invoices.data.invoices.map((i) => i.cod_formapago))).map((cod) => {
                const label = invoices.data!.invoices.find((i) => i.cod_formapago === cod)?.nombre_formapago ?? cod;
                const active = filterFormaPago === cod;
                return (
                  <button
                    key={cod}
                    type="button"
                    onClick={() => setFilterFormaPago(active ? null : cod)}
                    className={`rounded-full border px-2.5 py-1 transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-text-secondary hover:bg-surface-alt"}`}
                  >
                    {label}
                  </button>
                );
              })}
              {filterFormaPago && (
                <button type="button" onClick={() => setFilterFormaPago(null)} className="text-primary underline">
                  Quitar filtro
                </button>
              )}
              <span className="ml-auto text-text-muted">
                {facturasFiltradas.length} de {invoices.data.invoices.length}
              </span>
            </div>

            <div className="space-y-2">
              {facturasFiltradas.map((inv) => (
                <InvoiceCard key={`${inv.cod_clase}-${inv.num_documento}`} invoice={inv} abcMap={abcMap} onProductClick={onProductClick} />
              ))}
            </div>
          </>
        ) : (
          <p className="py-4 text-center text-sm text-text-muted">Sin facturas en este día.</p>
        )}
      </Collapsible>

      {/* Vendedores + Formas de pago + Comparativas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Vendedores */}
        <Collapsible
          header={<div className="text-sm font-semibold text-text-primary">Vendedores del día</div>}
          badge={`${detail.vendedores_top.length}`}
        >
          {detail.vendedores_top.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-muted">Sin datos de vendedor.</p>
          ) : (
            <Table
              columns={[
                { header: "#", cell: (_: VendedorDayItem, idx?: number) => String((idx ?? 0) + 1), align: "right" },
                { header: "Vendedor", cell: (r: VendedorDayItem) => <span className="text-xs">{r.nombre_vendedor}</span> },
                { header: "Ventas", cell: (r: VendedorDayItem) => formatMoneyFull(r.total_ventas), align: "right" },
                { header: "Fact.", cell: (r: VendedorDayItem) => r.num_facturas.toString(), align: "right" },
                { header: "%", cell: (r: VendedorDayItem) => (r.porcentaje !== null ? `${r.porcentaje.toFixed(1)}%` : "—"), align: "right" },
              ]}
              data={detail.vendedores_top}
              keyFn={(r: VendedorDayItem, idx?: number) => `${r.nit_vendedor ?? ""}-${idx ?? 0}`}
              striped
            />
          )}
        </Collapsible>

        {/* Forma de pago */}
        <Collapsible
          header={<div className="text-sm font-semibold text-text-primary">Forma de pago</div>}
          badge={`${detail.formas_pago.length}`}
        >
          {detail.formas_pago.length === 0 ? (
            <p className="py-4 text-center text-sm text-text-muted">Sin datos.</p>
          ) : (
            <div className="flex items-center gap-4">
              <div style={{ width: 130, height: 130 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={detail.formas_pago} dataKey="total_ventas" nameKey="nombre" cx="50%" cy="50%" outerRadius={55} innerRadius={28} paddingAngle={2}>
                      {detail.formas_pago.map((_, idx) => (
                        <Cell key={idx} fill={PAY_COLORS[idx % PAY_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-1.5 text-xs">
                {detail.formas_pago.map((f: FormaPagoItem, idx: number) => (
                  <li key={f.cod_formapago} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PAY_COLORS[idx % PAY_COLORS.length] }} />
                    <span className="flex-1 truncate text-text-secondary">{f.nombre}</span>
                    <span className="font-semibold text-text-primary">{f.porcentaje.toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Collapsible>
      </div>

      {/* Comparativas */}
      {detail.comparativas.length > 0 && (
        <Card header={<h3 className="font-semibold text-text-primary">Comparativa</h3>}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {detail.comparativas.map((c) => {
              const positive = c.delta_porcentaje !== null && c.delta_porcentaje > 0;
              const negative = c.delta_porcentaje !== null && c.delta_porcentaje < 0;
              return (
                <div key={c.label} className="rounded-lg border border-border bg-surface-alt/40 px-3 py-2">
                  <div className="text-xs text-text-muted capitalize">{c.label}</div>
                  <div className="text-[10px] text-text-muted">{c.fecha_comparada}</div>
                  <div className="mt-1 text-base font-semibold text-text-primary">{formatMoneyFull(c.total_ventas)}</div>
                  <div className={`text-xs font-medium ${positive ? "text-green-600" : negative ? "text-red-600" : "text-text-muted"}`}>
                    {c.delta_porcentaje === null ? "—" : `${positive ? "+" : ""}${c.delta_porcentaje.toFixed(1)}%`}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
}

// ── InvoiceCard ─────────────────────────────────────────────────────────

export function InvoiceCard({
  invoice, abcMap, onProductClick,
}: {
  invoice: DayInvoice;
  abcMap?: ProductAbcMap;
  onProductClick?: (sku: string) => void;
}): JSX.Element {
  return (
    <Collapsible
      className="bg-surface-alt/30"
      header={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-semibold text-text-primary">
            {invoice.prefijo ?? ""}-{invoice.num_documento}
          </span>
          <span className="text-xs text-text-muted">{invoice.hora}</span>
          <span className="text-xs text-text-secondary truncate max-w-[160px]">{invoice.cliente}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10px] text-text-secondary">
            {invoice.nombre_formapago}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {invoice.ganancia !== null && (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                gana {formatMoneyFull(invoice.ganancia)}
              </span>
            )}
            <span className="text-sm font-bold text-text-primary">{formatMoneyFull(invoice.total)}</span>
          </span>
        </div>
      }
      badge={`${invoice.items.length} item${invoice.items.length === 1 ? "" : "s"}`}
    >
      <div className="mb-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
        <div><span className="text-text-muted">Vendedor:</span> <strong>{invoice.vendedor}</strong></div>
        <div><span className="text-text-muted">Subtotal:</span> <strong>{formatMoneyFull(invoice.subtotal)}</strong></div>
        <div><span className="text-text-muted">Costo:</span> <strong>{invoice.costo_total > 0 ? formatMoneyFull(invoice.costo_total) : "—"}</strong></div>
        <div><span className="text-text-muted">Ganancia:</span> <strong className="text-green-700">{invoice.ganancia !== null ? formatMoneyFull(invoice.ganancia) : "—"}</strong></div>
        <div><span className="text-text-muted">Margen:</span> <strong>{invoice.margen_pct !== null ? `${invoice.margen_pct}%` : "—"}</strong></div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[0.65rem] uppercase tracking-wide text-text-muted">
              <th className="py-1 pr-1 text-center">Tipo</th>
              <th className="px-1">Producto</th>
              <th className="px-1 text-right">Cant.</th>
              <th className="px-1 text-right">Se compró</th>
              <th className="px-1 text-right">Se vendió</th>
              <th className="px-1 text-right">Ganancia</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((r: InvoiceItem) => {
              const abc = abcMap?.productos[r.cod_producto]?.abc;
              return (
                <tr key={`${r.num_item}-${r.cod_producto}`} className="border-b border-border/40">
                  <td className="py-1 pr-1 text-center">{abc ? <AbcChip abc={abc} /> : <span className="text-text-muted">—</span>}</td>
                  <td className="px-1">
                    <button
                      type="button"
                      onClick={() => onProductClick?.(r.cod_producto)}
                      className="text-left text-text-primary hover:text-primary hover:underline"
                    >
                      {r.nombre}
                      <span className="block text-[0.6rem] text-text-muted">{r.cod_producto}</span>
                    </button>
                  </td>
                  <td className="px-1 text-right tabular-nums">{r.cantidad.toLocaleString("es-CO")}</td>
                  <td className="px-1 text-right tabular-nums text-text-secondary">{r.costo_total > 0 ? formatMoneyFull(r.costo_total) : "—"}</td>
                  <td className="px-1 text-right tabular-nums font-medium">{formatMoneyFull(r.total_detalle)}</td>
                  <td className="px-1 text-right tabular-nums">
                    {r.ganancia !== null ? (
                      <span className="text-green-700 font-semibold">{formatMoneyFull(r.ganancia)}<span className="block text-[0.6rem] font-normal text-text-muted">{r.margen_pct}%</span></span>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Collapsible>
  );
}
