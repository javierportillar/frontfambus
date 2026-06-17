"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useProductDetail, type ProductMovimiento, type ProductTimelineMonth } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { diasStockLabel, estadoCfg, accionCfg } from "@/lib/productos/display";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import { EstadoChip, AbcChip } from "@/components/productos/Chips";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

function monthLabel(yyyymm: string): string {
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const [y, m] = yyyymm.split("-");
  return `${months[Number(m) - 1] ?? m} ${String(y).slice(2)}`;
}

export default function ProductDetailPage(): JSX.Element {
  const params = useParams();
  const search = useSearchParams();
  const sku = decodeURIComponent(String(params.sku ?? ""));
  const window = Number(search.get("window") ?? 180);

  const { data, isLoading } = useProductDetail(sku || null, window);

  return (
    <div className="space-y-4">
      <Link href="/dashboards/productos" className="text-sm text-accent hover:underline">← Volver a productos</Link>

      {isLoading && !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : data && data.found && data.metrics ? (
        <Detail data={data} window={window} />
      ) : (
        <Card><p className="py-12 text-center text-sm text-text-muted">Producto no encontrado.</p></Card>
      )}
    </div>
  );
}

function Detail({ data, window }: { data: NonNullable<ReturnType<typeof useProductDetail>["data"]>; window: number }): JSX.Element {
  const m = data.metrics!;
  const estado = estadoCfg(m.estado);
  const accion = accionCfg(m.accion);

  const timeline = (data.timeline ?? []).map((t: ProductTimelineMonth) => ({
    mes: monthLabel(t.mes),
    vendido: t.unidades_vendidas,
    comprado: t.unidades_compradas,
  }));

  return (
    <>
      {/* Encabezado */}
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3">
          <AbcChip abc={m.abc} />
          <div>
            <h1 className="text-xl font-bold text-text-primary leading-tight">{m.nombre}</h1>
            <p className="text-sm text-text-muted">
              {m.cod_producto}
              {m.rank_rev ? ` · #${m.rank_rev} en ventas (${m.pct_revenue.toFixed(1)}% del total)` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <EstadoChip estado={m.estado} />
          {m.accion !== "n/a" && (
            <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold" style={{ color: accion.color, background: accion.bg }}>
              {accion.label}
            </span>
          )}
        </div>
      </div>

      {/* Banner de recomendación */}
      <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: `${estado.color}40`, background: `${estado.color}0d` }}>
        <span className="font-semibold" style={{ color: estado.color }}>{estado.label}.</span>{" "}
        <span className="text-text-secondary">{recomendacion(m)}</span>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><Stat label="Stock actual" value={m.cantidad_actual.toLocaleString("es-CO")} subtitle="unidades (compras − ventas)" /></Card>
        <Card><Stat label="Valor en inventario" value={formatMoneyFull(m.valor_inventario)} subtitle={`costo ${formatMoneyFull(m.costo_unit)}/u`} /></Card>
        <Card><Stat label="Velocidad" value={`${m.velocidad_mensual}/mes`} subtitle={`${m.unidades_win.toLocaleString("es-CO")} u en ${window} días`} /></Card>
        <Card><Stat label="Días de stock" value={diasStockLabel(m.dias_stock)} subtitle={m.rotacion_anual ? `rota ${m.rotacion_anual}× al año` : "sin rotación"} /></Card>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><Stat label="Vendido en el período" value={formatMoneyFull(m.revenue_win)} subtitle={`${m.pct_revenue.toFixed(1)}% del total`} /></Card>
        <Card><Stat label="Margen" value={formatMoneyFull(m.margen_win)} subtitle={m.margen_pct !== null ? `${m.margen_pct}% sobre ventas` : "—"} /></Card>
        <Card><Stat label="Precio de venta" value={formatMoneyFull(m.precio)} subtitle={m.costo_unit > 0 ? `margen unit. ${formatMoneyFull(m.precio - m.costo_unit)}` : ""} /></Card>
        <Card><Stat label="Proveedor" value={m.proveedor ?? "—"} subtitle={m.ultima_compra ? `última compra ${m.ultima_compra}` : "sin compras"} /></Card>
      </div>

      {/* Timeline compras vs ventas */}
      <Card header={<h2 className="font-semibold text-text-primary">Movimiento mensual — compras vs ventas</h2>}>
        {timeline.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">Sin movimientos registrados.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} stroke="#a3a3a3" />
              <YAxis tick={{ fontSize: 10 }} stroke="#a3a3a3" />
              <Tooltip
                formatter={(v, name) => [`${Number(v)} u`, name === "vendido" ? "Vendido" : "Comprado"]}
                contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} formatter={(v: string) => (v === "vendido" ? "Vendido" : "Comprado")} />
              <Bar dataKey="comprado" fill="#0EA5E9" radius={[3, 3, 0, 0]} name="comprado" />
              <Line type="monotone" dataKey="vendido" stroke="var(--color-primary, #C83828)" strokeWidth={2} dot={{ r: 2 }} name="vendido" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        <p className="mt-1 text-[0.65rem] text-text-muted">
          Las barras azules son lo que compraste al proveedor; la línea roja, lo que vendiste. Si la línea está siempre arriba de las barras, te estás quedando corto de stock.
        </p>
      </Card>

      {/* Datos de venta / fechas */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card header={<h3 className="font-semibold text-text-primary">Fechas clave</h3>}>
          <dl className="space-y-2 text-sm">
            <Row label="Última venta" value={m.ultima_venta ?? "Nunca"} extra={m.dias_sin_venta !== null ? `hace ${m.dias_sin_venta} días` : ""} />
            <Row label="Última compra" value={m.ultima_compra ?? "Nunca"} extra={m.dias_sin_compra !== null ? `hace ${m.dias_sin_compra} días` : ""} />
            <Row label="Categoría ABC" value={m.abc === "sin_venta" ? "Sin ventas" : `Categoría ${m.abc}`} extra={m.rank_rev ? `puesto #${m.rank_rev}` : ""} />
            <Row label="Rotación anual" value={m.rotacion_anual ? `${m.rotacion_anual} veces/año` : "—"} extra="" />
          </dl>
        </Card>

        <Card header={<h3 className="font-semibold text-text-primary">Últimos movimientos</h3>}>
          {data.movimientos && data.movimientos.length > 0 ? (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <tbody>
                  {data.movimientos.map((mv: ProductMovimiento, i: number) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1.5 text-text-muted">{mv.fecha}</td>
                      <td className="py-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${mv.tipo === "venta" ? "bg-primary/10 text-primary" : "bg-sky-100 text-sky-700"}`}>
                          {mv.tipo === "venta" ? "Venta" : "Compra"}
                        </span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{mv.cantidad} u</td>
                      <td className="py-1.5 text-right tabular-nums font-medium">{formatMoneyFull(mv.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-text-muted">Sin movimientos.</p>
          )}
        </Card>
      </div>
    </>
  );
}

function Row({ label, value, extra }: { label: string; value: string; extra: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between border-b border-border/50 pb-1.5 last:border-b-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-right">
        <span className="font-medium text-text-primary">{value}</span>
        {extra && <span className="ml-2 text-[0.7rem] text-text-muted">{extra}</span>}
      </dd>
    </div>
  );
}

/** Recomendación en lenguaje de gerente según el estado del producto. */
function recomendacion(m: NonNullable<ReturnType<typeof useProductDetail>["data"]>["metrics"]): string {
  if (!m) return "";
  switch (m.estado) {
    case "quiebre":
      return `Se te acaba en ${diasStockLabel(m.dias_stock)} y vende ${m.velocidad_mensual}/mes. Pedile al proveedor ya${m.proveedor ? ` (${m.proveedor})` : ""}.`;
    case "agotado":
      return `Estás en cero pero sigue vendiendo (${m.unidades_win} u en el período). Reabastecé para no perder ventas.`;
    case "sobrestock":
      return `Tenés ${diasStockLabel(m.dias_stock)} de stock — demasiado. Frená las compras y considerá una promo para liberar el capital de ${formatMoneyFull(m.valor_inventario)}.`;
    case "dormido":
      return `No se vende hace ${m.dias_sin_venta} días pero tenés ${formatMoneyFull(m.valor_inventario)} parados. Liquidá o devolvé al proveedor.`;
    case "sin_stock":
      return "Sin stock y sin movimiento. Revisá si vale la pena seguir manejándolo.";
    case "sin_movimiento":
      return "Tiene stock pero no vendió en el período. Revisá precio o ubicación, o discontinualo.";
    case "servicio":
      return "Es un servicio, no un producto inventariable. No aplica control de stock.";
    default:
      return `Rota ${m.rotacion_anual ?? "—"}× al año con ${diasStockLabel(m.dias_stock)} de stock. Todo en orden.`;
  }
}
