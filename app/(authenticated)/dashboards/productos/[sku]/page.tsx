"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  const router = useRouter();
  const sku = decodeURIComponent(String(params.sku ?? ""));
  const windowDays = Number(search.get("window") ?? 180);

  const { data, isLoading } = useProductDetail(sku || null, windowDays);

  function handleBack(): void {
    // Si hay historial previo, volver a la página de origen (Ventas, Análisis, etc.)
    // Si no (ej. bookmark o pestaña nueva), ir a la lista de productos.
    if (globalThis.window.history.length > 1) {
      router.back();
    } else {
      router.push("/dashboards/productos");
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleBack}
        className="text-sm text-accent hover:underline cursor-pointer"
      >
        ← Volver
      </button>

      {isLoading && !data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : data && data.found && data.metrics ? (
        <Detail data={data} window={windowDays} />
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

  // Timeline base con comprado/vendido por mes
  const timelineBase = (data.timeline ?? []).map((t: ProductTimelineMonth) => ({
    mes: monthLabel(t.mes),
    vendido: t.unidades_vendidas,
    comprado: t.unidades_compradas,
    neto: t.unidades_compradas - t.unidades_vendidas,
  }));

  // Stock acumulado: el último mes cierra con cantidad_actual; vamos hacia atrás restando el neto.
  // stock_fin_mes_(i-1) = stock_fin_mes_i - neto_mes_i
  const timeline = (() => {
    if (timelineBase.length === 0) return [];
    const closing: number[] = new Array(timelineBase.length).fill(0);
    closing[timelineBase.length - 1] = m.cantidad_actual;
    for (let i = timelineBase.length - 2; i >= 0; i--) {
      const baseItem = timelineBase[i + 1];
      const closeNext = closing[i + 1];
      if (baseItem !== undefined && closeNext !== undefined) {
        closing[i] = closeNext - baseItem.neto;
      }
    }
    return timelineBase.map((row, i) => ({
      ...row,
      stock: Math.max(0, closing[i] ?? 0),
    }));
  })();

  // Métricas derivadas para "Fechas clave"
  const diasPorRotacion = m.rotacion_anual && m.rotacion_anual > 0 ? Math.round(365 / m.rotacion_anual) : null;
  const ultimoMes = timelineBase[timelineBase.length - 1];
  const promedioVentaMensual = timelineBase.length > 0
    ? timelineBase.reduce((acc, r) => acc + r.vendido, 0) / timelineBase.length
    : 0;
  const tendenciaPct = ultimoMes && promedioVentaMensual > 0
    ? ((ultimoMes.vendido - promedioVentaMensual) / promedioVentaMensual) * 100
    : null;
  const compradoTotalTimeline = timelineBase.reduce((acc, r) => acc + r.comprado, 0);
  const vendidoTotalTimeline = timelineBase.reduce((acc, r) => acc + r.vendido, 0);
  const tieneTotalesHistoricosBackend = Number.isFinite(m.comprado_total) && Number.isFinite(m.vendido_total);
  const compradoTotal = tieneTotalesHistoricosBackend ? Number(m.comprado_total) : compradoTotalTimeline;
  const vendidoTotal = tieneTotalesHistoricosBackend ? Number(m.vendido_total) : vendidoTotalTimeline;
  const totalesLabel = tieneTotalesHistoricosBackend ? "históricas" : `del gráfico (${timelineBase.length} meses)`;

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
        <Card>
          <div className="space-y-2">
            <Stat label="Stock actual" value={m.cantidad_actual.toLocaleString("es-CO")} subtitle="unidades" />
            <div
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.7rem] font-medium"
              style={{ background: estado.bg, color: estado.color }}
              title={estado.desc}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: estado.color }} />
              <span>{estado.label}</span>
              <span className="ml-auto opacity-80">{estado.desc}</span>
            </div>
          </div>
        </Card>
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

      {/* Timeline compras vs ventas + stock acumulado */}
      <Card header={<h2 className="font-semibold text-text-primary">Movimiento mensual — compras, ventas y stock</h2>}>
        {timeline.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">Sin movimientos registrados.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={timeline} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mes" tick={{ fontSize: 10 }} stroke="#a3a3a3" />
              <YAxis
                yAxisId="movs"
                tick={{ fontSize: 10 }}
                stroke="#a3a3a3"
                label={{ value: "Unidades movidas", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "#9ca3af" } }}
              />
              <YAxis
                yAxisId="stock"
                orientation="right"
                tick={{ fontSize: 10 }}
                stroke="#a3a3a3"
                label={{ value: "Stock acumulado", angle: 90, position: "insideRight", style: { fontSize: 10, fill: "#9ca3af" } }}
              />
              <Tooltip
                formatter={(v, name) => {
                  const label = name === "vendido" ? "Vendido" : name === "comprado" ? "Comprado" : "Stock fin de mes";
                  return [`${Number(v).toLocaleString("es-CO")} u`, label];
                }}
                contentStyle={{ borderRadius: "8px", fontSize: "12px" }}
              />
              <Legend
                wrapperStyle={{ fontSize: "11px" }}
                formatter={(v: string) => (v === "vendido" ? "Vendido" : v === "comprado" ? "Comprado" : "Stock acumulado")}
              />
              <Bar yAxisId="movs" dataKey="comprado" fill="#0EA5E9" radius={[3, 3, 0, 0]} name="comprado" />
              <Bar yAxisId="movs" dataKey="vendido" fill="var(--color-primary, #C83828)" radius={[3, 3, 0, 0]} name="vendido" />
              <Line
                yAxisId="stock"
                type="monotone"
                dataKey="stock"
                stroke="#15803D"
                strokeWidth={2}
                dot={{ r: 3, fill: "#15803D" }}
                name="stock"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        <p className="mt-1 text-[0.65rem] text-text-muted">
          Barras azules = compras al proveedor · barras rojas = ventas · línea verde = stock al cierre del mes (estimado a partir del stock actual hacia atrás).
        </p>
      </Card>

      {/* Ritmo y rotación */}
      <Card header={<h3 className="font-semibold text-text-primary">Ritmo y rotación</h3>}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-2">
          <Row
            label="Rota cada"
            value={diasPorRotacion ? `${diasPorRotacion} días` : "—"}
            extra={diasPorRotacion ? `cada ${diasPorRotacion} días vendés un stock entero` : "sin movimiento suficiente"}
          />
          <Row
            label="Stock alcanza para"
            value={diasStockLabel(m.dias_stock)}
            extra={m.dias_stock !== null && m.dias_stock > 0 ? "al ritmo de venta actual" : ""}
          />
          <Row
            label="Tendencia último mes"
            value={tendenciaPct === null ? "—" : `${tendenciaPct >= 0 ? "▲" : "▼"} ${Math.abs(tendenciaPct).toFixed(0)}%`}
            extra={tendenciaPct === null ? "sin historial" : "vs. promedio del período"}
          />
          <Row
            label="Categoría ABC"
            value={m.abc === "sin_venta" ? "Sin ventas" : `Categoría ${m.abc}`}
            extra={m.rank_rev ? `puesto #${m.rank_rev} en ventas` : ""}
          />
          <Row
            label="Última venta"
            value={m.ultima_venta ?? "Nunca"}
            extra={m.dias_sin_venta !== null ? `hace ${m.dias_sin_venta} días` : ""}
          />
          <Row
            label="Última compra"
            value={m.ultima_compra ?? "Nunca"}
            extra={m.dias_sin_compra !== null ? `hace ${m.dias_sin_compra} días` : ""}
          />
        </dl>
      </Card>

      {/* Últimos movimientos: compras (izq) vs ventas (der) */}
      <MovimientosSplit
        movimientos={data.movimientos ?? []}
        stockActual={m.cantidad_actual}
        compradoTotal={compradoTotal}
        vendidoTotal={vendidoTotal}
        totalesLabel={totalesLabel}
      />
    </>
  );
}

