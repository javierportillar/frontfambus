"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useComprasBuscar } from "@/lib/api/hooks";
import { businessDateISO } from "@/lib/date/business";
import { isValidBusinessDate, purchaseDocumentHref } from "@/lib/compras/routes";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

const PAGE_SIZE = 20;

function yearsBefore(date: string, years: number): string {
  const [year = "0", month = "1", day = "1"] = date.split("-");
  const targetYear = Number(year) - years;
  const monthIndex = Number(month) - 1;
  const lastDay = new Date(Date.UTC(targetYear, monthIndex + 1, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(Math.min(Number(day), lastDay)).padStart(2, "0")}`;
}

export function BuscarComprasTab(): JSX.Element {
  const today = businessDateISO();
  const [queryInput, setQueryInput] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [fechaInicio, setFechaInicio] = useState(() => yearsBefore(today, 1));
  const [fechaFin, setFechaFin] = useState(today);
  const [page, setPage] = useState(1);
  const rangeIsValid = isValidBusinessDate(fechaInicio)
    && isValidBusinessDate(fechaFin)
    && fechaInicio <= fechaFin
    && fechaFin <= today
    && fechaInicio >= yearsBefore(fechaFin, 10);
  const normalizedQuery = queryInput.trim();
  const { data, error, isLoading, mutate } = useComprasBuscar(
    rangeIsValid ? submittedQuery : "",
    fechaInicio,
    fechaFin,
    page,
    PAGE_SIZE,
  );

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!rangeIsValid || normalizedQuery.length < 2 || normalizedQuery.length > 100) return;
    setPage(1);
    setSubmittedQuery(normalizedQuery);
  };

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(16rem,1fr)_auto_auto] md:items-end">
            <label className="text-xs font-medium text-text-muted">
              Proveedor, producto, SKU o número de factura
              <input
                type="search"
                aria-label="Buscar proveedor, producto, SKU o número de factura"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                maxLength={100}
                placeholder="Ej.: MIELI, yogur o 194"
                className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              />
            </label>
            <label className="text-xs font-medium text-text-muted">
              Desde
              <input
                type="date"
                aria-label="Desde"
                value={fechaInicio}
                max={fechaFin}
                onChange={(event) => { setFechaInicio(event.target.value); setPage(1); }}
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
                onChange={(event) => { setFechaFin(event.target.value); setPage(1); }}
                className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              />
            </label>
          </div>
          {!rangeIsValid ? (
            <p role="alert" className="text-sm text-error">
              Elegí un rango válido de hasta 10 años, sin fechas futuras.
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-snug text-text-muted">Rango predeterminado: últimos 12 meses. La búsqueda incluye proveedores, productos y documentos válidos.</p>
            <button
              type="submit"
              disabled={!rangeIsValid || normalizedQuery.length < 2}
              className="min-h-11 w-full rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              Buscar compras
            </button>
          </div>
        </form>
      </Card>

      {isLoading && submittedQuery && rangeIsValid ? (
        <div role="status" aria-label="Buscando compras" className="space-y-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : null}

      {error && rangeIsValid ? (
        <Card>
          <div role="alert" className="py-6 text-center">
            <p className="text-sm font-semibold text-error">No pudimos buscar las compras.</p>
            <button type="button" onClick={() => void mutate()} className="mt-2 text-sm text-accent hover:underline">
              Reintentar
            </button>
          </div>
        </Card>
      ) : null}

      {data && submittedQuery && rangeIsValid && !error ? (
        <Card header={
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold text-text-primary">Resultados para “{data.query}”</h2>
            <p className="text-xs text-text-muted">
              {data.paginacion.total_documentos.toLocaleString("es-CO")} documentos · {data.periodo.fecha_inicio} a {data.periodo.fecha_fin}
            </p>
          </div>
        }>
          {data.documentos.length === 0 ? (
            <p role="status" className="py-8 text-center text-sm text-text-muted">
              No encontramos compras que coincidan con “{data.query}” en ese período.
            </p>
          ) : (
            <div className="space-y-2">
              {data.documentos.map((document) => (
                <Link
                  key={`${document.business_date}|${document.cod_clase}|${document.num_documento}`}
                  href={purchaseDocumentHref(document.business_date, document.cod_clase, document.num_documento)}
                  aria-label={`Abrir factura ${document.num_documento} clase ${document.cod_clase} de ${document.nombre_proveedor}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-3 hover:bg-surface-alt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-text-primary">Factura {document.num_documento}</span>
                      <span className="rounded-full bg-surface-alt px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-text-muted">
                        Coincidencia por {document.tipo_coincidencia}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-sm text-text-secondary">
                      {document.nombre_proveedor} · NIT {document.nit_proveedor ?? "—"}
                    </p>
                    {document.productos_coincidentes ? (
                      <p className="mt-1 truncate text-xs text-text-muted">
                        Producto: {document.productos_coincidentes}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-text-primary">
                      {formatMoneyFull(document.total_factura)}
                    </p>
                    <p className="text-xs text-text-muted">
                      {document.business_date} · clase {document.cod_clase} · {document.num_items} productos
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-text-muted" aria-live="polite">
              Página {page} · {PAGE_SIZE} por página
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
                className="min-h-11 flex-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary enabled:hover:bg-surface-alt disabled:opacity-50 sm:flex-none"
              >Anterior</button>
              <button
                type="button"
                disabled={!data.paginacion.has_more}
                onClick={() => setPage((current) => current + 1)}
                className="min-h-11 flex-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary enabled:hover:bg-surface-alt disabled:opacity-50 sm:flex-none"
              >Siguiente</button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
