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
import { TerceroForm } from "@/components/erp/TerceroForm";
import { useAuthStore } from "@/lib/auth/store";
import { createTercero, updateTercero } from "@/lib/erp/client";
import { ErpApiError } from "@/lib/erp/errors";
import { mapErpErrorToForm, type MasterNotice } from "@/lib/erp/fieldErrors";
import {
  buildTerceroCreatePayload,
  buildTerceroUpdatePayload,
  emptyTerceroValues,
  terceroValuesFromRecord,
} from "@/lib/erp/forms";
import { useTerceros, useTercero } from "@/lib/erp/hooks";
import { generateIdempotencyKey } from "@/lib/erp/idempotency";
import { validateTerceroValues } from "@/lib/erp/validation";
import type { TerceroFormValues } from "@/lib/erp/validation";
import { useDebouncedValue } from "@/lib/hooks/debounce";

const PAGE_SIZE = 25;

type Status = { tone: "ok" | "error"; text: string } | null;

function displayName(row: {
  nomcom?: string | null;
  nomter?: string | null;
  razsoc?: string | null;
}): string {
  return row.nomcom || row.razsoc || row.nomter || "—";
}

function EstadoTercero({
  cupblo,
  inater,
}: {
  cupblo?: string | null;
  inater?: string | null;
}): JSX.Element {
  if ((inater ?? "").toUpperCase() === "SI") {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-800">
        Inactivo
      </span>
    );
  }
  if ((cupblo ?? "").toUpperCase() === "B") {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-red-800">
        Bloqueado por cartera
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[0.6875rem] font-semibold text-emerald-800">
      Activo
    </span>
  );
}

/**
 * Maestros → Terceros: listado paginado con búsqueda y alta/edición.
 *
 * La escritura la restringe el backend a `admin`/`gerente`
 * (`require_erp_masters_write`); acá sólo se ocultan los controles para
 * que el rol de sólo lectura no vea botones que el API va a rechazar.
 */
