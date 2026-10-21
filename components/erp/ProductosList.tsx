"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSWRConfig } from "swr";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { MaestroFormNotice } from "@/components/erp/MaestroField";
import { ProductoForm } from "@/components/erp/ProductoForm";
import { useAuthStore } from "@/lib/auth/store";
import { createProducto, updateProducto } from "@/lib/erp/client";
import { ErpApiError } from "@/lib/erp/errors";
import { mapErpErrorToForm, type MasterNotice } from "@/lib/erp/fieldErrors";
import {
  buildProductoCreatePayload,
  buildProductoUpdatePayload,
  emptyProductoForm,
  productoFormFromRecord,
  type ProductoFormState,
} from "@/lib/erp/forms";
import { useProducto, useProductos } from "@/lib/erp/hooks";
import { generateIdempotencyKey } from "@/lib/erp/idempotency";
import {
  detectedPriceLists,
  filterProductsByPriceList,
  mergePriceLists,
} from "@/lib/erp/priceLists";
import {
  validatePriceRows,
  validateProductoValues,
  validateUnitRows,
} from "@/lib/erp/validation";
import { formatMoneyFull } from "@/lib/format/currency";
import { useDebouncedValue } from "@/lib/hooks/debounce";
import { toNumber } from "@/lib/erp/normalize";

const PAGE_SIZE = 25;

type Status = { tone: "ok" | "error"; text: string } | null;

function EstadoProducto({ actprod }: { actprod?: string | null }): JSX.Element {
  const estado = (actprod ?? "A").toUpperCase();
  if (estado === "A") {
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-emerald-800">
        Activo
      </span>
    );
  }
  if (estado === "S") {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-800">
        Suspendido
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-red-800">
      Inactivo
    </span>
  );
}

/**
 * Maestros → Productos: listado con selector de lista de precio y
 * alta/edición del maestro con sus precios, unidades y códigos de barras.
 */