/** Resultado FIFO por compra: cuántas unidades de esa tanda ya se vendieron y cuántas siguen en stock. */
interface ComprasFifo {
  index: number;       // posición en el array original `compras`
  vendidas: number;    // unidades de esta compra ya consumidas por ventas posteriores
  enStock: number;     // unidades restantes de esta compra
  primeraVenta: string | null;
  ultimaVenta: string | null;
}

interface DiaMovimientoGroup {
  fecha: string;
  movimientos: ProductMovimiento[];
  unidades: number;
  total: number;
}

interface MesMovimientoGroup {
  mes: string;
  label: string;
  movimientos: ProductMovimiento[];
  dias: DiaMovimientoGroup[];
  unidades: number;
  total: number;
}

interface FifoSummary {
  vendidas: number;
  pendientes: number;
}

function groupMovimientosByMonth(movimientos: ProductMovimiento[], order: "asc" | "desc"): MesMovimientoGroup[] {
  const byMonth = new Map<string, ProductMovimiento[]>();
  for (const mv of movimientos) {
    const mes = String(mv.fecha).slice(0, 7);
    const list = byMonth.get(mes) ?? [];
    list.push(mv);
    byMonth.set(mes, list);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => (order === "asc" ? a.localeCompare(b) : b.localeCompare(a)))
    .map(([mes, items]) => {
      const byDay = new Map<string, ProductMovimiento[]>();
      for (const mv of items) {
        const dayItems = byDay.get(mv.fecha) ?? [];
        dayItems.push(mv);
        byDay.set(mv.fecha, dayItems);
      }
      const dias = Array.from(byDay.entries())
        .sort(([a], [b]) => (order === "asc" ? a.localeCompare(b) : b.localeCompare(a)))
        .map(([fecha, dayItems]) => ({
          fecha,
          movimientos: [...dayItems].sort((a, b) => String(a.num_documento).localeCompare(String(b.num_documento), "es", { numeric: true })),
          unidades: dayItems.reduce((acc, mv) => acc + mv.cantidad, 0),
          total: dayItems.reduce((acc, mv) => acc + mv.valor, 0),
        }));

      return {
        mes,
        label: monthLabel(mes),
        movimientos: items,
        dias,
        unidades: items.reduce((acc, mv) => acc + mv.cantidad, 0),
        total: items.reduce((acc, mv) => acc + mv.valor, 0),
      };
    });
}