export function TercerosList(): JSX.Element {
  const role = useAuthStore((state) => state.role);
  const canWrite = role === "admin" || role === "gerente";
  const { mutate } = useSWRConfig();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(0);
  const offset = page * PAGE_SIZE;

  const { data, error, isLoading } = useTerceros({
    search: debouncedSearch,
    limit: PAGE_SIZE,
    offset,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingNitter, setEditingNitter] = useState<string | null>(null);
  const [values, setValues] = useState<TerceroFormValues>(emptyTerceroValues());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<MasterNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const idempotencyKey = useRef(generateIdempotencyKey());

  const detail = useTercero(formOpen && editingNitter ? editingNitter : null);

  const rows = useMemo(() => data ?? [], [data]);
  const hasNext = rows.length === PAGE_SIZE;

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  // Carga la ficha completa del tercero: el listado no trae todos los
  // campos (el repo real devuelve una proyección) ni los correos.
  useEffect(() => {
    if (!editingNitter || !detail.data) return;
    setValues(terceroValuesFromRecord(detail.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingNitter, detail.data]);

  function openCreate(): void {
    setEditingNitter(null);
    setValues(emptyTerceroValues());
    setFieldErrors({});
    setFormMessage(null);
    setNotice(null);
    idempotencyKey.current = generateIdempotencyKey();
    setFormOpen(true);
  }

  function openEdit(nitter: string): void {
    setEditingNitter(nitter);
    setValues(emptyTerceroValues());
    setFieldErrors({});
    setFormMessage(null);
    setNotice(null);
    setFormOpen(true);
  }

  function closeForm(): void {
    setFormOpen(false);
    setEditingNitter(null);
    setFieldErrors({});
    setFormMessage(null);
    setNotice(null);
  }

  async function refresh(): Promise<void> {
    await mutate(
      (key) => Array.isArray(key) && key[0] === "erp-terceros",
      undefined,
      { revalidate: true },
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});
    setFormMessage(null);
    setNotice(null);

    // Paridad con el maestro heredado: acorta el ida y vuelta, pero el
    // backend sigue siendo la autoridad.
    const localErrors = validateTerceroValues(values);
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      setSubmitting(false);
      return;
    }

    try {
      if (editingNitter) {
        await updateTercero(editingNitter, buildTerceroUpdatePayload(values));
      } else {
        await createTercero(
          buildTerceroCreatePayload(values),
          idempotencyKey.current,
        );
      }
      await refresh();
      closeForm();
      setStatus({
        tone: "ok",
        text: editingNitter
          ? `Tercero ${editingNitter} actualizado.`
          : `Tercero ${values.nitter.trim()} creado.`,
      });
    } catch (err) {
      if (err instanceof ErpApiError) {
        const mapped = mapErpErrorToForm(err);
        setFieldErrors(mapped.fields);
        setFormMessage(mapped.message);
        setNotice(mapped.notice);
      } else {
        setFormMessage(
          "No pudimos guardar el tercero. Probá de nuevo en un momento.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Maestros
            </p>
            <h1 className="text-xl font-bold text-text-primary">Terceros</h1>
            <p className="mt-1 text-sm text-text-muted">
              Alta y edición de clientes y proveedores. Los cambios quedan
              disponibles de inmediato para el escritorio (mismas tablas).
            </p>
          </div>
          {canWrite ? (
            <button
              type="button"
              onClick={openCreate}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:bg-primary/90"
            >
              Nuevo tercero
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
        <label className="block text-xs text-text-muted">
          Buscar por identificación o nombre
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder="NIT, cédula o nombre..."
            className="mt-1 block w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          />
        </label>
      </Card>

      <Card
        header={
          <h2 className="text-sm font-semibold text-text-primary">
            Terceros {data ? `(${rows.length})` : ""}
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
            title="No pudimos cargar los terceros"
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
        ) : rows.length === 0 ? (
          <EmptyState
            title="Sin terceros"
            description={
              debouncedSearch
                ? `No encontramos terceros para "${debouncedSearch}".`
                : "Todavía no hay terceros cargados en este negocio."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">Identificación</th>
                  <th className="px-2 py-2 font-medium">Nombre</th>
                  <th className="px-2 py-2 font-medium">Teléfono</th>
                  <th className="px-2 py-2 font-medium">Estado</th>
                  <th className="px-2 py-2 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.nitter} className="border-b border-border/70 last:border-0">
                    <td className="px-2 py-3 font-mono text-xs text-text-secondary">
                      {row.nitter}
                    </td>
                    <td className="px-2 py-3 font-medium text-text-primary">
                      {displayName(row)}
                    </td>
                    <td className="px-2 py-3 text-text-secondary">{row.telter || "—"}</td>
                    <td className="px-2 py-3">
                      <EstadoTercero cupblo={row.cupblo} inater={row.inater} />
                    </td>
                    <td className="px-2 py-3 text-right">
                      {canWrite ? (
                        <button
                          type="button"
                          onClick={() => openEdit(row.nitter)}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          Editar
                        </button>
                      ) : (
                        <span className="text-xs text-text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
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
        title={editingNitter ? `Editar tercero ${editingNitter}` : "Nuevo tercero"}
        maxWidth="max-w-4xl"
      >
        <form onSubmit={submit} className="space-y-4">
          {formMessage ? (
            <MaestroFormNotice
              title={notice ? `Maestro ${notice.label}` : "No pudimos guardar"}
              message={formMessage}
              tone={notice ? "warning" : "error"}
            />
          ) : null}

          {editingNitter && !detail.data && !detail.error ? (
            <p className="text-sm text-text-muted">Cargando la ficha del tercero…</p>
          ) : null}

          <TerceroForm
            values={values}
            onChange={setValues}
            errors={fieldErrors}
            editing={editingNitter !== null}
          />

          <div className="flex items-center gap-3 border-t border-border pt-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60"
            >
              {submitting
                ? "Guardando…"
                : editingNitter
                  ? "Guardar cambios"
                  : "Crear tercero"}
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
