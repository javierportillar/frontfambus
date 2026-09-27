"use client";

import { useState } from "react";
import type { ChangeEventHandler, Dispatch, ReactNode, SetStateAction } from "react";
import Link from "next/link";
import {
  useComprasProveedorPerfil,
  type ComprasProveedorPerfilDocumento,
} from "@/lib/api/hooks";
import {
  isValidBusinessDate,
  isValidSupplierNit,
  purchaseDocumentHrefFromEntityId,
} from "@/lib/compras/routes";
import { businessDateISO } from "@/lib/date/business";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

const PAGE_SIZE = 20;
const PURCHASES_HREF = "/dashboards/movimientos?modo=compras";

function oneYearBefore(date: string): string {
  const [year = "0", month = "1", day = "1"] = date.split("-");
  const targetYear = Number(year) - 1;
  const monthIndex = Number(month) - 1;
  const lastDay = new Date(Date.UTC(targetYear, monthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(Number(day), lastDay);
  return `${String(targetYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function errorStatus(error: Error): number | null {
  const match = error.message.match(/API error (\d{3})/);
  return match?.[1] ? Number(match[1]) : null;
}

export function SupplierProfile({ nit }: { nit: string }): JSX.Element {
  const today = businessDateISO();
  const [fechaInicio, setFechaInicio] = useState(() => oneYearBefore(today));
  const [fechaFin, setFechaFin] = useState(today);
  const [page, setPage] = useState(1);
  const validNit = isValidSupplierNit(nit);
  const rangeIsValid = isValidBusinessDate(fechaInicio)
    && isValidBusinessDate(fechaFin)
    && fechaInicio <= fechaFin
    && fechaFin <= today;
  const { data, error, isLoading, mutate } = useComprasProveedorPerfil(
    validNit && rangeIsValid ? nit : null,
    fechaInicio,
    fechaFin,
    page,
    PAGE_SIZE,
  );

  if (!validNit) {
    return (
      <ProfileFrame nit={nit}>
        <StateCard title="NIT inválido" message="El NIT de proveedor no tiene un formato válido." />
      </ProfileFrame>
    );
  }

  const updateStartDate: ChangeEventHandler<HTMLInputElement> = (event) => {
    setFechaInicio(event.target.value);
    setPage(1);
  };
  const updateEndDate: ChangeEventHandler<HTMLInputElement> = (event) => {
    setFechaFin(event.target.value);
    setPage(1);
  };

  if (!rangeIsValid) {
    return (
      <ProfileFrame nit={nit}>
        <Card>
          <p role="alert" className="py-5 text-center text-sm text-error">
            Elegí un rango de fechas válido, desde la fecha inicial hasta hoy.
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
      <ProfileFrame nit={nit}>
        <DateFilterCard
          fechaInicio={fechaInicio}
          fechaFin={fechaFin}
          today={today}
          onStartChange={updateStartDate}
          onEndChange={updateEndDate}
        />
        <div aria-label="Cargando perfil del proveedor" role="status" className="space-y-4">
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
        <ProfileFrame nit={nit}>
          <StateCard title="Proveedor no encontrado" message="No existe un proveedor con este NIT en el negocio activo." />
        </ProfileFrame>
      );
    }
    if (status === 403) {
      return (
        <ProfileFrame nit={nit}>
          <StateCard title="Acceso restringido" message="Tu usuario no tiene acceso al módulo de compras de este negocio." />
        </ProfileFrame>
      );
    }
    return (
      <ProfileFrame nit={nit}>
        <Card>
          <div role="alert" className="py-5 text-center">
            <p className="text-sm font-semibold text-error">No pudimos cargar el perfil del proveedor.</p>
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
      <ProfileFrame nit={nit}>
        <div aria-label="Cargando perfil del proveedor" role="status"><Skeleton className="h-40 rounded-xl" /></div>
      </ProfileFrame>
    );
  }

  if (data.proveedor.nit !== nit) {
    return (
      <ProfileFrame nit={nit}>
        <StateCard title="Proveedor no encontrado" message="La respuesta no coincide con el proveedor solicitado." />
      </ProfileFrame>
    );
  }

  return (
    <ProfileFrame nit={nit} name={data.proveedor.nombre}>
      <DateFilterCard
        fechaInicio={fechaInicio}
        fechaFin={fechaFin}
        today={today}
        onStartChange={updateStartDate}
        onEndChange={updateEndDate}
      />

      <section aria-labelledby="actual-purchases-heading" className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Transacciones reales</p>
          <h2 id="actual-purchases-heading" className="mt-1 text-lg font-semibold text-text-primary">Compras al proveedor</h2>
          <p className="text-xs text-text-muted">Período {data.periodo.fecha_inicio} a {data.periodo.fecha_fin}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          <MetricCard label="Total comprado" value={formatMoneyFull(data.compras.total_compras)} detail="valor de compras registradas" />
          <MetricCard label="Documentos válidos" value={data.compras.num_documentos.toLocaleString("es-CO")} detail="facturas de compra" />
          <MetricCard label="Ticket promedio" value={formatMoneyFull(data.compras.ticket_promedio)} detail="por documento" />
          <MetricCard label="Productos distintos" value={data.compras.skus_distintos.toLocaleString("es-CO")} detail="SKU comprados" />
          <MetricCard label="Primera compra" value={data.compras.primera_compra ?? "—"} detail="en el rango elegido" />
          <MetricCard label="Última compra" value={data.compras.ultima_compra ?? "—"} detail="en el rango elegido" />
        </div>
        {data.compras.productos_top.length > 0 && (
          <Card header={<h3 className="font-semibold text-text-primary">Productos más comprados</h3>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-3 py-2 text-right">Unidades</th>
                    <th className="px-3 py-2 text-right">Documentos</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.compras.productos_top.map((product) => (
                    <tr key={product.cod_producto} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2">
                        <span className="block font-medium text-text-primary">{product.nombre}</span>
                        <span className="text-xs text-text-muted">{product.cod_producto}</span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{product.unidades.toLocaleString("es-CO")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{product.documentos.toLocaleString("es-CO")}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMoneyFull(product.total_compras)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <section aria-labelledby="estimated-sales-heading" className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Atribución analítica</p>
          <h2 id="estimated-sales-heading" className="mt-1 text-lg font-semibold text-text-primary">Ventas y margen estimados</h2>
        </div>
        <Card className="border-amber-300 bg-amber-50/60">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <MetricValue label="Ventas estimadas" value={formatMoneyFull(data.ventas_estimadas.revenue)} />
            <MetricValue
              label="Margen estimado (costos conocidos)"
              value={data.ventas_estimadas.margen == null ? "No disponible" : formatMoneyFull(data.ventas_estimadas.margen)}
            />
            <MetricValue label="Margen estimado %" value={data.ventas_estimadas.margen_pct == null ? "—" : `${data.ventas_estimadas.margen_pct.toFixed(1)}%`} />
            <MetricValue label="SKU atribuidos" value={data.ventas_estimadas.skus_vendidos.toLocaleString("es-CO")} />
          </div>
          <div className="mt-4 rounded-lg border border-amber-300/80 bg-white/70 p-3 text-sm text-amber-950">
            <p className="font-semibold">Método de atribución: {data.ventas_estimadas.metodo_atribucion.id}</p>
            <p className="mt-1">{data.ventas_estimadas.metodo_atribucion.descripcion}</p>
            <p className="mt-1 text-xs">
              Base con costo conocido: {formatMoneyFull(data.ventas_estimadas.revenue_with_cost)}
              {data.ventas_estimadas.margen_cobertura_pct == null
                ? " · cobertura no disponible"
                : ` · cobertura ${data.ventas_estimadas.margen_cobertura_pct.toFixed(1)}% del revenue estimado`}
              {` · costo disponible para ${data.ventas_estimadas.skus_con_costo} de ${data.ventas_estimadas.skus_vendidos} SKU`}
            </p>
            <p className="mt-2 text-xs leading-relaxed">
              La estimación atribuye las ventas de cada SKU a su proveedor conocido más reciente. No representa ventas facturadas directamente por este proveedor.
            </p>
          </div>
        </Card>
      </section>

      <DocumentHistory
        documents={data.documentos}
        page={data.paginacion.page}
        pageSize={data.paginacion.page_size}
        total={data.paginacion.total_documentos}
        hasMore={data.paginacion.has_more}
        onPageChange={setPage}
      />
    </ProfileFrame>
  );
}

function ProfileFrame({
  nit,
  name,
  children,
}: {
  nit: string;
  name?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="space-y-5">
      <div>
        <Link href={PURCHASES_HREF} className="text-sm text-accent hover:underline">← Volver a compras</Link>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">Perfil del proveedor</p>
        <h1 className="mt-1 text-2xl font-bold text-text-primary">{name ?? "Proveedor"}</h1>
        <p className="mt-1 text-sm text-text-muted">NIT {nit}</p>
      </div>
      {children}
    </div>
  );
}

function DateFilters({
  fechaInicio,
  fechaFin,
  today,
  onStartChange,
  onEndChange,
}: {
  fechaInicio: string;
  fechaFin: string;
  today: string;
  onStartChange: ChangeEventHandler<HTMLInputElement>;
  onEndChange: ChangeEventHandler<HTMLInputElement>;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium text-text-muted">
        Desde
        <input
          type="date"
          aria-label="Desde"
          value={fechaInicio}
          max={fechaFin}
          onChange={onStartChange}
          className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
        />
      </label>
      <label className="text-xs font-medium text-text-muted">
        Hasta
        <input
          type="date"
          aria-label="Hasta"
          value={fechaFin}
          min={fechaInicio}
          max={today}
          onChange={onEndChange}
          className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
        />
      </label>
      <p className="pb-2 text-xs text-text-muted">Rango predeterminado: últimos 12 meses.</p>
    </div>
  );
}

function DateFilterCard(props: {
  fechaInicio: string;
  fechaFin: string;
  today: string;
  onStartChange: ChangeEventHandler<HTMLInputElement>;
  onEndChange: ChangeEventHandler<HTMLInputElement>;
}): JSX.Element {
  return (
    <Card>
      <DateFilters {...props} />
    </Card>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }): JSX.Element {
  return (
    <Card hover={false}>
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-text-primary">{value}</p>
      <p className="mt-1 text-[0.7rem] text-text-muted">{detail}</p>
    </Card>
  );
}

function MetricValue({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-amber-200 bg-white/70 px-3 py-2">
      <p className="text-xs text-amber-900/80">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-amber-950">{value}</p>
    </div>
  );
}

function DocumentHistory({
  documents,
  page,
  pageSize,
  total,
  hasMore,
  onPageChange,
}: {
  documents: ComprasProveedorPerfilDocumento[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  onPageChange: Dispatch<SetStateAction<number>>;
}): JSX.Element {
  return (
    <Card header={
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-text-primary">Documentos de compra</h2>
        <span className="text-xs text-text-muted">{total.toLocaleString("es-CO")} en el período</span>
      </div>
    }>
      {documents.length === 0 ? (
        <p role="status" className="py-8 text-center text-sm text-text-muted">No hay documentos de compra para este proveedor en el período.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Documento</th>
                <th className="px-3 py-2">Clase</th>
                <th className="px-3 py-2 text-right">Productos</th>
                <th className="px-3 py-2 text-right">Total comprado</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <DocumentRow key={`${document.business_date}|${document.cod_clase}|${document.num_documento}`} document={document} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-text-muted" aria-live="polite">Página {page} · {pageSize} por página</p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary enabled:hover:bg-surface-alt disabled:opacity-50"
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={!hasMore}
            onClick={() => onPageChange(page + 1)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary enabled:hover:bg-surface-alt disabled:opacity-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    </Card>
  );
}

function DocumentRow({ document }: { document: ComprasProveedorPerfilDocumento }): JSX.Element {
  const entityId = `${document.business_date}|${document.cod_clase}|${document.num_documento}`;
  const href = purchaseDocumentHrefFromEntityId(entityId);
  return (
    <tr className="border-b border-border/60 last:border-0">
      <td className="px-3 py-2 text-xs text-text-muted">{document.business_date}</td>
      <td className="px-3 py-2 font-medium">
        {href ? (
          <Link href={href} className="text-primary hover:underline">Factura {document.num_documento}</Link>
        ) : (
          <span>Factura {document.num_documento}</span>
        )}
      </td>
      <td className="px-3 py-2 text-text-muted">{document.cod_clase}</td>
      <td className="px-3 py-2 text-right tabular-nums">{document.num_items.toLocaleString("es-CO")}</td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMoneyFull(document.total_factura)}</td>
    </tr>
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
