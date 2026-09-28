"use client";

// V1.31: Plan de compras/ventas SCOPEADO a una decision card del Resumen de
// Inventario. Construido sobre product-analytics filtrado por el `preset` de la
// card → el count coincide EXACTAMENTE con el número de la card (465, 1166, etc.).
// A diferencia del ComprarTab/OptimizarTab global (accion-based, 201), este
// muestra los mismos productos que el usuario vio en la card.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useProductAnalytics, type ProductAnalyticsParams, type ProductMetric } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import { AbcChip } from "@/components/productos/Chips";

type Preset = NonNullable<ProductAnalyticsParams["preset"]>;
type Modo = "compra" | "venta";

interface Props {
  modo: Modo;
  preset: Preset;
  titulo: string;
  accent: string;
  /** días de lead time + colchón para la fórmula de sugerido comprar */
  leadColchonDias?: number;
}

const PAGE_SIZE = 50;

/** Sugerido comprar = velocidad_diaria × (lead + colchón) − stock actual, floor 0. */
function sugeridoComprar(m: ProductMetric, leadColchonDias: number): number {
  const velocidadDiaria = (m.velocidad_mensual ?? 0) / 30;
  const objetivo = velocidadDiaria * leadColchonDias;
  return Math.max(0, Math.round(objetivo - (m.cantidad_actual ?? 0)));
}

/** Cobertura en días = stock / velocidad diaria. null si no rota. */
function coberturaDias(m: ProductMetric): number | null {
  const velocidadDiaria = (m.velocidad_mensual ?? 0) / 30;
  if (velocidadDiaria <= 0) return null;
  return Math.round((m.cantidad_actual ?? 0) / velocidadDiaria);
}

/** Acción sugerida de venta según cuánto hace que no vende. */
function accionVenta(m: ProductMetric): string {
  const d = m.dias_sin_venta;
  if (d === null || d === undefined) return "Nunca vendió → devolver / descatalogar";
  if (d > 180) return "Liquidar agresivo o devolver al proveedor";
  if (d > 90) return "Descuento / promoción cruzada";
  return "Reducir compras futuras";
}

