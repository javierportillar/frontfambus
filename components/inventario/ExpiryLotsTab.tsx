"use client";

import { type FormEvent, useMemo, useRef, useState } from "react";
import { apiFetchJson } from "@/lib/api/client";
import { IdempotentMutation } from "@/lib/api/idempotentMutation";
import { type ExpiryLot, useExpiryLots } from "@/lib/api/hooks";
import { daysUntilExpiry, formatExpiryDate, getExpiryBand } from "@/lib/inventory/expiry";
import { useAuthStore } from "@/lib/auth/store";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

type ReceiptForm = {
  product_sku: string;
  purchase_order_ref: string;
  lot_code: string;
  expires_on: string;
  received_on: string;
  received_quantity: string;
  supplier: string;
  notes: string;
};

const EMPTY_RECEIPT: ReceiptForm = {
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
  const canManage = role === "admin" || role === "gerente";
  const { data, error, isLoading, mutate } = useExpiryLots();
  const [receipt, setReceipt] = useState<ReceiptForm>(EMPTY_RECEIPT);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [selectedLot, setSelectedLot] = useState<ExpiryLot | null>(null);
  const [adjustment, setAdjustment] = useState({ quantity_delta: "", reason: "" });
  const [submitting, setSubmitting] = useState<"receipt" | "adjustment" | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const receiptMutation = useRef<IdempotentMutation | null>(null);
  const adjustmentMutation = useRef<IdempotentMutation | null>(null);
  const receiptMutationHandler = receiptMutation.current ?? (receiptMutation.current = new IdempotentMutation(newIdempotencyKey));
  const adjustmentMutationHandler = adjustmentMutation.current ?? (adjustmentMutation.current = new IdempotentMutation(newIdempotencyKey));

  const orderedLots = useMemo(
    () => [...(data?.items ?? [])].sort((a, b) => a.expires_on.localeCompare(b.expires_on)),
    [data?.items],
  );

  async function submitReceipt(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting("receipt");
    setMessage(null);
    const payload = {
      ...receipt,
      received_quantity: Number(receipt.received_quantity),
      received_on: receipt.received_on || undefined,
      supplier: receipt.supplier || undefined,
      notes: receipt.notes || undefined,
    };
    try {
      await receiptMutationHandler.submit({
        fingerprint: JSON.stringify(payload),
        post: (idempotencyKey) => apiFetchJson("/api/expiry/receipts", {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(payload),
        }),
        refresh: () => mutate(),
      });
      setReceipt(EMPTY_RECEIPT);
      setReceiptOpen(false);
      setMessage({ type: "success", text: "Recepción registrada. El lote ya aparece en el control de caducidad." });
    } catch (submitError) {
      setMessage({ type: "error", text: errorMessage(submitError, "No se pudo registrar la recepción. Revisá los datos e intentá de nuevo.") });
    } finally {
      setSubmitting(null);
    }
  }

  async function submitAdjustment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedLot) return;
    setSubmitting("adjustment");
    setMessage(null);
    const payload = {
      quantity_delta: Number(adjustment.quantity_delta),
      reason: adjustment.reason,
    };
    try {
      await adjustmentMutationHandler.submit({
        fingerprint: JSON.stringify({ lotId: selectedLot.id, ...payload }),
        post: (idempotencyKey) => apiFetchJson(`/api/expiry/lots/${encodeURIComponent(selectedLot.id)}/adjustments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
          body: JSON.stringify(payload),
        }),
        refresh: () => mutate(),
      });
      setAdjustment({ quantity_delta: "", reason: "" });
      setSelectedLot(null);
      setMessage({ type: "success", text: "Ajuste aplicado y stock remanente actualizado." });
    } catch (submitError) {
      setMessage({ type: "error", text: errorMessage(submitError, "No se pudo aplicar el ajuste. El remanente nunca puede quedar negativo.") });
    } finally {
      setSubmitting(null);
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
                Control manual de recepciones de MasVital. No asigna ventas ni aplica FEFO automáticamente.
              </p>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => setReceiptOpen((isOpen) => !isOpen)}
                className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:bg-primary/90"
              >
                {receiptOpen ? "Cerrar recepción" : "Registrar recepción"}
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

      {canManage && receiptOpen && (
        <Card header={<h3 className="text-sm font-semibold text-text-primary">Nueva recepción con lote</h3>}>
          <form onSubmit={submitReceipt} className="grid gap-3 md:grid-cols-2">
            <FormField label="SKU del producto" required>
              <input required value={receipt.product_sku} onChange={(e) => setReceipt({ ...receipt, product_sku: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" maxLength={128} />
            </FormField>
            <FormField label="Orden o documento de compra" required>
              <input required value={receipt.purchase_order_ref} onChange={(e) => setReceipt({ ...receipt, purchase_order_ref: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" maxLength={128} />
            </FormField>
            <FormField label="Lote" required>
              <input required value={receipt.lot_code} onChange={(e) => setReceipt({ ...receipt, lot_code: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" maxLength={128} />
            </FormField>
            <FormField label="Cantidad recibida" required>
              <input required type="number" min="0.001" step="0.001" value={receipt.received_quantity} onChange={(e) => setReceipt({ ...receipt, received_quantity: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </FormField>
            <FormField label="Fecha de vencimiento" required>
              <input required type="date" value={receipt.expires_on} onChange={(e) => setReceipt({ ...receipt, expires_on: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </FormField>
            <FormField label="Fecha de recepción">
              <input type="date" value={receipt.received_on} onChange={(e) => setReceipt({ ...receipt, received_on: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </FormField>
            <FormField label="Proveedor">
              <input value={receipt.supplier} onChange={(e) => setReceipt({ ...receipt, supplier: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" maxLength={255} />
            </FormField>
            <FormField label="Notas">
              <input value={receipt.notes} onChange={(e) => setReceipt({ ...receipt, notes: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" maxLength={2000} />
            </FormField>
            <div className="md:col-span-2 flex items-center gap-3">
              <button disabled={submitting === "receipt"} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60">
                {submitting === "receipt" ? "Registrando…" : "Guardar recepción"}
              </button>
              <p className="text-xs text-text-muted">Se guarda con una clave de idempotencia; no duplica un reintento.</p>
            </div>
          </form>
        </Card>
      )}

      {canManage && selectedLot && (
        <Card header={<h3 className="text-sm font-semibold text-text-primary">Ajustar remanente · lote {selectedLot.lot_code}</h3>}>
          <form onSubmit={submitAdjustment} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-end">
            <FormField label={`Cantidad actual: ${formatQuantity(selectedLot.remaining_quantity)}`} required>
              <input required type="number" step="0.001" value={adjustment.quantity_delta} onChange={(e) => setAdjustment({ ...adjustment, quantity_delta: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Ej. -2" />
            </FormField>
            <FormField label="Motivo del ajuste" required>
              <input required value={adjustment.reason} onChange={(e) => setAdjustment({ ...adjustment, reason: e.target.value })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" maxLength={500} />
            </FormField>
            <div className="flex gap-2">
              <button type="button" onClick={() => setSelectedLot(null)} className="rounded-lg bg-surface-alt px-3 py-2 text-sm text-text-secondary">Cancelar</button>
              <button disabled={submitting === "adjustment"} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60">
                {submitting === "adjustment" ? "Guardando…" : "Aplicar"}
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card header={<h3 className="text-sm font-semibold text-text-primary">Lotes registrados {data ? `(${data.total})` : ""}</h3>}>
        {isLoading && !data ? (
          <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-text-muted">No se pudo cargar el registro de lotes. Intentá actualizar la página.</p>
        ) : orderedLots.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">Todavía no hay lotes registrados. Las recepciones se cargan manualmente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-2 py-2 font-medium">Producto</th>
                  <th className="px-2 py-2 font-medium">Documento</th>
                  <th className="px-2 py-2 font-medium">Lote</th>
                  <th className="px-2 py-2 font-medium">Caducidad</th>
                  <th className="px-2 py-2 font-medium text-right">Remanente</th>
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
                        {/* Never fabricate a catalog name when a legacy lot cannot resolve one. */}
                        <div className="text-xs text-text-muted">{lot.product_name || "Nombre no disponible en el registro"}</div>
                      </td>
                      <td className="px-2 py-3 text-text-secondary">{lot.purchase_order_ref}</td>
                      <td className="px-2 py-3 font-mono text-xs text-text-secondary">{lot.lot_code}</td>
                      <td className="px-2 py-3 text-text-secondary">
                        <div>{formatExpiryDate(lot.expires_on)}</div>
                        <div className="text-xs text-text-muted">{days < 0 ? `${Math.abs(days)} días vencido` : days === 0 ? "Vence hoy" : `${days} días restantes`}</div>
                      </td>
                      <td className="px-2 py-3 text-right font-semibold tabular-nums text-text-primary">{formatQuantity(lot.remaining_quantity)}</td>
                      <td className="px-2 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${band.className}`}>{band.label}</span></td>
                      {canManage && (
                        <td className="px-2 py-3 text-right">
                          <button type="button" onClick={() => setSelectedLot(lot)} className="text-xs font-semibold text-accent hover:underline">Ajustar</button>
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

function FormField({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block text-sm font-medium text-text-secondary">
      {label}{required ? <span className="text-red-700"> *</span> : null}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
