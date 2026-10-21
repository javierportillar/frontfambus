"use client";

import { useEffect, useRef, useState, useId } from "react";
import { usePOSStore } from "@/lib/pos/store";
import { submitSale, saveCashSession } from "@/lib/api/pos";
import { formatMoneyFull } from "@/lib/format/currency";
import { calculateChange } from "@/lib/pos/calculations";
import type { PaymentMethod, SalePayload } from "@/lib/pos/types";

interface PaymentModalProps {
  tenant?: string;
  cashierName?: string;
  onSaleComplete?: (sale: SalePayload) => void;
}

export function PaymentModal({
  tenant = "motoshop",
  cashierName = "Cajero Principal",
  onSaleComplete,
}: PaymentModalProps): JSX.Element | null {
  const isPaymentModalOpen = usePOSStore((s) => s.isPaymentModalOpen);
  const closePaymentModal = usePOSStore((s) => s.closePaymentModal);
  const cart = usePOSStore((s) => s.cart);
  const customer = usePOSStore((s) => s.customer);
  const setCustomer = usePOSStore((s) => s.setCustomer);
  const documentType = usePOSStore((s) => s.documentType);
  const setDocumentType = usePOSStore((s) => s.setDocumentType);
  const session = usePOSStore((s) => s.session);
  const recordSaleInSession = usePOSStore((s) => s.recordSaleInSession);
  const setLastSale = usePOSStore((s) => s.setLastSale);
  const openReceipt = usePOSStore((s) => s.openReceipt);
  const clearCart = usePOSStore((s) => s.clearCart);
  const getTotals = usePOSStore((s) => s.getTotals);

  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cashInputRef = useRef<HTMLInputElement>(null);

  const totals = getTotals();

  // Estado del pago
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("EFECTIVO");
  const [cashReceived, setCashReceived] = useState<number>(totals.total);
  const [reference, setReference] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Edición rápida de cliente
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [customerNit, setCustomerNit] = useState(customer.nit);
  const [customerName, setCustomerName] = useState(customer.name);

  // Sincronizar efectivo recibido cuando se abre el modal
  useEffect(() => {
    if (isPaymentModalOpen) {
      setCashReceived(totals.total);
      setSelectedMethod("EFECTIVO");
      setReference("");
      setErrorMessage(null);
      setIsEditingCustomer(false);
      setCustomerNit(customer.nit);
      setCustomerName(customer.name);
    }
  }, [customer.name, customer.nit, isPaymentModalOpen, totals.total]);

  // Manejo de diálogo nativo
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isPaymentModalOpen) {
      if (!dialog.open) {
        dialog.showModal();
        setTimeout(() => cashInputRef.current?.focus(), 50);
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isPaymentModalOpen]);

  // Fallback light-dismiss
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleClickOutside(event: MouseEvent): void {
      if (!dialog || event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const isInside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!isInside) {
        closePaymentModal();
      }
    }

    dialog.addEventListener("click", handleClickOutside);
    return () => dialog.removeEventListener("click", handleClickOutside);
  }, [closePaymentModal]);

  const change =
    selectedMethod === "EFECTIVO"
      ? calculateChange(totals.total, cashReceived)
      : 0;

  const isCashComplete = selectedMethod !== "EFECTIVO" || cashReceived >= totals.total;

  function handleAddCashShortcut(amount: number): void {
    setCashReceived((prev) => (prev > 0 ? prev + amount : amount));
  }

  function handleSaveCustomer(): void {
    setCustomer({
      ...customer,
      nit: customerNit.trim() || "222222222222",
      name: customerName.trim() || "Consumidor Final",
    });
    setIsEditingCustomer(false);
  }

  async function handleConfirmSale(): Promise<void> {
    if (cart.length === 0) return;
    if (!isCashComplete && selectedMethod === "EFECTIVO") {
      setErrorMessage("El efectivo recibido es menor al total a pagar.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const salePayload: SalePayload = {
      id: `sale-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      documentType,
      documentNumber: "", // Se asigna automáticamente en submitSale
      customer,
      items: [...cart],
      totals,
      payments: [
        {
          id: `pay-${Date.now()}`,
          method: selectedMethod,
          amount: totals.total,
          reference: reference.trim() || undefined,
        },
      ],
      cashReceived: selectedMethod === "EFECTIVO" ? cashReceived : totals.total,
      changeGiven: change,
      sessionId: session?.id,
      cashier: cashierName,
      tenant,
      createdAt: new Date().toISOString(),
      status: "COMPLETED",
    };

    try {
      const result = await submitSale(salePayload);
      if (result.success) {
        // Actualizar resumen en sesión de caja y persistir a almacenamiento local
        recordSaleInSession(totals.total, selectedMethod === "EFECTIVO");
        const currentSession = usePOSStore.getState().session;
        if (currentSession) {
          await saveCashSession(currentSession);
        }

        // Almacenar última venta y abrir recibo
        setLastSale(result.sale);
        closePaymentModal();
        clearCart();
        openReceipt();
        onSaleComplete?.(result.sale);
      } else {
        setErrorMessage("No fue posible registrar la venta. Inténtalo nuevamente.");
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Error inesperado al registrar venta.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isPaymentModalOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 m-auto flex h-[92vh] max-h-[720px] w-[95vw] max-w-xl flex-col overflow-hidden rounded-3xl border border-border bg-surface text-text-primary shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm p-0 animate-in fade-in zoom-in-95 duration-150"
      onCancel={(e) => {
        e.preventDefault();
        closePaymentModal();
      }}
    >
      {/* Cabecera de Cobro */}
      <div className="border-b border-border bg-surface-dark px-6 py-4 text-text-inverse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-md">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className="h-5 w-5">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </div>
            <div>
              <h2 id={titleId} className="text-lg font-black tracking-tight text-text-inverse leading-tight">
                Finalizar Venta y Cobro
              </h2>
              <p className="text-xs text-text-muted">
                {cart.length} ítems • {totals.itemCount % 1 === 0 ? totals.itemCount : Number(totals.itemCount.toFixed(3))} {totals.itemCount === 1 ? "unidad" : "unidades/peso"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closePaymentModal}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface-dark-alt hover:text-text-inverse"
            aria-label="Cerrar modal de cobro"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Display Gigante del Total a Pagar */}
        <div className="mt-4 rounded-2xl bg-surface-dark-alt/80 p-4 border border-surface-dark-alt text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-text-muted">
            Total a Cobrar
          </span>
          <div className="text-4xl font-black text-primary tracking-tight mt-0.5">
            {formatMoneyFull(totals.total)}
          </div>
          <div className="mt-1 flex items-center justify-center gap-3 text-xs text-text-muted">
            <span>Subtotal: {formatMoneyFull(totals.subtotal)}</span>
            {totals.totalDiscount > 0 && (
              <span>• Dcto: -{formatMoneyFull(totals.totalDiscount)}</span>
            )}
            {totals.totalVat > 0 && (
              <span>• IVA: +{formatMoneyFull(totals.totalVat)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Cuerpo del formulario con scroll */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {errorMessage && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700">
            {errorMessage}
          </div>
        )}

        {/* Sección de Cliente y Tipo de Documento */}
        <div className="rounded-2xl border border-border bg-surface-alt/70 p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 text-text-muted">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-wide text-text-secondary">
                Cliente y Comprobante
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsEditingCustomer(!isEditingCustomer)}
              className="text-xs font-bold text-primary hover:underline"
            >
              {isEditingCustomer ? "Guardar" : "Cambiar Cliente"}
            </button>
          </div>

          {isEditingCustomer ? (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-text-muted">NIT / Documento</label>
                <input
                  type="text"
                  value={customerNit}
                  onChange={(e) => setCustomerNit(e.target.value)}
                  placeholder="222222222222"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-text-muted">Nombre o Razón Social</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Consumidor Final"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium focus:border-primary focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 mt-1">
                <button
                  type="button"
                  onClick={handleSaveCustomer}
                  className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-fg"
                >
                  Aplicar
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center justify-between text-xs">
              <div>
                <span className="font-bold text-text-primary">{customer.name}</span>{" "}
                <span className="font-mono text-text-muted">({customer.nit})</span>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="docTypeSelect" className="sr-only">Tipo de comprobante</label>
                <select
                  id="docTypeSelect"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as typeof documentType)}
                  className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-bold text-text-secondary focus:border-primary focus:outline-none"
                >
                  <option value="FACTURA_VENTA">Factura Electrónica / Venta</option>
                  <option value="POS_TICKET">Ticket Tirilla POS</option>
                  <option value="REMISION">Remisión de Entrega</option>
                  <option value="COTIZACION">Cotización</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Métodos de Pago */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
            Método de Pago
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                { id: "EFECTIVO", label: "Efectivo", icon: "💵" },
                { id: "DATAFONO", label: "Datáfono / Tarjeta", icon: "💳" },
                { id: "TRANSFERENCIA", label: "Transferencia", icon: "📱" },
                { id: "CREDITO", label: "A Crédito", icon: "📝" },
              ] as const
            ).map((m) => {
              const isSelected = selectedMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedMethod(m.id);
                    if (m.id !== "EFECTIVO") {
                      setCashReceived(totals.total);
                    }
                  }}
                  className={`flex flex-col items-center justify-center rounded-2xl border p-3 text-center transition-all ${
                    isSelected
                      ? "border-primary bg-primary/10 text-primary font-bold shadow-xs ring-2 ring-primary/20"
                      : "border-border bg-surface hover:bg-surface-alt text-text-secondary"
                  }`}
                >
                  <span className="text-xl mb-1">{m.icon}</span>
                  <span className="text-xs font-semibold leading-tight">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Panel específico de Efectivo con atajos COP */}
        {selectedMethod === "EFECTIVO" && (
          <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label htmlFor="cashReceivedInput" className="text-xs font-bold uppercase tracking-wide text-text-secondary">
                Efectivo Recibido (COP)
              </label>
              <button
                type="button"
                onClick={() => setCashReceived(totals.total)}
                className="text-xs font-bold text-primary hover:underline"
              >
                Monto Exacto
              </button>
            </div>

            <div className="relative">
              <span className="absolute left-3.5 top-3 text-base font-bold text-text-muted">
                $
              </span>
              <input
                id="cashReceivedInput"
                ref={cashInputRef}
                type="number"
                step="50"
                value={cashReceived || ""}
                onChange={(e) => setCashReceived(Math.max(0, parseInt(e.target.value, 10) || 0))}
                placeholder="0"
                className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 pl-8 text-xl font-black text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs"
              />
            </div>

            {/* Atajos de billetes colombianos */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-bold text-text-muted mr-1">Billetes:</span>
              {[10000, 20000, 50000, 100000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleAddCashShortcut(val)}
                  className="rounded-lg border border-border bg-surface-alt px-2.5 py-1 text-xs font-black text-text-secondary hover:bg-surface-dark hover:text-text-inverse hover:border-surface-dark transition-colors active:scale-95"
                >
                  +{formatMoneyFull(val)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCashReceived(0)}
                className="rounded-lg border border-border bg-surface-alt px-2 py-1 text-xs font-medium text-text-muted hover:text-rose-600 transition-colors"
              >
                Cero
              </button>
            </div>

            {/* Banner de Cambio / Vueltas */}
            <div
              className={`flex items-center justify-between rounded-xl p-3 border ${
                cashReceived >= totals.total
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-800"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {cashReceived >= totals.total ? "💵" : "⚠️"}
                </span>
                <span className="text-xs font-bold uppercase tracking-wider">
                  {cashReceived >= totals.total ? "Cambio a devolver:" : "Faltante:"}
                </span>
              </div>
              <div className="text-xl font-black">
                {cashReceived >= totals.total
                  ? formatMoneyFull(change)
                  : formatMoneyFull(totals.total - cashReceived)}
              </div>
            </div>
          </div>
        )}

        {/* Campos adicionales para Transferencia o Datáfono */}
        {(selectedMethod === "TRANSFERENCIA" || selectedMethod === "DATAFONO") && (
          <div className="rounded-2xl border border-border bg-surface p-4 space-y-2">
            <label htmlFor="refInput" className="text-xs font-bold uppercase tracking-wide text-text-secondary">
              Número de Referencia / Comprobante / Aprobación
            </label>
            <input
              id="refInput"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ej. Nequi M123456 / Aprobación Datáfono 8921"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Footer de Acciones */}
      <div className="border-t border-border bg-surface-alt px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          type="button"
          onClick={closePaymentModal}
          className="w-full sm:w-auto rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-bold text-text-secondary hover:bg-surface-alt transition-colors"
        >
          Cancelar / Seguir vendiendo
        </button>

        <button
          type="button"
          disabled={isSubmitting || !isCashComplete}
          onClick={handleConfirmSale}
          className={`w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl px-7 py-3 text-sm font-black text-primary-fg shadow-lg transition-all ${
            isSubmitting || !isCashComplete
              ? "bg-primary/50 cursor-not-allowed opacity-75"
              : "bg-primary hover:bg-primary-dark active:scale-95"
          }`}
        >
          {isSubmitting ? (
            <span>Procesando venta...</span>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Cobrar {formatMoneyFull(totals.total)}</span>
            </>
          )}
        </button>
      </div>
    </dialog>
  );
}
