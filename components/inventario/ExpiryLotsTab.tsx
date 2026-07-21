"use client";

import { type FormEvent, useMemo, useRef, useState } from "react";
import { apiFetch, apiFetchJson } from "@/lib/api/client";
import { IdempotentMutation } from "@/lib/api/idempotentMutation";
import {
  type ExpiryLot,
  useExpiryLots,
  useComprasPorProveedor,
  useComprasProveedorDetalle,
} from "@/lib/api/hooks";
import { daysUntilExpiry, formatExpiryDate, getExpiryBand } from "@/lib/inventory/expiry";
import { useAuthStore } from "@/lib/auth/store";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

// Rango para poblar proveedores/facturas desde las compras reales de MasVital.
// Últimos 12 meses: cubre las compras recientes sin traer histórico completo.
function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

type CaducidadForm = {
  product_sku: string;
  purchase_order_ref: string;
  lot_code: string;
  expires_on: string;
  received_on: string;
  received_quantity: string;
  supplier: string;
  notes: string;
};

const EMPTY_FORM: CaducidadForm = {
  product_sku: "",
  purchase_order_ref: "",
  lot_code: "",
  expires_on: "",
  received_on: new Date().toISOString().slice(0, 10),
  received_quantity: "",
  supplier: "",
  notes: "",
};

function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

function formatQuantity(quantity: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 }).format(quantity);
}

function errorMessage(error: unknown, fallback: string): string {
  // apiFetchJson deliberately includes the server response for debugging. Do
  // not put that raw text in the UI: it may contain implementation details.
  return error instanceof Error && error.message.includes(" 403 ")
    ? "No tenés permiso para realizar esta operación."
    : fallback;
}

