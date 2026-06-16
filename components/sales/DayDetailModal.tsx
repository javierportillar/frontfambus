"use client";

import { Modal } from "@/components/ui/Modal";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table } from "@/components/ui/Table";
import { useSalesDayDetail, type SalesHourBucket, type SalesDailyItem, type VendedorDayItem, type FormaPagoItem } from "@/lib/api/hooks";
import { formatMoney } from "@/lib/format/currency";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

interface DayDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string | null;
}

function formatDateLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${dayNames[d.getDay()]}, ${d.getDate()} de ${monthNames[d.getMonth()]} de ${d.getFullYear()}`;
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

// Paleta para forma de pago (independiente del tema del tenant)
const PAY_COLORS = ["#0EA5E9", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#84CC16", "#6B7280"];

export function DayDetailModal({ isOpen, onClose, date }: DayDetailModalProps): JSX.Element {
  const { data, error, isLoading } = useSalesDayDetail(isOpen ? date : null);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={date ? formatDateLong(date) : "Detalle del día"} maxWidth="max-w-5xl">
      {!date ? null : isLoading ? (
        <DayDetailSkeleton />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudieron cargar los detalles del día.
        </div>
      ) : data ? (
        <DayDetailContent data={data} />
      ) : null}
    </Modal>
  );
}

function DayDetailSkeleton(): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  );
}

function DayDetailContent({ data }: { data: NonNullable<ReturnType<typeof useSalesDayDetail>["data"]> }): JSX.Element {
  const hourPico = data.hora_pico !== null ? hourLabel(data.hora_pico) : "—";
  const ventasHoraPico = data.hora_pico !== null
    ? data.distribucion_horaria.find((h) => h.hour === data.hora_pico)?.total_ventas ?? 0
    : 0;
  const pctHoraPico = data.total_ventas > 0 ? (ventasHoraPico / data.total_ventas) * 100 : 0;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ventas del día" value={formatMoney(data.total_ventas)} subtitle={`${data.total_facturas} facturas`} />
        <Stat label="Ticket promedio" value={formatMoney(data.ticket_promedio)} subtitle={`Max ${formatMoney(data.ticket_mas_alto)}`} />
        <Stat
          label="Margen bruto"
          value={formatMoney(data.margen_bruto)}
          subtitle={data.margen_porcentaje !== null ? `${data.margen_porcentaje.toFixed(1)}% del revenue` : "—"}
        />
        <Stat label="Ítems por factura" value={data.items_por_factura.toFixed(1)} subtitle={`Hora pico ${hourPico}`} />
      </div>

      {/* Insight box hora pico */}
      {data.hora_pico !== null && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span className="font-semibold text-primary">Tu pico fue {hourPico}</span>
          <span className="text-text-secondary"> — {pctHoraPico.toFixed(0)}% del día se vendió en esa hora.</span>
        </div>
      )}

      {/* Distribución horaria */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-text-primary">Distribución por hora</h3>
        <div className="rounded-xl border border-border bg-white p-3">
          {data.distribucion_horaria.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">Sin registros de hora en este día.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.distribucion_horaria}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="hour"
                  tickFormatter={(h: number) => hourLabel(h)}
                  tick={{ fontSize: 10 }}
                  stroke="#a3a3a3"
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="#a3a3a3"
                  tickFormatter={(v: number) => `$${(v / 1e6).toFixed(1)}M`}
                />
                <Tooltip
                  formatter={(value) => formatMoney(Number(value))}
                  labelFormatter={(h) => hourLabel(Number(h))}
                  contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
                />
                <Bar dataKey="total_ventas" fill="var(--color-primary, #C83828)" name="Ventas" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Productos top + Vendedores top en 2 cols */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-text-primary">
            Productos más vendidos <span className="text-text-muted font-normal">(top 15)</span>
          </h3>
          <div className="rounded-xl border border-border bg-white p-2 max-h-80 overflow-y-auto">
            <Table
              columns={[
                { header: "#", cell: (_: SalesDailyItem, idx?: number) => String((idx ?? 0) + 1), align: "right" },
                { header: "Producto", cell: (r: SalesDailyItem) => <span className="text-xs">{r.nombre}</span> },
                { header: "Qty", cell: (r: SalesDailyItem) => r.cantidad.toString(), align: "right" },
                { header: "Valor", cell: (r: SalesDailyItem) => <span className="font-medium">{formatMoney(r.valor)}</span>, align: "right" },
              ]}
              data={data.productos_top.slice(0, 15)}
              keyFn={(r: SalesDailyItem) => r.sku}
              striped
            />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-text-primary">
            Vendedores <span className="text-text-muted font-normal">(top 5)</span>
          </h3>
          <div className="rounded-xl border border-border bg-white p-2 max-h-80 overflow-y-auto">
            {data.vendedores_top.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-text-muted">Sin datos de vendedor.</p>
            ) : (
              <Table
                columns={[
                  { header: "Vendedor", cell: (r: VendedorDayItem) => <span className="text-xs">{r.nombre_vendedor}</span> },
                  { header: "Ventas", cell: (r: VendedorDayItem) => formatMoney(r.total_ventas), align: "right" },
                  { header: "Fact.", cell: (r: VendedorDayItem) => r.num_facturas.toString(), align: "right" },
                  { header: "%", cell: (r: VendedorDayItem) => (r.porcentaje !== null ? `${r.porcentaje.toFixed(1)}%` : "—"), align: "right" },
                ]}
                data={data.vendedores_top.slice(0, 5)}
                keyFn={(r: VendedorDayItem, idx?: number) => `${r.nit_vendedor ?? ""}-${idx ?? 0}`}
                striped
              />
            )}
          </div>
        </section>
      </div>

      {/* Forma de pago + Comparativas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-semibold text-text-primary">Forma de pago</h3>
          <div className="rounded-xl border border-border bg-white p-3">
            {data.formas_pago.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-muted">Sin datos de pago.</p>
            ) : (
              <div className="flex items-center gap-4">
                <div style={{ width: 140, height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.formas_pago}
                        dataKey="total_ventas"
                        nameKey="nombre"
                        cx="50%"
                        cy="50%"
                        outerRadius={60}
                        innerRadius={30}
                        paddingAngle={2}
                      >
                        {data.formas_pago.map((_, idx) => (
                          <Cell key={idx} fill={PAY_COLORS[idx % PAY_COLORS.length]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="flex-1 space-y-1.5 text-xs">
                  {data.formas_pago.map((f, idx) => (
                    <li key={f.cod_formapago} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PAY_COLORS[idx % PAY_COLORS.length] }} />
                      <span className="flex-1 truncate text-text-secondary">{f.nombre}</span>
                      <span className="font-semibold text-text-primary">{f.porcentaje.toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-text-primary">Comparativa</h3>
          <div className="rounded-xl border border-border bg-white p-3 space-y-2">
            {data.comparativas.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-muted">No hay periodos previos para comparar.</p>
            ) : (
              data.comparativas.map((c) => {
                const positive = c.delta_porcentaje !== null && c.delta_porcentaje > 0;
                const negative = c.delta_porcentaje !== null && c.delta_porcentaje < 0;
                return (
                  <div key={c.label} className="flex items-center justify-between border-b border-border last:border-b-0 pb-2 last:pb-0">
                    <div>
                      <div className="text-xs font-semibold text-text-secondary capitalize">{c.label}</div>
                      <div className="text-[10px] text-text-muted">{c.fecha_comparada}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-text-primary">{formatMoney(c.total_ventas)}</div>
                      <div className={`text-[11px] font-medium ${positive ? "text-green-600" : negative ? "text-red-600" : "text-text-muted"}`}>
                        {c.delta_porcentaje === null ? "—" : `${positive ? "+" : ""}${c.delta_porcentaje.toFixed(1)}%`}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
