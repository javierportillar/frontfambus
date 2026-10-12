"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CLIENTES_DEFAULT_PAGE_SIZE,
  useClientes,
  type ClienteItem,
  type ClienteSortBy,
} from "@/lib/api/hooks";
import { customerProfileHref } from "@/lib/clientes/routes";
import { isValidBusinessDate } from "@/lib/compras/routes";
import { businessDateISO, shiftDateISO } from "@/lib/date/business";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";

type Shortcut = "3m" | "12m" | "anio" | "todo";

function todayISO(): string {
  return businessDateISO();
}

function startOfYear(date: string): string {
  return `${date.slice(0, 4)}-01-01`;
}

function rangeFromShortcut(shortcut: Shortcut): { ini: string; fin: string } {
  const fin = todayISO();
  switch (shortcut) {
    case "3m": return { ini: shiftDateISO(fin, -90), fin };
    case "12m": return { ini: shiftDateISO(fin, -365), fin };
    case "anio": return { ini: startOfYear(fin), fin };
    case "todo": return { ini: "2020-01-01", fin };
  }
}

const SHORTCUT_LABELS: ReadonlyArray<readonly [Shortcut, string]> = [
  ["3m", "3 meses"],
  ["12m", "12 meses"],
  ["anio", "Año actual"],
  ["todo", "Todo"],
];

const SORT_LABELS: ReadonlyArray<readonly [ClienteSortBy, string]> = [
  ["ventas", "Mayor venta"],
  ["facturas", "Más facturas"],
  ["ticket_promedio", "Mayor ticket"],
  ["ultima_compra", "Compra más reciente"],
];

function formatPct(ratio: number | null | undefined): string {
  return ratio == null ? "—" : `${(ratio * 100).toFixed(1)}%`;
}

function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