function daysBetween(start: string, end: string): number | null {
  const startMs = new Date(`${start}T00:00:00`).getTime();
  const endMs = new Date(`${end}T00:00:00`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.max(0, Math.round((endMs - startMs) / 86_400_000));
}

function calcularFifoDesdeMovimientos(
  compras: ProductMovimiento[],
  ventas: ProductMovimiento[],
  stockActual: number,
): ComprasFifo[] {
  // FIFO: las ventas más antiguas consumen primero las compras más antiguas.
  // Como product-detail ya trae el historial completo, esto permite estimar
  // cuándo empezó y cuándo terminó de venderse cada compra.
  const comprasAsc = compras
    .map((mv, i) => ({ ...mv, _origIndex: i }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.num_documento).localeCompare(String(b.num_documento), "es", { numeric: true }));
  const ventasAsc = [...ventas].sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.num_documento).localeCompare(String(b.num_documento), "es", { numeric: true }));

  const resultado = comprasAsc.map((compra) => ({
    index: compra._origIndex,
    vendidas: 0,
    enStock: compra.cantidad,
    primeraVenta: null as string | null,
    ultimaVenta: null as string | null,
  }));

  for (const venta of ventasAsc) {
    let porConsumir = venta.cantidad;
    for (let i = 0; i < comprasAsc.length && porConsumir > 0; i++) {
      const compra = comprasAsc[i];
      const fifo = resultado[i];
      if (!compra || !fifo || fifo.enStock <= 0) continue;
      if (compra.fecha > venta.fecha) break;
      const tomar = Math.min(fifo.enStock, porConsumir);
      fifo.vendidas += tomar;
      fifo.enStock -= tomar;
      fifo.primeraVenta = fifo.primeraVenta ?? venta.fecha;
      fifo.ultimaVenta = venta.fecha;
      porConsumir -= tomar;
    }
  }

  // Si por alguna inconsistencia el saldo FIFO no cuadra exacto con stock actual,
  // mantenemos el stock canónico ajustando sólo el remanente desde compras recientes.
  const saldoFifo = resultado.reduce((acc, f) => acc + f.enStock, 0);
  if (Math.abs(saldoFifo - stockActual) > 0.001) {
    let stockPorAsignar = Math.max(0, stockActual);
    const comprasDesc = compras
      .map((mv, i) => ({ ...mv, _origIndex: i }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.num_documento).localeCompare(String(a.num_documento), "es", { numeric: true }));
    const byIndex = new Map(resultado.map((f) => [f.index, f]));
    for (const compra of comprasDesc) {
      const fifo = byIndex.get(compra._origIndex);
      if (!fifo) continue;
      const enStock = Math.min(compra.cantidad, stockPorAsignar);
      stockPorAsignar -= enStock;
      fifo.enStock = enStock;
      fifo.vendidas = Math.max(0, compra.cantidad - enStock);
    }
  }

  return resultado;
}

