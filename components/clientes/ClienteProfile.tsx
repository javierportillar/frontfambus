"use client";

import { useState } from "react";
import type { ChangeEventHandler, Dispatch, ReactNode, SetStateAction } from "react";
import Link from "next/link";
import {
  CLIENTES_DEFAULT_PAGE_SIZE,
  useClienteFacturas,
  useClientePerfil,
  type ClienteFacturaItem,
  type ClienteProductoTop,
} from "@/lib/api/hooks";
import {
  isValidCustomerId,
  productHref,
  salesDayHref,
} from "@/lib/clientes/routes";
import { isValidBusinessDate } from "@/lib/compras/routes";
import { businessDateISO } from "@/lib/date/business";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

function yearsBefore(date: string, years: number): string {
  const [year = "0", month = "1", day = "1"] = date.split("-");
  const shifted = new Date(Date.UTC(Number(year) - years, Number(month) - 1, Number(day)));
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function errorStatus(error: Error): number | null {
  const match = error.message.match(/API error (\d{3})/);
  return match?.[1] ? Number(match[1]) : null;
}

export function ClienteProfile({
  customerId,
  initialFechaInicio,
  initialFechaFin,
  backQuery,
}: {
  customerId: string;
  initialFechaInicio?: string;
  initialFechaFin?: string;
  backQuery?: string;
}): JSX.Element {
  const today = businessDateISO();
  const defaultStart = yearsBefore(today, 1);
  const seedStart = initialFechaInicio && isValidBusinessDate(initialFechaInicio) ? initialFechaInicio : defaultStart;
  const seedEnd = initialFechaFin && isValidBusinessDate(initialFechaFin) ? initialFechaFin : today;

  const [fechaInicio, setFechaInicio] = useState(seedStart);
  const [fechaFin, setFechaFin] = useState(seedEnd);
  const [page, setPage] = useState(1);

  const validId = isValidCustomerId(customerId);
  const rangeIsValid = isValidBusinessDate(fechaInicio)
    && isValidBusinessDate(fechaFin)
    && fechaInicio <= fechaFin
    && fechaInicio >= yearsBefore(fechaFin, 10)
    && fechaFin <= today;

  const canFetch = validId && rangeIsValid;
  const { data, error, isLoading, mutate } = useClientePerfil(
    canFetch ? customerId : null,
    fechaInicio,
    fechaFin,
  );
  const facturas = useClienteFacturas(
    canFetch ? customerId : null,
    fechaInicio,
    fechaFin,
    page,
    CLIENTES_DEFAULT_PAGE_SIZE,
  );

  const backHref = (() => {
    const params = new URLSearchParams({ fecha_inicio: fechaInicio, fecha_fin: fechaFin });
    if (backQuery) params.set("q", backQuery);
    return `/dashboards/clientes?${params.toString()}`;
  })();

  const updateStartDate: ChangeEventHandler<HTMLInputElement> = (event) => {
    setFechaInicio(event.target.value);
    setPage(1);
  };
  const updateEndDate: ChangeEventHandler<HTMLInputElement> = (event) => {
    setFechaFin(event.target.value);
    setPage(1);
  };

  if (!validId) {
    return (
      <ProfileFrame backHref={backHref}>
        <StateCard title="Cliente inválido" message="El identificador de cliente no es válido." />
      </ProfileFrame>
    );
  }

  if (!rangeIsValid) {
    return (
      <ProfileFrame backHref={backHref}>
        <Card>
          <p role="alert" className="py-5 text-center text-sm text-error">
            Elegí un rango válido de hasta 10 años, sin fechas futuras.
          </p>
          <DateFilters
            fechaInicio={fechaInicio}
            fechaFin={fechaFin}
            today={today}
            onStartChange={updateStartDate}
            onEndChange={updateEndDate}
          />
        </Card>
      </ProfileFrame>
    );
  }

  if (isLoading && !data) {
    return (
      <ProfileFrame backHref={backHref}>
        <DateFilterCard
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
          today={today}
          onStartChange={updateStartDate}
          onEndChange={updateEndDate}
        />
        <div aria-label="Cargando perfil del cliente" role="status" className="space-y-4">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </ProfileFrame>
    );
  }

  if (error) {
    const status = errorStatus(error);
    if (status === 404) {
      return (
        <ProfileFrame backHref={backHref}>
          <StateCard title="Cliente no encontrado" message="No existe un cliente con este identificador en el negocio activo." />
        </ProfileFrame>
      );
    }
    if (status === 403) {
      return (
        <ProfileFrame backHref={backHref}>
          <StateCard title="Acceso restringido" message="Tu usuario no tiene acceso al módulo de ventas de este negocio." />
        </ProfileFrame>
      );
    }
    return (
      <ProfileFrame backHref={backHref}>
        <Card>
          <div role="alert" className="py-5 text-center">
            <p className="text-sm font-semibold text-error">No pudimos cargar el perfil del cliente.</p>
            <button
              type="button"
              onClick={() => void mutate()}
              className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-alt"
            >
              Reintentar
            </button>
          </div>
          <DateFilters
            fechaInicio={fechaInicio}
            fechaFin={fechaFin}
            today={today}
            onStartChange={updateStartDate}
            onEndChange={updateEndDate}
          />
        </Card>
      </ProfileFrame>
    );
  }

  if (!data) {
    return (
      <ProfileFrame backHref={backHref}>
        <div aria-label="Cargando perfil del cliente" role="status"><Skeleton className="h-40 rounded-xl" /></div>
      </ProfileFrame>
    );
  }

  if (data.cliente.customer_id !== customerId) {
    return (
      <ProfileFrame backHref={backHref}>
        <StateCard title="Cliente no encontrado" message="La respuesta no coincide con el cliente solicitado." />
      </ProfileFrame>
    );
  }

  return (
    <ProfileFrame backHref={backHref} name={data.cliente.nombre_canonico} customerId={data.cliente.customer_id}>
      <DateFilterCard
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
        today={today}
        onStartChange={updateStartDate}
        onEndChange={updateEndDate}
      />

      <section aria-labelledby="cliente-summary-heading" className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Ventas facturadas</p>
          <h2 id="cliente-summary-heading" className="mt-1 text-lg font-semibold text-text-primary">Resumen del cliente</h2>
          <p className="text-xs text-text-muted">Período {data.periodo.fecha_inicio} a {data.periodo.fecha_fin}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <MetricCard label="Ventas totales" value={formatMoneyFull(data.resumen.ventas_total)} detail="facturado en el período" />
          <MetricCard label="Facturas" value={data.resumen.facturas.toLocaleString("es-CO")} detail="documentos válidos" />
          <MetricCard label="Ticket promedio" value={formatMoneyFull(data.resumen.ticket_promedio)} detail="por factura" />
          <MetricCard label="Unidades vendidas" value={data.resumen.unidades_vendidas.toLocaleString("es-CO")} detail="productos facturados" />
          <MetricCard label="Primera compra" value={data.resumen.primera_compra ?? "—"} detail="en el rango elegido" />
          <MetricCard label="Última compra" value={data.resumen.ultima_compra ?? "—"} detail="en el rango elegido" />
        </div>
      </section>

      {data.productos_top.length > 0 ? (
        <Productos productos={data.productos_top} />
      ) : null}

      <DocumentHistory
        facturas={facturas.data?.items ?? []}
        page={facturas.data?.pagina ?? page}
        totalPaginas={facturas.data?.total_paginas ?? 0}
        total={facturas.data?.total ?? 0}
        isLoading={facturas.isLoading && !facturas.data}
        onPageChange={setPage}
      />
    </ProfileFrame>
  );
}

function ProfileFrame({
  backHref,
  name,
  customerId,
  children,
}: {
  backHref: string;
  name?: string;
  customerId?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="space-y-5">
      <div>
        <Link href={backHref} className="text-sm text-accent hover:underline">← Volver a clientes</Link>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Perfil del cliente</p>
        <h1 className="mt-1 break-words text-xl font-bold leading-tight text-text-primary sm:text-2xl">{name ?? "Cliente"}</h1>
        {customerId ? <p className="mt-1 break-all font-mono text-sm text-text-muted">Documento {customerId}</p> : null}
      </div>
      {children}
    </div>
  );
}

function DateFilters(props: {
  fechaInicio: string;
  fechaFin: string;
  today: string;
  onStartChange: ChangeEventHandler<HTMLInputElement>;
  onEndChange: ChangeEventHandler<HTMLInputElement>;
}): JSX.Element {
  const { fechaInicio, fechaFin, today, onStartChange, onEndChange } = props;
  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-xs font-medium text-text-muted">
          Desde
          <input
            type="date"
            aria-label="Desde"
            value={fechaInicio}
            max={fechaFin}
            onChange={onStartChange}
            className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          />
        </label>
        <label className="min-w-0 text-xs font-medium text-text-muted">
          Hasta
          <input
            type="date"
            aria-label="Hasta"
            value={fechaFin}
            min={fechaInicio}
            max={today}
            onChange={onEndChange}
            className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          />
        </label>
      </div>
      <p className="mt-3 text-xs text-text-muted">Rango predeterminado: últimos 12 meses.</p>
    </div>
  );
}