export function ProductosList(): JSX.Element {
  const role = useAuthStore((state) => state.role);
  const canWrite = role === "admin" || role === "gerente";
  const { mutate } = useSWRConfig();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(0);
  const [priceList, setPriceList] = useState("TODAS");
  const offset = page * PAGE_SIZE;

  const { data, error, isLoading } = useProductos({
    search: debouncedSearch,
    limit: PAGE_SIZE,
    offset,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingCodprod, setEditingCodprod] = useState<string | null>(null);
  const [state, setState] = useState<ProductoFormState>(emptyProductoForm());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<MasterNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const idempotencyKey = useRef(generateIdempotencyKey());

  const detail = useProducto(formOpen && editingCodprod ? editingCodprod : null);

  const rows = useMemo(() => data ?? [], [data]);
  const hasNext = rows.length === PAGE_SIZE;

  const priceListOptions = useMemo(
    () =>
      mergePriceLists(detectedPriceLists(rows)).map((option) => ({
        value: option.codlis,
        label: option.label,
      })),
    [rows],
  );

  const filtered = useMemo(
    () => filterProductsByPriceList(rows, priceList),
    [rows, priceList],
  );

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, priceList]);

  // El listado no trae unidades, barras ni precios: hay que cargar la ficha.
  useEffect(() => {
    if (!editingCodprod || !detail.data) return;
    setState(productoFormFromRecord(detail.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingCodprod, detail.data]);

  function openCreate(): void {
    setEditingCodprod(null);
    setState(emptyProductoForm());
    setFieldErrors({});
    setFormMessage(null);
    setNotice(null);
    idempotencyKey.current = generateIdempotencyKey();
    setFormOpen(true);
  }

  function openEdit(codprod: string): void {
    setEditingCodprod(codprod);
    setState(emptyProductoForm());
    setFieldErrors({});
    setFormMessage(null);
    setNotice(null);
    setFormOpen(true);
  }

  function closeForm(): void {
    setFormOpen(false);
    setEditingCodprod(null);
    setFieldErrors({});
    setFormMessage(null);
    setNotice(null);
  }

  async function refresh(): Promise<void> {
    await mutate(
      (key) => Array.isArray(key) && key[0] === "erp-productos",
      undefined,
      { revalidate: true },
    );
  }

  /** Validación de paridad con el maestro heredado (no reemplaza al backend). */
  function localErrors(current: ProductoFormState): Record<string, string> {
    const errors: Record<string, string> = {
      ...validateProductoValues(current.values),
      ...validatePriceRows(current.prices),
      ...validateUnitRows(current.units),
    };
    const seen = new Set<string>();
    current.prices.forEach((row, index) => {
      const codlis = row.codlis.trim().toUpperCase();
      if (!codlis) return;
      if (seen.has(codlis)) {
        errors[`prices[${index}].codlis`] = "La lista ya está cargada en otra fila";
      }
      seen.add(codlis);
    });
    return errors;
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormMessage(null);
    setNotice(null);

    const errors = localErrors(state);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setSubmitting(false);
      return;
    }

    try {
      if (editingCodprod) {
        await updateProducto(editingCodprod, buildProductoUpdatePayload(state));
      } else {
        await createProducto(
          buildProductoCreatePayload(state),
          idempotencyKey.current,
        );
      }
      await refresh();
      closeForm();
      setStatus({
        tone: "ok",
        text: editingCodprod
          ? `Producto ${editingCodprod} actualizado.`
          : `Producto ${state.values.codprod.trim()} creado.`,
      });
    } catch (err) {
      if (err instanceof ErpApiError) {
        const mapped = mapErpErrorToForm(err);
        setFieldErrors(mapped.fields);
        setFormMessage(mapped.message);
        setNotice(mapped.notice);
      } else {
        setFormMessage(
          "No pudimos guardar el producto. Probá de nuevo en un momento.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  function priceFor(product: { pvsini?: string | number | null; pvconi?: string | number | null; prices?: Array<{ codlis: string; pvsini?: string | number | null; pvconi?: string | number | null; venprod?: string | number | null; veniva?: string | number | null }> | null }): number | null {
    if (priceList !== "TODAS") {
      const entry = (product.prices ?? []).find(
        (price) => price.codlis?.trim().toUpperCase() === priceList,
      );
      if (!entry) return null;
      if (entry.pvsini != null) return toNumber(entry.pvsini);
      if (entry.venprod != null) return toNumber(entry.venprod);
      return null;
    }
    if (product.pvsini != null) return toNumber(product.pvsini);
    if (product.pvconi != null) return toNumber(product.pvconi);
    return null;
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Maestros
            </p>
            <h1 className="text-xl font-bold text-text-primary">Productos</h1>
            <p className="mt-1 text-sm text-text-muted">
              Maestro de producto con precios por lista, unidades de venta y
              códigos de barras.
            </p>
          </div>
          {canWrite ? (
            <button
              type="button"
              onClick={openCreate}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:bg-primary/90"
            >
              Nuevo producto
            </button>
          ) : (
            <span className="shrink-0 rounded-lg border border-border bg-surface-alt px-3 py-2 text-xs font-semibold text-text-muted">
              Sólo lectura
            </span>
          )}
        </div>
      </Card>

      {status ? (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${
            status.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {status.text}
        </p>
      ) : null}

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-xs text-text-muted">
            Buscar por código o nombre
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Código o nombre..."
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            />
          </label>
          <label className="min-w-0 text-xs text-text-muted">
            Lista de precio
            <select
              value={priceList}
              onChange={(event) => setPriceList(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            >
              <option value="TODAS">Todas las listas</option>
              {priceListOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        {filtered.pricesUnavailable ? (
          <p className="mt-2 text-xs text-text-muted">
            El listado no trae los precios por lista: abrí un producto para verlos.
          </p>
        ) : null}
      </Card>

      <Card
        header={
          <h2 className="text-sm font-semibold text-text-primary">
            Productos {data ? `(${filtered.rows.length})` : ""}
          </h2>
        }
      >
        {isLoading && !data ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <ErrorState
            title="No pudimos cargar los productos"
            message="Probá de nuevo en un momento."
            severity="warning"
            action={
              <button
                type="button"
                onClick={() => {
                  void refresh();
                }}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-text-primary hover:bg-surface-alt"
              >
                Reintentar
              </button>
            }
          />
        ) : filtered.rows.length === 0 ? (
          <EmptyState
            title="Sin productos"
            description={
              debouncedSearch
                ? `No encontramos productos para "${debouncedSearch}".`
                : "Todavía no hay productos cargados en este negocio."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">Código</th>
                  <th className="px-2 py-2 font-medium">Nombre</th>
                  <th className="px-2 py-2 font-medium">Unidad</th>
                  <th className="px-2 py-2 font-medium">Estado</th>
                  <th className="px-2 py-2 text-right font-medium">Precio</th>
                  <th className="px-2 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.rows.map((row) => {
                  const price = priceFor(row);
                  return (
                    <tr
                      key={row.codprod}
                      className="border-b border-border/70 last:border-0"
                    >
                      <td className="px-2 py-3 font-mono text-xs text-text-secondary">
                        {row.codprod}
                      </td>
                      <td className="px-2 py-3 font-medium text-text-primary">
                        {row.nomprod || "—"}
                      </td>
                      <td className="px-2 py-3 text-text-secondary">
                        {row.codmed || "—"}
                      </td>
                      <td className="px-2 py-3">
                        <EstadoProducto actprod={row.actprod} />
                      </td>
                      <td className="px-2 py-3 text-right tabular-nums text-text-secondary">
                        {price === null ? "—" : formatMoneyFull(price)}
                      </td>
                      <td className="px-2 py-3 text-right">
                        {canWrite ? (
                          <button
                            type="button"
                            onClick={() => openEdit(row.codprod)}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            Editar
                          </button>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-3">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            disabled={page === 0}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-xs text-text-muted">Página {page + 1}</span>
          <button
            type="button"
            onClick={() => setPage((value) => value + 1)}
            disabled={!hasNext}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </Card>

      <Modal
        isOpen={formOpen}
        onClose={closeForm}
        title={
          editingCodprod ? `Editar producto ${editingCodprod}` : "Nuevo producto"
        }
        maxWidth="max-w-5xl"
      >
        <form onSubmit={submit} className="space-y-4">
          {formMessage ? (
            <MaestroFormNotice
              title={notice ? `Maestro ${notice.label}` : "No pudimos guardar"}
              message={formMessage}
              tone={notice ? "warning" : "error"}
            />
          ) : null}

          {editingCodprod && !detail.data && !detail.error ? (
            <p className="text-sm text-text-muted">Cargando la ficha del producto…</p>
          ) : null}

          <ProductoForm
            state={state}
            onChange={setState}
            errors={fieldErrors}
            editing={editingCodprod !== null}
          />

          <div className="flex items-center gap-3 border-t border-border pt-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60"
            >
              {submitting
                ? "Guardando…"
                : editingCodprod
                  ? "Guardar cambios"
                  : "Crear producto"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg bg-surface-alt px-3 py-2 text-sm text-text-secondary"
            >
              Cancelar
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