function summarizeFifo(
  movimientos: ProductMovimiento[],
  compras: ProductMovimiento[],
  fifoPorIndex: Map<number, ComprasFifo> | undefined,
): FifoSummary {
  if (!fifoPorIndex) return { vendidas: 0, pendientes: 0 };
  return movimientos.reduce(
    (acc, mv) => {
      const compraIndex = compras.indexOf(mv);
      const fifo = compraIndex >= 0 ? fifoPorIndex.get(compraIndex) : undefined;
      return {
        vendidas: acc.vendidas + (fifo?.vendidas ?? 0),
        pendientes: acc.pendientes + (fifo?.enStock ?? 0),
      };
    },
    { vendidas: 0, pendientes: 0 },
  );
}

function FifoSummaryBadges({ summary }: { summary: FifoSummary }): JSX.Element {
  return (
    <span className="inline-flex flex-wrap justify-end gap-1 text-[0.65rem] font-semibold">
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
        {summary.vendidas.toLocaleString("es-CO")} vendidas
      </span>
      {summary.pendientes > 0 && (
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-700">
          {summary.pendientes.toLocaleString("es-CO")} pendientes
        </span>
      )}
    </span>
  );
}

function FifoSaleTiming({ fifo, fechaCompra }: { fifo: ComprasFifo | undefined; fechaCompra: string }): JSX.Element {
  if (!fifo || fifo.vendidas <= 0 || !fifo.ultimaVenta) {
    return <span className="text-[0.65rem] text-text-muted">Sin venta asignada</span>;
  }

  const diasPrimeraVenta = fifo.primeraVenta ? daysBetween(fechaCompra, fifo.primeraVenta) : null;
  const diasUltimaVenta = daysBetween(fechaCompra, fifo.ultimaVenta);
  const rango = fifo.primeraVenta && fifo.primeraVenta !== fifo.ultimaVenta
    ? `${fifo.primeraVenta} → ${fifo.ultimaVenta}`
    : fifo.ultimaVenta;
  const textoDias = fifo.enStock > 0
    ? diasUltimaVenta !== null ? `última venta a ${diasUltimaVenta} días` : "parcial"
    : diasUltimaVenta !== null ? `se agotó en ${diasUltimaVenta} días` : "agotada";

  return (
    <span
      className="inline-flex max-w-[10rem] flex-col items-end leading-tight"
      title={`Primera venta FIFO: ${fifo.primeraVenta ?? "—"}${diasPrimeraVenta !== null ? ` (${diasPrimeraVenta} días)` : ""}. Última venta FIFO: ${fifo.ultimaVenta}${diasUltimaVenta !== null ? ` (${diasUltimaVenta} días)` : ""}.`}
    >
      <span className="font-mono text-[0.65rem] text-text-primary">{rango}</span>
      <span className="text-[0.6rem] text-text-muted">{textoDias}</span>
    </span>
  );
}