export function PlanScopeado({ modo, preset, titulo, accent, leadColchonDias = 21 }: Props): JSX.Element {
  const router = useRouter();
  const [page, setPage] = useState(1);

  // Orden por defecto según modo: compra = por revenue (importancia);
  // venta = por capital inmovilizado (mayor plata parada primero).
  const sort = modo === "compra" ? "revenue_win" : "valor_inventario";
  const { data, isLoading } = useProductAnalytics({ preset, page, pageSize: PAGE_SIZE, sort, order: "desc" });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const items = data?.items ?? [];

  // KPIs del scope completo (no solo la página): capital total y, para compra, costo estimado.
  // Nota: el costo estimado se aproxima sobre la página visible + total; para el total exacto
  // se necesitaría sumar server-side. Mostramos el total de productos (exacto) y el capital de
  // la página como referencia con nota.
  const capitalPagina = items.reduce((s, m) => s + (m.valor_inventario ?? 0), 0);
  const costoSugeridoPagina = items.reduce(
    (s, m) => s + sugeridoComprar(m, leadColchonDias) * (m.costo_unit ?? 0), 0,
  );

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card>
          <Stat
            label={modo === "compra" ? "Productos a comprar" : "Productos a mover"}
            value={data ? data.total.toLocaleString("es-CO") : "—"}
            subtitle={titulo}
          />
        </Card>
        {modo === "venta" ? (
          <Card>
            <Stat
              label="Capital en esta página"
              value={formatMoneyFull(capitalPagina)}
              subtitle={`de ${data?.total ?? 0} productos en total`}
            />
          </Card>
        ) : (
          <Card>
            <Stat
              label="Costo sugerido (página)"
              value={formatMoneyFull(costoSugeridoPagina)}
              subtitle={`para ${items.length} productos visibles`}
            />
          </Card>
        )}
        <Card>
          <Stat
            label="Páginas"
            value={`${page} / ${totalPages}`}
            subtitle={`${PAGE_SIZE} por página`}
          />
        </Card>
      </div>

      <Card
        header={
          <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-semibold text-text-primary">{titulo}</h2>
              <p className="text-[0.65rem] text-text-muted">
                {modo === "compra"
                  ? "Sugerido = velocidad × (lead+colchón 21d) − stock actual · click en fila → ficha"
                  : "Ordenado por capital inmovilizado · click en fila → ficha"}
              </p>
            </div>
            <span className="text-xs text-text-muted">{data ? `${data.total.toLocaleString("es-CO")} productos` : ""}</span>
          </div>
        }
      >
        {isLoading && !data ? (
          <Skeleton className="h-96 rounded-lg" />
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">Nada por acá. 👌</p>
        ) : (
          <>
          <ul aria-label={titulo} className="space-y-2 lg:hidden">
            {items.map((item, index) => {
              const suggested = sugeridoComprar(item, leadColchonDias);
              const cover = coberturaDias(item);
              return (
                <li key={item.cod_producto}>
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(item.cod_producto)}`)}
                    className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="shrink-0 pt-0.5 text-xs tabular-nums text-text-muted">{(page - 1) * PAGE_SIZE + index + 1}.</span>
                        <AbcChip abc={item.abc} />
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold leading-snug text-text-primary">{item.nombre}</p>
                          <p className="mt-0.5 break-all font-mono text-xs text-text-muted">{item.cod_producto}</p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[0.65rem] text-text-muted">Stock</p>
                        <p className="font-semibold tabular-nums text-text-primary">
                          {Math.round(item.cantidad_actual).toLocaleString("es-CO")}
                        </p>
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/70 pt-2 text-xs">
                      {modo === "compra" ? (
                        <>
                          <div>
                            <dt className="text-text-muted">Velocidad</dt>
                            <dd className="mt-0.5 font-medium tabular-nums text-text-primary">
                              {item.velocidad_mensual.toLocaleString("es-CO", { maximumFractionDigits: 1 })}/mes
                            </dd>
                          </div>
                          <div>
                            <dt className="text-text-muted">Cobertura</dt>
                            <dd className="mt-0.5 font-medium tabular-nums text-text-primary">{cover !== null ? `${cover} días` : "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-text-muted">Sugerido comprar</dt>
                            <dd className="mt-0.5 font-semibold tabular-nums" style={{ color: suggested > 0 ? accent : undefined }}>
                              {suggested > 0 ? `+${suggested.toLocaleString("es-CO")}` : "—"}
                            </dd>
                          </div>
                          <div className="min-w-0">
                            <dt className="text-text-muted">Costo estimado</dt>
                            <dd className="mt-0.5 break-words font-semibold tabular-nums text-text-primary">
                              {formatMoneyFull(suggested * (item.costo_unit ?? 0))}
                            </dd>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="min-w-0">
                            <dt className="text-text-muted">Capital inventario</dt>
                            <dd className="mt-0.5 break-words font-semibold tabular-nums text-text-primary">{formatMoneyFull(item.valor_inventario)}</dd>
                          </div>
                          <div>
                            <dt className="text-text-muted">Sin vender</dt>
                            <dd className="mt-0.5 font-medium tabular-nums text-text-primary">
                              {item.dias_sin_venta !== null ? `${item.dias_sin_venta} días` : "Nunca"}
                            </dd>
                          </div>
                          <div className="col-span-2 min-w-0">
                            <dt className="text-text-muted">Acción sugerida</dt>
                            <dd className="mt-0.5 break-words font-medium leading-snug text-text-primary">{accionVenta(item)}</dd>
                          </div>
                        </>
                      )}
                    </dl>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                  <th className="py-2 pl-4 pr-2 md:pl-2">#</th>
                  <th className="py-2 px-2">Producto</th>
                  <th className="py-2 px-2 text-right">Stock</th>
                  {modo === "compra" ? (
                    <>
                      <th className="py-2 px-2 text-right">Velocidad</th>
                      <th className="py-2 px-2 text-right">Cobertura</th>
                      <th className="py-2 px-2 text-right">Sugerido</th>
                      <th className="py-2 pl-2 pr-4 md:pr-2 text-right">Costo est.</th>
                    </>
                  ) : (
                    <>
                      <th className="py-2 px-2 text-right">Capital</th>
                      <th className="py-2 px-2 text-right">Sin vender</th>
                      <th className="py-2 pl-2 pr-4 md:pr-2">Acción sugerida</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((m, idx) => {
                  const sug = sugeridoComprar(m, leadColchonDias);
                  const cob = coberturaDias(m);
                  return (
                    <tr
                      key={m.cod_producto}
                      className="border-b border-border/60 hover:bg-surface-alt cursor-pointer"
                      onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(m.cod_producto)}`)}
                    >
                      <td className="py-2 pl-4 pr-2 md:pl-2 text-xs text-text-muted tabular-nums">
                        {(page - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <AbcChip abc={m.abc} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-text-primary max-w-xs">{m.nombre}</div>
                            <div className="text-[0.65rem] text-text-muted">{m.cod_producto}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">
                        {Math.round(m.cantidad_actual).toLocaleString("es-CO")}
                      </td>
                      {modo === "compra" ? (
                        <>
                          <td className="py-2 px-2 text-right tabular-nums text-text-muted">
                            {m.velocidad_mensual.toLocaleString("es-CO", { maximumFractionDigits: 1 })}/mes
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-text-muted">
                            {cob !== null ? `${cob}d` : "—"}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums font-semibold" style={{ color: sug > 0 ? accent : undefined }}>
                            {sug > 0 ? `+${sug.toLocaleString("es-CO")}` : "—"}
                          </td>
                          <td className="py-2 pl-2 pr-4 md:pr-2 text-right tabular-nums">
                            {formatMoneyFull(sug * (m.costo_unit ?? 0))}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 px-2 text-right tabular-nums font-semibold">
                            {formatMoneyFull(m.valor_inventario)}
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums text-text-muted">
                            {m.dias_sin_venta !== null ? `${m.dias_sin_venta}d` : "nunca"}
                          </td>
                          <td className="py-2 pl-2 pr-4 md:pr-2 text-[0.7rem] text-text-secondary">
                            {accionVenta(m)}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* Paginación */}
        {data && totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between text-xs">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-border px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-40 hover:bg-surface-alt"
            >
              ← Anterior
            </button>
            <span className="text-text-muted">Página {page} de {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-lg border border-border px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-40 hover:bg-surface-alt"
            >
              Siguiente →
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