export function ExpiryLotsTab(): JSX.Element {
  const role = useAuthStore((s) => s.role);
  const canCreate = role === "admin" || role === "gerente" || role === "vendedor";
  const canManage = role === "admin" || role === "gerente";
  const { data, error, isLoading, mutate } = useExpiryLots();
  const [form, setForm] = useState<CaducidadForm>(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingLotId, setDeletingLotId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const receiptMutation = useRef<IdempotentMutation | null>(null);
  const receiptMutationHandler =
    receiptMutation.current ?? (receiptMutation.current = new IdempotentMutation(newIdempotencyKey));

  // ── Cascade proveedor → factura → producto (compras reales de MasVital) ──
  const rangoIni = useMemo(() => isoDaysAgo(365), []);
  const rangoFin = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selNit, setSelNit] = useState("");
  const [selDoc, setSelDoc] = useState("");
  const proveedores = useComprasPorProveedor(rangoIni, rangoFin);
  const detalle = useComprasProveedorDetalle(selNit ? selNit : null, rangoIni, rangoFin);
  const provList = useMemo(
    () => (proveedores.data?.proveedores ?? []).filter((p) => !!p.nit),
    [proveedores.data],
  );
  const docList = useMemo(() => detalle.data?.documentos ?? [], [detalle.data]);
  const docItems = useMemo(
    () => (selDoc ? docList.find((d) => d.num_documento === selDoc)?.items ?? [] : []),
    [docList, selDoc],
  );
  const isEditing = editingLotId !== null;

  function pickProveedor(nit: string): void {
    setSelNit(nit);
    setSelDoc("");
    const prov = provList.find((p) => p.nit === nit);
    setForm((r) => ({ ...r, supplier: prov?.nombre ?? "", purchase_order_ref: "", product_sku: "" }));
  }

  function pickDoc(num: string): void {
    setSelDoc(num);
    const doc = docList.find((d) => d.num_documento === num);
    setForm((r) => ({
      ...r,
      purchase_order_ref: num,
      product_sku: "",
      received_on: doc?.fecha ? doc.fecha.slice(0, 10) : r.received_on,
      received_quantity: "",
    }));
  }

  function pickProducto(cod: string): void {
    const it = docItems.find((i) => i.cod_producto === cod);
    setForm((r) => ({
      ...r,
      product_sku: cod,
      // Prefill cantidad comprada como sugerencia; el lote físico puede ser parcial.
      received_quantity: it ? String(it.cantidad) : r.received_quantity,
    }));
  }

  function resetCascade(): void {
    setSelNit("");
    setSelDoc("");
  }

  function startCreate(): void {
    setEditingLotId(null);
    setForm(EMPTY_FORM);
    resetCascade();
    setMessage(null);
    setFormOpen(true);
  }

  function startEdit(lot: ExpiryLot): void {
    setEditingLotId(lot.id);
    setForm({
      product_sku: lot.product_sku,
      purchase_order_ref: lot.purchase_order_ref,
      lot_code: lot.lot_code,
      expires_on: lot.expires_on.slice(0, 10),
      received_on: lot.received_on.slice(0, 10),
      received_quantity: String(lot.received_quantity),
      supplier: lot.supplier ?? "",
      notes: lot.notes ?? "",
    });
    resetCascade();
    setMessage(null);
    setFormOpen(true);
  }

  function closeForm(): void {
    setFormOpen(false);
    setEditingLotId(null);
    setForm(EMPTY_FORM);
    resetCascade();
  }

  const orderedLots = useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => a.expires_on.localeCompare(b.expires_on)),
    [data?.items],
  );

  async function submitForm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (editingLotId && !canManage) {
      setMessage({ type: "error", text: "No tenés permiso para editar caducidades." });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      if (editingLotId) {
        const patch = {
          lot_code: form.lot_code,
          expires_on: form.expires_on,
          received_on: form.received_on || undefined,
          received_quantity: Number(form.received_quantity),
          notes: form.notes.trim() ? form.notes.trim() : null,
        };
        await apiFetchJson(`/api/expiry/lots/${encodeURIComponent(editingLotId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        await mutate();
        closeForm();
        setMessage({ type: "success", text: "Caducidad actualizada." });
      } else {
        const payload = {
          ...form,
          received_quantity: Number(form.received_quantity),
          received_on: form.received_on || undefined,
          supplier: form.supplier || undefined,
          notes: form.notes || undefined,
        };
        await receiptMutationHandler.submit({
          fingerprint: JSON.stringify(payload),
          post: (idempotencyKey) =>
            apiFetchJson("/api/expiry/receipts", {
              method: "POST",
              headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
              body: JSON.stringify(payload),
            }),
          refresh: () => mutate(),
        });
        closeForm();
        setMessage({ type: "success", text: "Caducidad registrada. El lote ya aparece en el control." });
      }
    } catch (submitError) {
      setMessage({
        type: "error",
        text: errorMessage(
          submitError,
          editingLotId
            ? "No se pudo guardar la edición. Revisá los datos e intentá de nuevo."
            : "No se pudo registrar la caducidad. Revisá los datos e intentá de nuevo.",
        ),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteLot(lot: ExpiryLot): Promise<void> {
    const confirmed = window.confirm(
      `¿Eliminar la caducidad del lote ${lot.lot_code} (${lot.product_sku})? Esta acción no modifica el inventario del sistema.`,
    );
    if (!confirmed) return;

    setDeletingLotId(lot.id);
    setMessage(null);
    try {
      const response = await apiFetch(`/api/expiry/lots/${encodeURIComponent(lot.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`API error ${response.status} on DELETE /api/expiry/lots: ${body}`);
      }
      await mutate();
      if (editingLotId === lot.id) closeForm();
      setMessage({ type: "success", text: "Caducidad eliminada." });
    } catch (deleteError) {
      setMessage({
        type: "error",
        text: errorMessage(deleteError, "No se pudo eliminar la caducidad. Intentá de nuevo."),
      });
    } finally {
      setDeletingLotId(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card
        header={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-text-primary">Caducidad por lote</h2>
              <p className="mt-1 text-sm text-text-muted">
                Registro de vencimientos de MasVital desde compras reales. Editar o eliminar una caducidad no modifica
                el inventario de los dashboards.
              </p>
            </div>
            {canCreate && (
              <button
                type="button"
                onClick={() => (formOpen ? closeForm() : startCreate())}
                className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:bg-primary/90"
              >
                {formOpen ? "Cerrar" : "Registrar caducidad"}
              </button>
            )}
          </div>
        }
      >
        <div className="grid gap-2 text-xs text-text-secondary sm:grid-cols-4">
          <Legend label="Vencido" className="bg-red-100 text-red-800" />
          <Legend label="Crítico: 0–30 días" className="bg-orange-100 text-orange-800" />
          <Legend label="Atención: 31–90 días" className="bg-amber-100 text-amber-800" />
          <Legend label="Vigente: más de 90 días" className="bg-emerald-100 text-emerald-800" />
        </div>
      </Card>

      {message && (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </p>
      )}

      {(isEditing ? canManage : canCreate) && formOpen && (
        <Card
          header={
            <h3 className="text-sm font-semibold text-text-primary">
              {isEditing ? "Editar caducidad" : "Registrar nueva caducidad"}
            </h3>
          }
        >
          <form onSubmit={submitForm} className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2 rounded-xl border border-border bg-surface-alt/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Origen de compra</p>
              {isEditing ? (
                <div className="mt-2 grid gap-2 text-sm text-text-secondary sm:grid-cols-3">
                  <ReadonlyValue label="Proveedor" value={form.supplier || "Sin proveedor registrado"} />
                  <ReadonlyValue label="Documento" value={form.purchase_order_ref} />
                  <ReadonlyValue label="SKU" value={form.product_sku} />
                  <p className="sm:col-span-3 text-xs text-text-muted">
                    El origen queda bloqueado para no inventar datos maestros. Si proveedor, documento o SKU están mal,
                    eliminá este registro y crealo de nuevo desde la compra correcta.
                  </p>
                </div>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <FormField label="Proveedor" required>
                    <select
                      required
                      value={selNit}
                      onChange={(e) => pickProveedor(e.target.value)}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">
                        {proveedores.isLoading ? "Cargando proveedores…" : `Seleccioná (${provList.length})`}
                      </option>
                      {provList.map((p) => (
                        <option key={p.nit ?? p.nombre} value={p.nit ?? ""}>
                          {p.nombre} · {p.num_documentos} doc
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Factura / documento" required>
                    <select
                      required
                      value={selDoc}
                      onChange={(e) => pickDoc(e.target.value)}
                      disabled={!selNit || detalle.isLoading}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                    >
                      <option value="">
                        {!selNit
                          ? "Elegí proveedor"
                          : detalle.isLoading
                            ? "Cargando facturas…"
                            : `Seleccioná (${docList.length})`}
                      </option>
                      {docList.map((d) => (
                        <option key={d.num_documento} value={d.num_documento}>
                          {d.num_documento}
                          {d.fecha ? ` · ${d.fecha}` : ""} · {d.num_items} ítems
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Producto (SKU)" required>
                    <select
                      required
                      value={form.product_sku}
                      onChange={(e) => pickProducto(e.target.value)}
                      disabled={!selDoc}
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                    >
                      <option value="">{!selDoc ? "Elegí factura" : `Seleccioná (${docItems.length})`}</option>
                      {docItems.map((it) => (
                        <option key={it.cod_producto} value={it.cod_producto}>
                          {it.cod_producto} · {it.nom_producto} · {formatQuantity(it.cantidad)} {it.unidad_medida ?? "u"}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
              )}
            </div>

            <FormField label="Lote" required>
              <input
                required
                value={form.lot_code}
                onChange={(e) => setForm({ ...form, lot_code: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                maxLength={128}
                placeholder="Código impreso en el empaque"
              />
            </FormField>
            <FormField label="Cantidad" required>
              <input
                required
                type="number"
                min="0.001"
                step="0.001"
                value={form.received_quantity}
                onChange={(e) => setForm({ ...form, received_quantity: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </FormField>
            <FormField label="Fecha de vencimiento" required>
              <input
                required
                type="date"
                value={form.expires_on}
                onChange={(e) => setForm({ ...form, expires_on: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </FormField>
            <FormField label="Fecha de recepción">
              <input
                type="date"
                value={form.received_on}
                onChange={(e) => setForm({ ...form, received_on: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </FormField>
            <FormField label="Notas">
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                maxLength={2000}
              />
            </FormField>
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <button
                disabled={submitting}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60"
              >
                {submitting ? "Guardando…" : isEditing ? "Guardar cambios" : "Guardar caducidad"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg bg-surface-alt px-3 py-2 text-sm text-text-secondary"
              >
                Cancelar
              </button>
              {!isEditing && (
                <p className="text-xs text-text-muted">
                  Se guarda con clave de idempotencia; no duplica un reintento.
                </p>
              )}
            </div>
          </form>
        </Card>
      )}

      <Card header={<h3 className="text-sm font-semibold text-text-primary">Caducidades registradas {data ? `(${data.total})` : ""}</h3>}>
        {isLoading && !data ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-text-muted">No se pudo cargar el registro de caducidad. Intentá actualizar la página.</p>
        ) : orderedLots.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">Todavía no hay caducidades registradas. Se cargan desde compras reales.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[960px] w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">Producto</th>
                  <th className="px-2 py-2 font-medium">Proveedor / documento</th>
                  <th className="px-2 py-2 font-medium">Lote</th>
                  <th className="px-2 py-2 font-medium">Caducidad</th>
                  <th className="px-2 py-2 font-medium text-right">Cantidad</th>
                  <th className="px-2 py-2 font-medium">Estado</th>
                  {canManage && <th className="px-2 py-2 font-medium" aria-label="Acciones" />}
                </tr>
              </thead>
              <tbody>
                {orderedLots.map((lot) => {
                  const days = daysUntilExpiry(lot.expires_on);
                  const band = getExpiryBand(days);
                  return (
                    <tr key={lot.id} className="border-b border-border/70 last:border-0">
                      <td className="px-2 py-3">
                        <div className="font-medium text-text-primary">{lot.product_sku}</div>
                        <div className="text-xs text-text-muted">{lot.product_name || "Nombre no disponible en el registro"}</div>
                      </td>
                      <td className="px-2 py-3 text-text-secondary">
                        <div>{lot.supplier || "Sin proveedor"}</div>
                        <div className="font-mono text-xs text-text-muted">Doc. {lot.purchase_order_ref}</div>
                      </td>
                      <td className="px-2 py-3 font-mono text-xs text-text-secondary">{lot.lot_code}</td>
                      <td className="px-2 py-3 text-text-secondary">
                        <div>{formatExpiryDate(lot.expires_on)}</div>
                        <div className="text-xs text-text-muted">
                          {days < 0 ? `${Math.abs(days)} días vencido` : days === 0 ? "Vence hoy" : `${days} días restantes`}
                        </div>
                      </td>
                      <td className="px-2 py-3 text-right font-semibold tabular-nums text-text-primary">{formatQuantity(lot.remaining_quantity)}</td>
                      <td className="px-2 py-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${band.className}`}>{band.label}</span>
                      </td>
                      {canManage && (
                        <td className="px-2 py-3 text-right">
                          <div className="flex justify-end gap-3">
                            <button
                              type="button"
                              onClick={() => startEdit(lot)}
                              className="text-xs font-semibold text-accent hover:underline"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              disabled={deletingLotId === lot.id}
                              onClick={() => deleteLot(lot)}
                              className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-60"
                            >
                              {deletingLotId === lot.id ? "Eliminando…" : "Eliminar"}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Legend({ label, className }: { label: string; className: string }): JSX.Element {
  return <span className={`inline-flex w-fit rounded-full px-2 py-1 font-medium ${className}`}>{label}</span>;
}

function ReadonlyValue({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1 break-words font-medium text-text-primary">{value}</div>
    </div>
  );
}

function FormField({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block text-sm font-medium text-text-secondary">
      {label}
      {required ? <span className="text-red-700"> *</span> : null}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