function MovimientosSplit({
  movimientos,
  stockActual,
  compradoTotal,
  vendidoTotal,
  totalesLabel,
}: {
  movimientos: ProductMovimiento[];
  stockActual: number;
  compradoTotal: number;
  vendidoTotal: number;
  totalesLabel: string;
}): JSX.Element {
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const compras = movimientos.filter((mv) => mv.tipo === "compra");
  const ventas = movimientos.filter((mv) => mv.tipo === "venta");

  const totalCompras = compras.reduce((acc, mv) => acc + mv.valor, 0);
  const totalVentas = ventas.reduce((acc, mv) => acc + mv.valor, 0);
  const udsCompras = compras.reduce((acc, mv) => acc + mv.cantidad, 0);
  const udsVentas = ventas.reduce((acc, mv) => acc + mv.cantidad, 0);

  // FIFO reconciliado con stock actual: por cada compra visible, cuánto saldo queda.
  const fifoArr = calcularFifoDesdeMovimientos(compras, ventas, stockActual);
  const fifoPorIndex = new Map(fifoArr.map((f) => [f.index, f]));
  const stockFueraDeComprasVisibles = Math.max(0, stockActual - udsCompras);
  const tieneTotalesHistoricos = Number.isFinite(compradoTotal) && Number.isFinite(vendidoTotal);

  return (
    <Card
      header={
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold text-text-primary">Historial completo de movimientos</h3>
            <p className="text-xs font-normal text-text-muted">Agrupado por mes; abrí un mes para ver los días y documentos.</p>
          </div>
          <button
            type="button"
            onClick={() => setOrder((current) => (current === "desc" ? "asc" : "desc"))}
            className="self-start rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-muted md:self-auto"
          >
            Fecha: {order === "desc" ? "reciente primero" : "antigua primero"}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:divide-x md:divide-border/60">
        <MovimientoColumna
          tipo="compra"
          titulo="Compras"
          movimientos={compras}
          unidades={udsCompras}
          total={totalCompras}
          fifoPorIndex={fifoPorIndex}
          order={order}
        />
        <div className="md:pl-4">
          <MovimientoColumna
            tipo="venta"
            titulo="Ventas"
            movimientos={ventas}
            unidades={udsVentas}
            total={totalVentas}
            order={order}
          />
        </div>
      </div>
      {tieneTotalesHistoricos && (
        <div className="mt-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-text-secondary">
          <span className="font-semibold text-text-primary">Cálculo del stock:</span>{" "}
          {compradoTotal.toLocaleString("es-CO")} u compradas {totalesLabel} − {vendidoTotal.toLocaleString("es-CO")} u vendidas {totalesLabel} ={" "}
          <span className="font-semibold text-text-primary">{stockActual.toLocaleString("es-CO")} u actuales</span>.
          <span className="ml-1 text-text-muted">
            Abajo se muestran todos los movimientos que devuelve el backend, agrupados para que no sea una lista infinita.
          </span>
        </div>
      )}
      <p className="mt-3 text-[0.65rem] text-text-muted">
        Saldo por compra estimado con FIFO y anclado al stock actual ({stockActual.toLocaleString("es-CO")} u). Bajo FIFO, el stock restante se asigna a las compras más recientes.
        {stockFueraDeComprasVisibles > 0 ? ` Hay ${stockFueraDeComprasVisibles.toLocaleString("es-CO")} u de stock que no se explican con las compras visibles.` : ""}
      </p>
    </Card>
  );
}

function MovimientoColumna({
  tipo,
  titulo,
  movimientos,
  unidades,
  total,
  fifoPorIndex,
  order,
}: {
  tipo: "compra" | "venta";
  titulo: string;
  movimientos: ProductMovimiento[];
  unidades: number;
  total: number;
  fifoPorIndex?: Map<number, ComprasFifo>;
  order: "asc" | "desc";
}): JSX.Element {
  const esCompra = tipo === "compra";
  const color = esCompra ? "#0EA5E9" : "var(--color-primary, #C83828)";
  const bg = esCompra ? "bg-sky-50" : "bg-primary/5";
  const text = esCompra ? "text-sky-700" : "text-primary";
  const hrefBase = esCompra ? "/dashboards/compras/dia" : "/dashboards/ventas/dia";
  const meses = groupMovimientosByMonth(movimientos, order);

  return (
    <div className="space-y-2">
      <div className={`flex items-center justify-between rounded-md ${bg} px-3 py-2`}>
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
          <span className={`text-sm font-semibold ${text}`}>{titulo}</span>
          <span className="text-[0.7rem] text-text-muted">
            {movimientos.length} mov · {unidades.toLocaleString("es-CO")} u
          </span>
        </div>
        <span className={`text-sm font-semibold tabular-nums ${text}`}>{formatMoneyFull(total)}</span>
      </div>

      {movimientos.length === 0 ? (
        <p className="py-6 text-center text-xs text-text-muted">
          {esCompra ? "Sin compras en el período." : "Sin ventas en el período."}
        </p>
      ) : (
        <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
          {meses.map((mes) => (
            <MesMovimientos
              key={`${tipo}-${mes.mes}`}
              tipo={tipo}
              mes={mes}
              hrefBase={hrefBase}
              fifoPorIndex={fifoPorIndex}
              compras={comprasSafe(movimientos, esCompra)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function comprasSafe(movimientos: ProductMovimiento[], esCompra: boolean): ProductMovimiento[] {
  return esCompra ? movimientos : [];
}

function MesMovimientos({
  tipo,
  mes,
  hrefBase,
  fifoPorIndex,
  compras,
}: {
  tipo: "compra" | "venta";
  mes: MesMovimientoGroup;
  hrefBase: string;
  fifoPorIndex?: Map<number, ComprasFifo>;
  compras: ProductMovimiento[];
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const esCompra = tipo === "compra";
  const colorClass = esCompra ? "border-sky-200 bg-sky-50/60 text-sky-800" : "border-primary/20 bg-primary/5 text-primary";
  const fifoSummary = esCompra ? summarizeFifo(mes.movimientos, compras, fifoPorIndex) : null;

  return (
    <div className={`overflow-hidden rounded-lg border ${colorClass}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
        <div>
          <div className="text-sm font-semibold">{open ? "▾" : "▸"} {mes.label}</div>
          <div className="text-[0.7rem] opacity-75">{mes.dias.length} días · {mes.movimientos.length} mov</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-bold tabular-nums">{mes.unidades.toLocaleString("es-CO")} u</div>
          <div className="text-[0.7rem] font-semibold tabular-nums">{formatMoneyFull(mes.total)}</div>
          {fifoSummary && <div className="mt-1"><FifoSummaryBadges summary={fifoSummary} /></div>}
        </div>
      </button>
      {open && (
        <div className="border-t border-current/10 bg-surface/80 px-2 py-2 text-text-secondary">
          {mes.dias.map((dia) => (
            <DiaMovimientos
              key={`${tipo}-${dia.fecha}`}
              dia={dia}
              esCompra={esCompra}
              hrefBase={hrefBase}
              fifoPorIndex={fifoPorIndex}
              compras={compras}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DiaMovimientos({
  dia,
  esCompra,
  hrefBase,
  fifoPorIndex,
  compras,
}: {
  dia: DiaMovimientoGroup;
  esCompra: boolean;
  hrefBase: string;
  fifoPorIndex?: Map<number, ComprasFifo>;
  compras: ProductMovimiento[];
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const fifoSummary = esCompra ? summarizeFifo(dia.movimientos, compras, fifoPorIndex) : null;

  return (
    <div className="mb-2 rounded-md border border-border/60 bg-surface last:mb-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs hover:bg-muted/60">
        <span className="font-medium text-text-primary">{open ? "▾" : "▸"} {dia.fecha}</span>
        <span className="flex flex-col items-end gap-1 tabular-nums text-text-muted sm:flex-row sm:items-center">
          <span>{dia.unidades.toLocaleString("es-CO")} u · {formatMoneyFull(dia.total)}</span>
          {fifoSummary && <FifoSummaryBadges summary={fifoSummary} />}
        </span>
      </button>
      {open && (
        <table className="w-full border-t border-border/50 text-xs">
          <thead>
            <tr className="text-left text-[0.65rem] uppercase tracking-wide text-text-muted">
              <th className="py-1.5 px-2">Documento</th>
              <th className="py-1.5 px-2 text-right">Cant</th>
              <th className="py-1.5 px-2 text-right">Unit.</th>
              <th className="py-1.5 px-2 text-right">Total</th>
              {esCompra && <th className="py-1.5 px-2 text-right">Estado</th>}
              {esCompra && <th className="py-1.5 px-2 text-right">Venta FIFO</th>}
            </tr>
          </thead>
          <tbody>
            {dia.movimientos.map((mv, i) => {
              const unitario = mv.cantidad > 0 ? mv.valor / mv.cantidad : 0;
              const compraIndex = esCompra ? compras.indexOf(mv) : -1;
              const fifo = esCompra && fifoPorIndex ? fifoPorIndex.get(compraIndex) : undefined;
              return (
                <tr key={`${mv.fecha}-${mv.num_documento}-${i}`} className="border-t border-border/40">
                  <td className="py-1.5 px-2">
                    <Link href={`${hrefBase}/${mv.fecha}`} className="font-mono text-accent hover:underline">
                      {mv.num_documento}
                    </Link>
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">{mv.cantidad} u</td>
                  <td className="py-1.5 px-2 text-right tabular-nums text-text-muted">{formatMoneyFull(unitario)}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums font-medium">{formatMoneyFull(mv.valor)}</td>
                  {esCompra && (
                    <td className="py-1.5 px-2 text-right">
                      <EstadoCompraBadge fifo={fifo} cantidad={mv.cantidad} />
                    </td>
                  )}
                  {esCompra && (
                    <td className="py-1.5 px-2 text-right">
                      <FifoSaleTiming fifo={fifo} fechaCompra={mv.fecha} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function EstadoCompraBadge({ fifo, cantidad }: { fifo: ComprasFifo | undefined; cantidad: number }): JSX.Element {
  if (!fifo) {
    return <span className="text-[0.65rem] text-text-muted">—</span>;
  }
  if (fifo.enStock <= 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
        style={{ background: "#DCFCE7", color: "#15803D" }}
        title={`Según FIFO y stock actual, las ${cantidad} unidades visibles de esta compra ya salieron`}
      >
        ✓ Vendido
      </span>
    );
  }
  if (fifo.vendidas <= 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
        style={{ background: "#FEE2E2", color: "#B91C1C" }}
        title={`Según FIFO y stock actual, las ${cantidad} unidades visibles de esta compra siguen en stock`}
      >
        ● En stock
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
      style={{ background: "#FFEDD5", color: "#C2410C" }}
      title={`Según FIFO y stock actual: ${fifo.vendidas} vendidas · ${fifo.enStock} en stock`}
    >
      ◐ {fifo.vendidas}/{cantidad}
    </span>
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
    default: {
      const cada = m.rotacion_anual && m.rotacion_anual > 0 ? Math.round(365 / m.rotacion_anual) : null;
      const rotInfo = cada ? `rota cada ${cada} días` : "rotación estable";
      return `${rotInfo} y el stock alcanza para ${diasStockLabel(m.dias_stock)}. Todo en orden.`;
    }
  }
}