export function ClientesIndex({
  initialFechaInicio,
  initialFechaFin,
  initialQuery,
}: {
  initialFechaInicio?: string;
  initialFechaFin?: string;
  initialQuery?: string;
} = {}): JSX.Element {
  const [shortcut, setShortcut] = useState<Shortcut>("12m");
  const [range, setRange] = useState(() => {
    const fallback = rangeFromShortcut("12m");
    const ini = initialFechaInicio && isValidBusinessDate(initialFechaInicio) ? initialFechaInicio : fallback.ini;
    const fin = initialFechaFin && isValidBusinessDate(initialFechaFin) ? initialFechaFin : fallback.fin;
    return ini <= fin ? { ini, fin } : fallback;
  });
  const [queryInput, setQueryInput] = useState(initialQuery ?? "");
  const [sortBy, setSortBy] = useState<ClienteSortBy>("ventas");
  const [page, setPage] = useState(1);

  const query = useDebouncedValue(queryInput, 300);
  const { data, error, isLoading, mutate } = useClientes(range.ini, range.fin, {
    query,
    page,
    pageSize: CLIENTES_DEFAULT_PAGE_SIZE,
    sortBy,
    sortOrder: "desc",
  });

  function applyShortcut(next: Shortcut): void {
    setShortcut(next);
    setRange(rangeFromShortcut(next));
    setPage(1);
  }

  const resumen = data?.resumen;
  const items = data?.items ?? [];
  const paginacion = data?.paginacion;
  const totalPaginas = paginacion?.total_paginas ?? 0;

  const profileHref = useMemo(
    () => (customerId: string) => {
      const params = new URLSearchParams({ fecha_inicio: range.ini, fecha_fin: range.fin });
      if (query.trim()) params.set("q", query.trim());
      return `${customerProfileHref(customerId)}?${params.toString()}`;
    },
    [range.ini, range.fin, query],
  );

  const participar = useMemo(() => {
    const identificadas = resumen?.ventas_identificadas ?? 0;
    return (item: ClienteItem) => (
      identificadas > 0 ? item.ventas_total / identificadas : null
    );
  }, [resumen?.ventas_identificadas]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Sección</p>
        <h1 className="text-xl font-bold leading-tight text-text-primary sm:text-2xl">Clientes</h1>
        <p className="text-sm text-text-muted">
          Mejores clientes por ventas facturadas válidas del período, con su ficha, productos más
          comprados y facturas.
        </p>
      </div>

      <Card>
        <div role="group" aria-label="Rangos de fecha" className="flex flex-wrap gap-2">
          {SHORTCUT_LABELS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => applyShortcut(key)}
              aria-pressed={shortcut === key}
              className={`min-h-9 rounded-lg px-3 py-1.5 text-xs font-medium ${
                shortcut === key
                  ? "bg-surface-dark text-text-inverse"
                  : "bg-surface-alt text-text-secondary hover:bg-surface-alt/70"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="min-w-0 text-xs text-text-muted">
            Desde
            <input
              type="date"
              value={range.ini}
              max={range.fin}
              onChange={(e) => { setShortcut("12m"); setRange((r) => ({ ...r, ini: e.target.value })); setPage(1); }}
              className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="min-w-0 text-xs text-text-muted">
            Hasta
            <input
              type="date"
              value={range.fin}
              min={range.ini}
              max={todayISO()}
              onChange={(e) => { setShortcut("12m"); setRange((r) => ({ ...r, fin: e.target.value })); setPage(1); }}
              className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="min-w-0 text-xs text-text-muted">
            Buscar
            <input
              type="search"
              value={queryInput}
              onChange={(e) => { setQueryInput(e.target.value); setPage(1); }}
              aria-label="Buscar cliente por nombre o documento"
              placeholder="Nombre o documento..."
              className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
        </div>
      </Card>

      {isLoading && !data ? (
        <Card><Skeleton className="h-64 rounded-lg" /></Card>
      ) : error ? (
        <Card>
          <div role="alert" className="py-8 text-center">
            <p className="text-sm font-semibold text-error">
              No pudimos cargar los clientes. Probá de nuevo en un momento.
            </p>
            <button
              type="button"
              onClick={() => void mutate()}
              className="mt-3 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-surface-alt"
            >
              Reintentar
            </button>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Card><Stat label="Clientes identificados" value={(resumen?.clientes_identificados ?? 0).toLocaleString("es-CO")} subtitle="en el período" /></Card>
            <Card><Stat label="Ventas identificadas" value={formatMoneyFull(resumen?.ventas_identificadas ?? 0)} subtitle="facturado a clientes con documento" /></Card>
            <Card><Stat label="Ticket promedio" value={formatMoneyFull(resumen?.ticket_promedio_global ?? 0)} subtitle="por factura identificada" /></Card>
            <Card><Stat label="Top 10 ventas" value={formatMoneyFull(resumen?.top10_ventas_suma ?? 0)} subtitle="suma del top 10" /></Card>
            <Card><Stat label="Top 10 participación" value={formatPct(resumen?.top10_participacion)} subtitle="del total facturado válido" /></Card>
            <Card>
              <Stat
                label="Sin identificar"
                value={formatMoneyFull(resumen?.ventas_sin_identificar ?? 0)}
                subtitle={`${(resumen?.facturas_sin_identificar ?? 0).toLocaleString("es-CO")} facturas sin documento`}
              />
            </Card>
          </div>

          <Card header={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-text-primary">Ranking de clientes</h2>
              <label className="text-xs text-text-muted">
                Ordenar por
                <select
                  aria-label="Ordenar clientes"
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value as ClienteSortBy); setPage(1); }}
                  className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm sm:mt-0 sm:ml-2 sm:inline-block sm:w-auto"
                >
                  {SORT_LABELS.map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
          }>
            {items.length === 0 ? (
              <p role="status" className="py-8 text-center text-sm text-text-muted">
                No hay clientes identificados para este período y búsqueda.
              </p>
            ) : (
              <>
                <ul aria-label="Clientes del período" className="space-y-2 lg:hidden">
                  {items.map((item) => (
                    <ClienteRowMobile key={item.customer_id} item={item} href={profileHref(item.customer_id)} participacion={participar(item)} />
                  ))}
                </ul>
                <div className="hidden overflow-x-auto lg:block">
                  <table aria-label="Clientes del período" className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-alt text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                        <th className="py-2 px-3">Cliente</th>
                        <th className="py-2 px-3 text-right">Ventas</th>
                        <th className="py-2 px-3 text-right">Facturas</th>
                        <th className="py-2 px-3 text-right">Ticket promedio</th>
                        <th className="py-2 px-3 text-right">% identificado</th>
                        <th className="py-2 px-3">Última compra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <ClienteRowDesktop key={item.customer_id} item={item} href={profileHref(item.customer_id)} participacion={participar(item)} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-text-muted" aria-live="polite">
                {totalPaginas > 0 ? `Página ${page} de ${totalPaginas}` : "Sin resultados"} ·{" "}
                {(paginacion?.total_filas ?? 0).toLocaleString("es-CO")} clientes
              </p>
              <div className="flex w-full gap-2 sm:w-auto">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="min-h-11 flex-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary enabled:hover:bg-surface-alt disabled:opacity-50 sm:flex-none"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={totalPaginas === 0 || page >= totalPaginas}
                  onClick={() => setPage((p) => p + 1)}
                  className="min-h-11 flex-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-secondary enabled:hover:bg-surface-alt disabled:opacity-50 sm:flex-none"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function ClienteRowMobile({
  item,
  href,
  participacion,
}: {
  item: ClienteItem;
  href: string;
  participacion: number | null;
}): JSX.Element {
  return (
    <li className="min-w-0 rounded-lg border border-border bg-surface p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={href} className="break-words text-sm font-semibold leading-snug text-primary hover:underline">
            {item.nombre_canonico}
          </Link>
          <p className="mt-1 break-all font-mono text-xs text-text-muted">{item.customer_id}</p>
        </div>
        <p className="shrink-0 text-right text-sm font-bold tabular-nums text-text-primary">
          {formatMoneyFull(item.ventas_total)}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-border/70 pt-2 text-xs">
        <div>
          <dt className="text-text-muted">Facturas</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{item.facturas.toLocaleString("es-CO")}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Ticket prom.</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{formatMoneyFull(item.ticket_promedio)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">% identificado</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{formatPct(participacion)}</dd>
        </div>
        <div className="col-span-3">
          <dt className="text-text-muted">Última compra</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-text-primary">{item.ultima_compra ?? "—"}</dd>
        </div>
      </dl>
    </li>
  );
}

function ClienteRowDesktop({
  item,
  href,
  participacion,
}: {
  item: ClienteItem;
  href: string;
  participacion: number | null;
}): JSX.Element {
  return (
    <tr className="border-b border-border/60 hover:bg-surface-alt">
      <td className="py-2 px-3">
        <div className="min-w-0">
          <Link href={href} className="font-medium text-primary hover:underline">
            {item.nombre_canonico}
          </Link>
          <p className="break-all font-mono text-xs text-text-muted">{item.customer_id}</p>
        </div>
      </td>
      <td className="py-2 px-3 text-right font-semibold tabular-nums">{formatMoneyFull(item.ventas_total)}</td>
      <td className="py-2 px-3 text-right tabular-nums">{item.facturas.toLocaleString("es-CO")}</td>
      <td className="py-2 px-3 text-right tabular-nums">{formatMoneyFull(item.ticket_promedio)}</td>
      <td className="py-2 px-3 text-right tabular-nums text-text-muted">{formatPct(participacion)}</td>
      <td className="py-2 px-3 text-xs text-text-muted">{item.ultima_compra ?? "—"}</td>
    </tr>
  );
}
