"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAnalisisProveedores, type ProveedorAnalisis } from "@/lib/api/hooks";
import { supplierProfileHref } from "@/lib/compras/routes";
import { businessDateISO, shiftDateISO } from "@/lib/date/business";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";

type Shortcut = "3m" | "12m" | "anio" | "todo";
type SortKey = "monto" | "nombre" | "reciente";

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

function formatPct(value: number | null | undefined): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

export function ProveedoresIndex(): JSX.Element {
  const [shortcut, setShortcut] = useState<Shortcut>("12m");
  const [range, setRange] = useState(() => rangeFromShortcut("12m"));
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("monto");

  const { data, error, isLoading } = useAnalisisProveedores(range.ini, range.fin);

  function applyShortcut(next: Shortcut): void {
    setShortcut(next);
    setRange(rangeFromShortcut(next));
  }

  const proveedores = useMemo(() => {
    const rows = data?.proveedores ?? [];
    const q = query.trim().toLocaleLowerCase("es-CO");
    const filtered = q
      ? rows.filter((p) => (
        p.nombre.toLocaleLowerCase("es-CO").includes(q) || (p.nit ?? "").includes(q)
      ))
      : rows;
    return [...filtered].sort((a, b) => {
      if (sort === "nombre") return a.nombre.localeCompare(b.nombre, "es-CO");
      if (sort === "reciente") return (b.ultima_compra ?? "").localeCompare(a.ultima_compra ?? "");
      return b.total_compras - a.total_compras;
    });
  }, [data, query, sort]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Sección</p>
        <h1 className="text-xl font-bold leading-tight text-text-primary sm:text-2xl">Proveedores</h1>
        <p className="text-sm text-text-muted">
          Qué le compraste a cada proveedor, con su ficha, margen estimado y concentración del gasto.
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
              onChange={(e) => { setShortcut("12m"); setRange((r) => ({ ...r, ini: e.target.value })); }}
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
              onChange={(e) => { setShortcut("12m"); setRange((r) => ({ ...r, fin: e.target.value })); }}
              className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
          <label className="min-w-0 text-xs text-text-muted">
            Buscar
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar proveedor o NIT"
              placeholder="Nombre o NIT..."
              className="mt-1 block w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            />
          </label>
        </div>
      </Card>

      {isLoading && !data ? (
        <Card><Skeleton className="h-64 rounded-lg" /></Card>
      ) : error ? (
        <Card>
          <p role="alert" className="py-8 text-center text-sm text-error">
            No pudimos cargar los proveedores. Probá de nuevo en un momento.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card><Stat label="Proveedores" value={(data?.total_proveedores ?? 0).toLocaleString("es-CO")} subtitle="en el período" /></Card>
            <Card><Stat label="Total comprado" value={formatMoneyFull(data?.total_compras ?? 0)} subtitle="a proveedores" /></Card>
            <Card><Stat label="Concentración top 1" value={formatPct(data?.concentracion.top1_pct)} subtitle={`riesgo ${data?.concentracion.riesgo ?? "—"}`} /></Card>
            <Card><Stat label="Top 5" value={formatPct(data?.concentracion.top5_pct)} subtitle="del gasto total" /></Card>
          </div>

          <Card header={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-text-primary">
                {proveedores.length} proveedor{proveedores.length === 1 ? "" : "es"}
              </h2>
              <label className="text-xs text-text-muted">
                Ordenar por{" "}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                >
                  <option value="monto">Monto comprado</option>
                  <option value="nombre">Nombre (A-Z)</option>
                  <option value="reciente">Última compra</option>
                </select>
              </label>
            </div>
          }>
            {proveedores.length === 0 ? (
              <p role="status" className="py-8 text-center text-sm text-text-muted">
                Sin proveedores en el período seleccionado.
              </p>
            ) : (
              <>
                <ul aria-label="Proveedores del período" className="space-y-2 lg:hidden">
                  {proveedores.map((p) => (
                    <ProveedorRowMobile key={p.nit} proveedor={p} />
                  ))}
                </ul>
                <div className="hidden overflow-x-auto lg:block">
                  <table aria-label="Proveedores del período" className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-alt text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                        <th className="py-2 px-3">Proveedor</th>
                        <th className="py-2 px-3">NIT</th>
                        <th className="py-2 px-3 text-right">Documentos</th>
                        <th className="py-2 px-3 text-right">Total comprado</th>
                        <th className="py-2 px-3 text-right">% del total</th>
                        <th className="py-2 px-3">Última compra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {proveedores.map((p) => (
                        <ProveedorRowDesktop key={p.nit} proveedor={p} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function ProveedorRowMobile({ proveedor }: { proveedor: ProveedorAnalisis }): JSX.Element {
  return (
    <li className="min-w-0 rounded-lg border border-border bg-surface p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={supplierProfileHref(proveedor.nit)}
            className="break-words text-sm font-semibold leading-snug text-primary hover:underline"
          >
            {proveedor.nombre}
          </Link>
          <p className="mt-1 break-all font-mono text-xs text-text-muted">NIT {proveedor.nit}</p>
        </div>
        <p className="shrink-0 text-right text-sm font-bold tabular-nums text-text-primary">
          {formatMoneyFull(proveedor.total_compras)}
        </p>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-border/70 pt-2 text-xs">
        <div>
          <dt className="text-text-muted">Documentos</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{proveedor.num_documentos.toLocaleString("es-CO")}</dd>
        </div>
        <div>
          <dt className="text-text-muted">% del total</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{formatPct(proveedor.pct_del_total)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Última compra</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-text-primary">{proveedor.ultima_compra ?? "—"}</dd>
        </div>
      </dl>
    </li>
  );
}

function ProveedorRowDesktop({ proveedor }: { proveedor: ProveedorAnalisis }): JSX.Element {
  return (
    <tr className="border-b border-border/60 hover:bg-surface-alt">
      <td className="py-2 px-3 font-medium text-text-primary">
        <Link href={supplierProfileHref(proveedor.nit)} className="text-primary hover:underline">
          {proveedor.nombre}
        </Link>
      </td>
      <td className="py-2 px-3 text-text-muted">{proveedor.nit}</td>
      <td className="py-2 px-3 text-right tabular-nums">{proveedor.num_documentos.toLocaleString("es-CO")}</td>
      <td className="py-2 px-3 text-right tabular-nums font-semibold">{formatMoneyFull(proveedor.total_compras)}</td>
      <td className="py-2 px-3 text-right tabular-nums text-text-muted">{formatPct(proveedor.pct_del_total)}</td>
      <td className="py-2 px-3 text-xs text-text-muted">{proveedor.ultima_compra ?? "—"}</td>
    </tr>
  );
}