function DateFilterCard(props: Parameters<typeof DateFilters>[0]): JSX.Element {
  return (
    <Card>
      <DateFilters {...props} />
    </Card>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }): JSX.Element {
  return (
    <Card hover={false} className="min-w-0">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1 break-words text-base font-semibold leading-tight tabular-nums text-text-primary sm:text-lg">{value}</p>
      <p className="mt-1 break-words text-[0.7rem] leading-snug text-text-muted">{detail}</p>
    </Card>
  );
}

function ProductosTopTable({ productos }: { productos: ClienteProductoTop[] }): JSX.Element {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
            <th className="px-3 py-2">Producto</th>
            <th className="px-3 py-2 text-right">Unidades</th>
            <th className="px-3 py-2 text-right">Facturas</th>
            <th className="px-3 py-2 text-right">Ventas</th>
          </tr>
        </thead>
        <tbody>
          {productos.map((product, index) => (
            <tr key={`${product.sku ?? "sin-sku"}-${index}`} className="border-b border-border/60 last:border-0">
              <td className="px-3 py-2">
                {product.sku ? (
                  <Link href={productHref(product.sku)} className="block font-medium text-primary hover:underline">
                    {product.nombre_producto}
                  </Link>
                ) : (
                  <span className="block font-medium text-text-primary">{product.nombre_producto}</span>
                )}
                {product.sku ? <span className="break-all text-xs text-text-muted">{product.sku}</span> : null}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{product.unidades.toLocaleString("es-CO")}</td>
              <td className="px-3 py-2 text-right tabular-nums">{product.facturas.toLocaleString("es-CO")}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMoneyFull(product.ventas_valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductosTopList({ productos }: { productos: ClienteProductoTop[] }): JSX.Element {
  return (
    <ul aria-label="Productos más comprados por el cliente" className="space-y-2 md:hidden">
      {productos.map((product, index) => (
        <li key={`${product.sku ?? "sin-sku"}-${index}`} className="min-w-0 rounded-lg border border-border bg-surface p-3">
          {product.sku ? (
            <Link href={productHref(product.sku)} className="break-words text-sm font-semibold leading-snug text-primary hover:underline">
              {product.nombre_producto}
            </Link>
          ) : (
            <span className="break-words text-sm font-semibold leading-snug text-text-primary">{product.nombre_producto}</span>
          )}
          <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-border/70 pt-2 text-xs">
            <div>
              <dt className="text-text-muted">Unidades</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{product.unidades.toLocaleString("es-CO")}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Facturas</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{product.facturas.toLocaleString("es-CO")}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Ventas</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{formatMoneyFull(product.ventas_valor)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function Productos({ productos }: { productos: ClienteProductoTop[] }): JSX.Element {
  return (
    <section aria-labelledby="cliente-products-heading" className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Preferencias</p>
        <h2 id="cliente-products-heading" className="mt-1 text-lg font-semibold text-text-primary">Productos más comprados</h2>
        <p className="text-xs text-text-muted">Top 10 por unidades en el período.</p>
      </div>
      <Card>
        <ProductosTopList productos={productos} />
        <ProductosTopTable productos={productos} />
      </Card>
    </section>
  );
}

function FacturaRow({ factura }: { factura: ClienteFacturaItem }): JSX.Element {
  return (
    <li className="rounded-lg border border-border bg-surface p-3 md:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={salesDayHref(factura.fecha_negocio)} className="text-sm font-semibold text-primary hover:underline">
            {factura.fecha_negocio}
          </Link>
          <p className="mt-0.5 text-xs text-text-muted">Clase {factura.cod_clase} · {factura.lineas} productos</p>
        </div>
        <p className="shrink-0 text-right text-sm font-bold tabular-nums text-text-primary">{formatMoneyFull(factura.total_factura)}</p>
      </div>
    </li>
  );
}

function DocumentHistory({
  facturas,
  page,
  totalPaginas,
  total,
  isLoading,
  onPageChange,
}: {
  facturas: ClienteFacturaItem[];
  page: number;
  totalPaginas: number;
  total: number;
  isLoading: boolean;
  onPageChange: Dispatch<SetStateAction<number>>;
}): JSX.Element {
  return (
    <Card header={
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-text-primary">Facturas del cliente</h2>
        <span className="text-xs text-text-muted">{total.toLocaleString("es-CO")} en el período</span>
      </div>
    }>
      {isLoading ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : facturas.length === 0 ? (
        <p role="status" className="py-8 text-center text-sm text-text-muted">No hay facturas para este cliente en el período.</p>
      ) : (
        <>
          <ul aria-label="Facturas del cliente" className="space-y-2 md:hidden">
            {facturas.map((factura) => (
              <FacturaRow key={`${factura.fecha_negocio}|${factura.cod_clase}|${factura.num_documento}`} factura={factura} />
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-alt text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Documento</th>
                  <th className="px-3 py-2">Clase</th>
                  <th className="px-3 py-2 text-right">Productos</th>
                  <th className="px-3 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((factura) => (
                  <tr key={`${factura.fecha_negocio}|${factura.cod_clase}|${factura.num_documento}`} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 text-xs">
                      <Link href={salesDayHref(factura.fecha_negocio)} className="text-primary hover:underline">
                        {factura.fecha_negocio}
                      </Link>
                    </td>
                    <td className="px-3 py-2 font-medium">{factura.num_documento}</td>
                    <td className="px-3 py-2 text-text-muted">{factura.cod_clase}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{factura.lineas.toLocaleString("es-CO")}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMoneyFull(factura.total_factura)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-text-muted" aria-live="polite">
          {totalPaginas > 0 ? `Página ${page} de ${totalPaginas}` : "Sin resultados"}
        </p>
        <div className="flex w-full gap-2 sm:w-auto">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className="min-h-11 flex-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary enabled:hover:bg-surface-alt disabled:opacity-50 sm:flex-none"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={totalPaginas === 0 || page >= totalPaginas}
            onClick={() => onPageChange(page + 1)}
            className="min-h-11 flex-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary enabled:hover:bg-surface-alt disabled:opacity-50 sm:flex-none"
          >
            Siguiente
          </button>
        </div>
      </div>
    </Card>
  );
}

function StateCard({ title, message }: { title: string; message: string }): JSX.Element {
  return (
    <Card>
      <div role="alert" className="py-8 text-center">
        <h2 className="font-semibold text-text-primary">{title}</h2>
        <p className="mt-1 text-sm text-text-muted">{message}</p>
      </div>
    </Card>
  );
}
