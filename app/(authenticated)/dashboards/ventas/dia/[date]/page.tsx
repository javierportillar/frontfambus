"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useSalesDayDetail,
  useSalesDayInvoices,
  type DayInvoice,
  type InvoiceItem,
  type SalesDailyItem,
  type FormaPagoItem,
  type VendedorDayItem,
} from "@/lib/api/hooks";
import { formatMoney } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table } from "@/components/ui/Table";
import { Collapsible } from "@/components/ui/Collapsible";
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

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export default function DiaDetailPage(): JSX.Element {
  const params = useParams();
  const date = String(params.date ?? "");

  const detail = useSalesDayDetail(date || null);
  const invoices = useSalesDayInvoices(date || null);

  const [searchProducto, setSearchProducto] = useState("");
  const [filterFormaPago, setFilterFormaPago] = useState<string | null>(null);

  // Productos filtrados por busqueda
  const productosFiltrados = useMemo(() => {
    if (!detail.data) return [];
    const q = searchProducto.trim().toLowerCase();
    if (!q) return detail.data.productos_top;
    return detail.data.productos_top.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q),
    );
  }, [detail.data, searchProducto]);

  // Facturas filtradas por forma de pago
  const facturasFiltradas = useMemo(() => {
    if (!invoices.data) return [];
    if (!filterFormaPago) return invoices.data.invoices;
    return invoices.data.invoices.filter((inv) => inv.cod_formapago === filterFormaPago);
  }, [invoices.data, filterFormaPago]);

  if (!date) return <div className="p-4">Fecha no especificada.</div>;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/dashboards/ventas?month=${monthOf(date)}&tab=diaria`}
          className="text-sm text-accent hover:underline"
        >
          ← Volver al calendario
        </Link>
        <h1 className="mt-1 text-xl font-bold text-text-primary">
          Ventas del {formatDateLong(date)}
        </h1>
      </div>

      {detail.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : detail.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudieron cargar los detalles del día.
        </div>
      ) : detail.data ? (
        <DayContent
          detail={detail.data}
          invoices={invoices}
          productosFiltrados={productosFiltrados}
          facturasFiltradas={facturasFiltradas}
          searchProducto={searchProducto}
          setSearchProducto={setSearchProducto}
          filterFormaPago={filterFormaPago}
          setFilterFormaPago={setFilterFormaPago}
        />
      ) : null}
    </div>
  );
}

interface DayContentProps {
  detail: NonNullable<ReturnType<typeof useSalesDayDetail>["data"]>;
  invoices: ReturnType<typeof useSalesDayInvoices>;
  productosFiltrados: SalesDailyItem[];
  facturasFiltradas: DayInvoice[];
  searchProducto: string;
  setSearchProducto: (v: string) => void;
  filterFormaPago: string | null;
  setFilterFormaPago: (v: string | null) => void;
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
        <Card><Stat label="Ventas del día" value={formatMoney(detail.total_ventas)} subtitle={`${detail.total_facturas} facturas`} /></Card>
        <Card><Stat label="Ticket promedio" value={formatMoney(detail.ticket_promedio)} subtitle={`Max ${formatMoney(detail.ticket_mas_alto)}`} /></Card>
        <Card>
          <Stat
            label="Margen bruto"
            value={formatMoney(detail.margen_bruto)}
            subtitle={detail.margen_porcentaje !== null ? `${detail.margen_porcentaje.toFixed(1)}% del revenue` : "—"}
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
                formatter={(value) => formatMoney(Number(value))}
                labelFormatter={(h) => hourLabel(Number(h))}
                contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
              />
              <Bar dataKey="total_ventas" fill="var(--color-primary, #C83828)" name="Ventas" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* TODOS los productos vendidos — colapsable */}
      <Collapsible
        header={
          <div>
            <div className="text-sm font-semibold text-text-primary">Todos los productos vendidos</div>
            <div className="text-xs text-text-muted">{detail.productos_top.length} productos · ordenados de más vendido a menos</div>
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
          <div className="max-h-96 overflow-y-auto">
            <Table
              columns={[
                { header: "#", cell: (_: SalesDailyItem, idx?: number) => String((idx ?? 0) + 1), align: "right" },
                { header: "SKU", cell: (r: SalesDailyItem) => <span className="text-xs text-text-muted">{r.sku}</span> },
                { header: "Producto", cell: (r: SalesDailyItem) => <span className="text-xs">{r.nombre}</span> },
                { header: "Cant.", cell: (r: SalesDailyItem) => r.cantidad.toString(), align: "right" },
                { header: "Valor", cell: (r: SalesDailyItem) => <span className="font-medium">{formatMoney(r.valor)}</span>, align: "right" },
              ]}
              data={productosFiltrados}
              keyFn={(r: SalesDailyItem, idx?: number) => `${r.sku}-${idx ?? 0}`}
              striped
            />
          </div>
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
                <InvoiceCard key={`${inv.cod_clase}-${inv.num_documento}`} invoice={inv} />
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
                { header: "Ventas", cell: (r: VendedorDayItem) => formatMoney(r.total_ventas), align: "right" },
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
                  <div className="mt-1 text-base font-semibold text-text-primary">{formatMoney(c.total_ventas)}</div>
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

/**
 * Card de una factura: header con resumen colapsable, body con detalle de items.
 */
function InvoiceCard({ invoice }: { invoice: DayInvoice }): JSX.Element {
  return (
    <Collapsible
      className="bg-surface-alt/30"
      header={
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-semibold text-text-primary">
            {invoice.prefijo ?? ""}-{invoice.num_documento}
          </span>
          <span className="text-xs text-text-muted">{invoice.hora}</span>
          <span className="text-xs text-text-secondary truncate max-w-[180px]">{invoice.cliente}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[10px] text-text-secondary">
            {invoice.nombre_formapago}
          </span>
          <span className="ml-auto text-sm font-bold text-text-primary">
            {formatMoney(invoice.total)}
          </span>
        </div>
      }
      badge={`${invoice.items.length} item${invoice.items.length === 1 ? "" : "s"}`}
    >
      <div className="mb-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        <div><span className="text-text-muted">Vendedor:</span> <strong>{invoice.vendedor}</strong></div>
        <div><span className="text-text-muted">Subtotal:</span> <strong>{formatMoney(invoice.subtotal)}</strong></div>
        <div><span className="text-text-muted">Descuento:</span> <strong>{formatMoney(invoice.total_descuentos)}</strong></div>
        <div><span className="text-text-muted">IVA:</span> <strong>{formatMoney(invoice.total_iva)}</strong></div>
      </div>
      <Table
        columns={[
          { header: "SKU", cell: (r: InvoiceItem) => <span className="text-xs text-text-muted">{r.cod_producto}</span> },
          { header: "Producto", cell: (r: InvoiceItem) => <span className="text-xs">{r.nombre}</span> },
          { header: "Cant.", cell: (r: InvoiceItem) => r.cantidad.toString(), align: "right" },
          { header: "P. Unit.", cell: (r: InvoiceItem) => formatMoney(r.valor_unitario), align: "right" },
          { header: "Dcto", cell: (r: InvoiceItem) => (r.descuento_valor > 0 ? formatMoney(r.descuento_valor) : "—"), align: "right" },
          { header: "Total", cell: (r: InvoiceItem) => <span className="font-semibold">{formatMoney(r.total_detalle)}</span>, align: "right" },
        ]}
        data={invoice.items}
        keyFn={(r: InvoiceItem) => `${r.num_item}-${r.cod_producto}`}
        striped
      />
    </Collapsible>
  );
}
