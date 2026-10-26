"use client";

import { useCallback, useEffect, useRef, useState, useId, useTransition } from "react";
import { usePOSStore } from "@/lib/pos/store";
import { useBankVerification } from "@/lib/api/hooks";
import {
  createBankVerification,
  listBankCandidates,
  esEstadoFinal,
  resultadoDelJob,
  mensajeDeErrorDeVerificacion,
  type BankCandidato,
} from "@/lib/erp/bank";
import {
  formatSpanishDayMonth,
  formatSpanishLongDate,
  reviewedMovementsNote,
} from "@/lib/erp/bankPresentation";
import { submitSale, saveCashSession } from "@/lib/api/pos";
import { formatMoneyFull } from "@/lib/format/currency";
import {
  calculateChange,
  calculateSplitPayments,
} from "@/lib/pos/calculations";
import {
  sanitizeBancolombiaReference,
  parseBancolombiaQRText,
} from "@/lib/pos/bancolombia";
import { listTerceros } from "@/lib/erp/client";
import type { Tercero } from "@/lib/erp/types";
import type { PaymentMethod, PaymentEntry, SalePayload } from "@/lib/pos/types";

interface PaymentModalProps {
  tenant?: string;
  cashierName?: string;
  onSaleComplete?: (sale: SalePayload) => void;
}

/** TTL del job de verificación: pasado este tiempo no se sondea más. */
const BANK_VERIFICATION_TIMEOUT_MS = 300_000;
const BANK_VERIFICATION_POLL_MS = 2_000;

/** NITs de consumidor final: el backend los oculta y no son señal de match. */
const NITS_CONSUMIDOR_FINAL = new Set(["222222222", "222222222222"]);

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

  // Modo de pago: Una forma de pago vs Varias formas de pago (sgHermes)
  const [paymentMode, setPaymentMode] = useState<"UNA_FORMA" | "VARIAS_FORMAS">("UNA_FORMA");

  // Pagos divididos / múltiples (Varias formas de pago - sgHermes)
  const [splitPayments, setSplitPayments] = useState<PaymentEntry[]>([]);
  const [newSplitMethod, setNewSplitMethod] = useState<PaymentMethod>("EFECTIVO");
  const [newSplitAmount, setNewSplitAmount] = useState<number>(totals.total);
  const [newSplitReference, setNewSplitReference] = useState("");

  // Edición rápida de cliente
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [customerNit, setCustomerNit] = useState(customer.nit);
  const [customerName, setCustomerName] = useState(customer.name);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerSearchResults, setCustomerSearchResults] = useState<Tercero[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [showManualCustomerInput, setShowManualCustomerInput] = useState(false);

  // Asistente QR Bancolombia / Transferencia
  const [qrRawText, setQrRawText] = useState("");
  const [qrFeedback, setQrFeedback] = useState<{
    name?: string;
    ref?: string;
    matched: boolean;
    amountMismatch?: boolean;
    detectedAmount?: number;
  } | null>(null);

  // Verificación bancaria contra el nodo local (el scrape vive fuera del request)
  const [bankJobId, setBankJobId] = useState<string | null>(null);
  const [bankCandidateList, setBankCandidateList] = useState<BankCandidato[] | null>(null);
  const [bankStartError, setBankStartError] = useState<string | null>(null);
  const [bankTimedOut, setBankTimedOut] = useState(false);
  const [bankConsultedOn, setBankConsultedOn] = useState<Date | null>(null);
  const [isVerifyingBank, setIsVerifyingBank] = useState(false);
  const bankTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // El operador siempre manda: lo que escribió a mano no se pisa con lo del banco.
  const referenceDirtyRef = useRef(false);
  const customerDirtyRef = useRef(false);
  const appliedCandidateRef = useRef<string | null>(null);

  // Sincronizar efectivo recibido cuando se abre el modal.
  // OJO: no depende del cliente. Si dependiera, prellenar el pagador desde la
  // verificación bancaria reiniciaría el modal (y volvería a EFECTIVO).
  useEffect(() => {
    if (isPaymentModalOpen) {
      const clienteActual = usePOSStore.getState().customer;
      setPaymentMode("UNA_FORMA");
      setCashReceived(totals.total);
      setSelectedMethod("EFECTIVO");
      setReference("");
      setErrorMessage(null);
      setIsEditingCustomer(false);
      setShowManualCustomerInput(false);
      setCustomerSearchQuery("");
      setCustomerSearchResults([]);
      setCustomerNit(clienteActual.nit);
      setCustomerName(clienteActual.name);
      setQrRawText("");
      setQrFeedback(null);
      setBankJobId(null);
      setBankCandidateList(null);
      setBankStartError(null);
      setBankTimedOut(false);
      setBankConsultedOn(null);
      setIsVerifyingBank(false);
      referenceDirtyRef.current = false;
      customerDirtyRef.current = false;
      appliedCandidateRef.current = null;
      setSplitPayments([]);
      setNewSplitMethod("EFECTIVO");
      setNewSplitAmount(totals.total);
      setNewSplitReference("");
    }
  }, [isPaymentModalOpen, totals.total]);

  // ── Verificación bancaria ────────────────────────────────────────────
  const { data: bankJob, error: bankJobError } = useBankVerification(bankJobId, {
    refreshInterval: bankTimedOut ? 0 : BANK_VERIFICATION_POLL_MS,
  });
  const activeBankJob =
    bankJob && bankJobId && bankJob.job_id === bankJobId ? bankJob : undefined;

  const aplicarCandidato = useCallback(
    (candidato: BankCandidato) => {
      if (!referenceDirtyRef.current && candidato.referencia) {
        setReference(sanitizeBancolombiaReference(candidato.referencia));
      }
      if (!customerDirtyRef.current && candidato.pagadorNombre) {
        setCustomer({ ...customer, name: candidato.pagadorNombre });
        setCustomerName(candidato.pagadorNombre);
      }
    },
    [customer, setCustomer],
  );

  const bankResult = resultadoDelJob(activeBankJob);
  const bankCandidates =
    bankCandidateList ??
    bankResult?.candidatos ??
    (bankResult?.candidato ? [bankResult.candidato] : []);
  const resolvedCandidate =
    activeBankJob?.estado === "resuelto" && bankCandidates.length === 1
      ? bankCandidates[0]
      : null;
  const ambiguousCandidates =
    activeBankJob?.estado === "ambiguo" ? bankCandidates : [];
  const bankTerminalError =
    activeBankJob &&
    (activeBankJob.estado === "fallido" || activeBankJob.estado === "expirado")
      ? mensajeDeErrorDeVerificacion(activeBankJob)
      : null;
  const reviewedNote = reviewedMovementsNote(bankResult?.movimientos, bankResult?.ventana);

  function clearBankTimeout(): void {
    if (bankTimeoutRef.current !== null) {
      clearTimeout(bankTimeoutRef.current);
      bankTimeoutRef.current = null;
    }
  }

  // Tope duro de 300 s: pasado el TTL del job no se sigue golpeando el nodo.
  useEffect(() => {
    if (!bankJobId || bankTimedOut) return;
    const timeout = setTimeout(() => {
      setBankTimedOut(true);
      setIsVerifyingBank(false);
    }, BANK_VERIFICATION_TIMEOUT_MS);
    bankTimeoutRef.current = timeout;
    return () => {
      clearTimeout(timeout);
      if (bankTimeoutRef.current === timeout) bankTimeoutRef.current = null;
    };
  }, [bankJobId, bankTimedOut]);

  useEffect(
    () => () => {
      if (bankTimeoutRef.current !== null) clearTimeout(bankTimeoutRef.current);
    },
    [],
  );

  // Un poll que falla se corta acá: no se sigue golpeando un job roto.
  useEffect(() => {
    if (!bankJobId || !bankJobError) return;
    const mensaje = mensajeDeErrorDeVerificacion(bankJobError);
    if (!mensaje) return;
    setBankStartError(mensaje);
    setIsVerifyingBank(false);
    clearBankTimeout();
    setBankJobId(null);
  }, [bankJobId, bankJobError]);

  // El job avanza en segundo plano: traducimos su estado a la pantalla.
  useEffect(() => {
    if (!activeBankJob) return;

    if (activeBankJob.estado === "resuelto") {
      const candidato = activeBankJob.resultado?.candidato ?? null;
      if (candidato && appliedCandidateRef.current !== activeBankJob.job_id) {
        appliedCandidateRef.current = activeBankJob.job_id;
        aplicarCandidato(candidato);
      }
    }
    if (esEstadoFinal(activeBankJob.estado)) {
      clearBankTimeout();
      setIsVerifyingBank(false);
    }
  }, [activeBankJob, aplicarCandidato]);

  // El candidato elegido por el operador gana; el sistema nunca elige solo.
  useEffect(() => {
    if (activeBankJob?.estado !== "ambiguo") return;
    const fromJob = activeBankJob.resultado?.candidatos ?? [];
    if (fromJob.length > 0) {
      setBankCandidateList(fromJob);
      return;
    }
    let cancelado = false;
    listBankCandidates({ valor: totals.total })
      .then((resultado) => {
        if (!cancelado) setBankCandidateList(resultado.candidatos);
      })
      .catch(() => {
        if (!cancelado) setBankCandidateList([]);
      });
    return () => {
      cancelado = true;
    };
  }, [activeBankJob?.estado, activeBankJob?.job_id, bankResult?.candidatos, totals.total]);

  async function handleVerificarTransferencia(): Promise<void> {
    clearBankTimeout();
    setBankJobId(null);
    setBankCandidateList(null);
    setBankStartError(null);
    setBankTimedOut(false);
    setBankConsultedOn(new Date());
    setIsVerifyingBank(true);
    appliedCandidateRef.current = null;
    try {
      const nitter = customerNit.trim();
      const nombreEsperado = customerName.trim();
      const job = await createBankVerification({
        valor: totals.total,
        nitter:
          nitter && !NITS_CONSUMIDOR_FINAL.has(nitter) ? nitter : undefined,
        nombreEsperado: nombreEsperado || undefined,
      });
      if (!job.job_id) throw new Error("La verificación no devolvió un job");
      setBankJobId(job.job_id);
    } catch {
      // Cualquier fallo del nodo se trata igual: no hay verificación, el
      // pegado manual sigue disponible y el cobro no se bloquea.
      setBankStartError("Verificación no disponible");
      setIsVerifyingBank(false);
    }
  }

  // Búsqueda en vivo de clientes por NIT o Nombre
  useEffect(() => {
    const query = customerSearchQuery.trim();
    if (query.length < 2) {
      setCustomerSearchResults([]);
      setIsSearchingCustomer(false);
      return;
    }

    let active = true;
    setIsSearchingCustomer(true);
    const timer = setTimeout(async () => {
      try {
        const results = await listTerceros({ search: query, limit: 6 });
        if (active) {
          setCustomerSearchResults(results ?? []);
        }
      } catch {
        if (active) setCustomerSearchResults([]);
      } finally {
        if (active) setIsSearchingCustomer(false);
      }
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [customerSearchQuery]);

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

  const splitSummary = calculateSplitPayments(totals.total, splitPayments);
  const isMultiPaymentValid = splitSummary.isBalanced && splitPayments.length > 0;

  function handleAddCashShortcut(amount: number): void {
    setCashReceived((prev) => (prev > 0 ? prev + amount : amount));
  }

  function handleAddSplitPayment(): void {
    if (newSplitAmount <= 0) {
      setErrorMessage("El valor de la forma de pago debe ser mayor a cero.");
      return;
    }
    setErrorMessage(null);
    const entry: PaymentEntry = {
      id: `split-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      method: newSplitMethod,
      amount: newSplitAmount,
      reference: sanitizeBancolombiaReference(newSplitReference) || undefined,
    };
    const nextList = [...splitPayments, entry];
    setSplitPayments(nextList);
    setNewSplitReference("");
    const nextSummary = calculateSplitPayments(totals.total, nextList);
    setNewSplitAmount(Math.max(0, nextSummary.remainingDifference));
  }

  function handleRemoveSplitPayment(id: string): void {
    const nextList = splitPayments.filter((p) => p.id !== id);
    setSplitPayments(nextList);
    const nextSummary = calculateSplitPayments(totals.total, nextList);
    setNewSplitAmount(Math.max(0, nextSummary.remainingDifference));
  }

  function handleSelectConsumidorFinal(): void {
    const finalCustomer = {
      ...customer,
      nit: "222222222222",
      name: "CONSUMIDOR FINAL",
    };
    setCustomer(finalCustomer);
    setCustomerNit("222222222222");
    setCustomerName("CONSUMIDOR FINAL");
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setIsEditingCustomer(false);
    setShowManualCustomerInput(false);
  }

  function handleSelectTercero(t: Tercero): void {
    const displayName =
      t.razsoc?.trim() ||
      [t.nomter, t.nomter2, t.apeter, t.apeter2].filter(Boolean).join(" ").trim() ||
      t.nomcom?.trim() ||
      "Cliente";
    const selected = {
      ...customer,
      nit: t.nitter,
      name: displayName,
      phone: t.telter || t.movter || customer.phone,
      address: t.dirter || customer.address,
    };
    setCustomer(selected);
    setCustomerNit(t.nitter);
    setCustomerName(displayName);
    setCustomerSearchQuery("");
    setCustomerSearchResults([]);
    setIsEditingCustomer(false);
    setShowManualCustomerInput(false);
  }

  function handleSaveCustomer(): void {
    setCustomer({
      ...customer,
      nit: customerNit.trim() || "222222222222",
      name: customerName.trim() || "Consumidor Final",
    });
    setIsEditingCustomer(false);
    setShowManualCustomerInput(false);
  }

  function handleProcessQRText(textToProcess: string): void {
    const parsed = parseBancolombiaQRText(textToProcess);
    if (!parsed.rawMatched) {
      setQrFeedback({ matched: false });
      return;
    }

    if (parsed.reference) {
      setReference(parsed.reference);
    }

    if (parsed.customerName) {
      setCustomer({
        ...customer,
        name: parsed.customerName,
      });
      setCustomerName(parsed.customerName);
    }

    const amountDiffers =
      parsed.amount !== undefined && Math.abs(parsed.amount - totals.total) > 1;

    setQrFeedback({
      name: parsed.customerName,
      ref: parsed.reference,
      matched: true,
      amountMismatch: amountDiffers,
      detectedAmount: parsed.amount,
    });
  }

  async function handlePasteFromClipboard(): Promise<void> {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        const clipText = await navigator.clipboard.readText();
        if (clipText) {
          setQrRawText(clipText);
          handleProcessQRText(clipText);
        }
      }
    } catch {
      // Si el navegador bloquea permisos de portapapeles, el usuario puede pegar manualmente
    }
  }

  async function handleConfirmSale(): Promise<void> {
    if (cart.length === 0) return;

    let paymentsPayload: PaymentEntry[];
    let effectiveCashReceived: number;
    let effectiveChange: number;

    if (paymentMode === "UNA_FORMA") {
      if (!isCashComplete && selectedMethod === "EFECTIVO") {
        setErrorMessage("El efectivo recibido es menor al total a pagar.");
        return;
      }
      paymentsPayload = [
        {
          id: `pay-${Date.now()}`,
          method: selectedMethod,
          amount: totals.total,
          reference: reference.trim() || undefined,
        },
      ];
      effectiveCashReceived = selectedMethod === "EFECTIVO" ? cashReceived : totals.total;
      effectiveChange = change;
    } else {
      // VARIAS FORMAS DE PAGO (sgHermes)
      if (!isMultiPaymentValid) {
        setErrorMessage(
          `La suma de las formas de pago debe ser exactamente igual al total (${formatMoneyFull(totals.total)}). Diferencia pendiente: ${formatMoneyFull(splitSummary.remainingDifference)}`,
        );
        return;
      }
      paymentsPayload = [...splitPayments];
      const cashPortion = splitPayments
        .filter((p) => p.method === "EFECTIVO")
        .reduce((sum, p) => sum + p.amount, 0);
      effectiveCashReceived = cashPortion;
      effectiveChange = 0;
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
      payments: paymentsPayload,
      cashReceived: effectiveCashReceived,
      changeGiven: effectiveChange,
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
        const totalCash = paymentsPayload
          .filter((p) => p.method === "EFECTIVO")
          .reduce((sum, p) => sum + p.amount, 0);
        const hasCash = totalCash > 0;

        recordSaleInSession(totalCash > 0 ? totalCash : totals.total, hasCash);
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
      className="fixed inset-0 z-50 m-auto flex h-[92vh] max-h-[760px] w-[95vw] max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-surface text-text-primary shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm p-0 animate-in fade-in zoom-in-95 duration-150"
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 text-text-muted">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-wide text-text-secondary">
                Cliente y Comprobante
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleSelectConsumidorFinal}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  customer.nit === "222222222222"
                    ? "bg-primary text-primary-fg shadow-xs"
                    : "bg-surface border border-border text-text-secondary hover:bg-surface-alt hover:text-text-primary"
                }`}
                title="Asignar Consumidor Final (NIT 222222222222)"
              >
                👤 Consumidor Final
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditingCustomer(!isEditingCustomer);
                  setShowManualCustomerInput(false);
                }}
                className="rounded-lg bg-surface border border-border px-2.5 py-1 text-xs font-bold text-primary hover:bg-surface-alt transition-colors"
              >
                {isEditingCustomer ? "Cerrar" : "🔍 Buscar / Cambiar"}
              </button>
            </div>
          </div>

          {isEditingCustomer ? (
            <div className="mt-3 space-y-2.5">
              {/* Buscador de terceros en vivo */}
              <div>
                <label className="text-[11px] font-bold text-text-muted block mb-1">
                  Buscar por Cédula, NIT o Nombre
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    placeholder="Escribe el nombre o documento..."
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 pl-8 text-xs font-medium focus:border-primary focus:outline-none"
                    autoFocus
                  />
                  <span className="absolute left-2.5 top-2.5 text-xs text-text-muted">
                    🔍
                  </span>
                  {isSearchingCustomer && (
                    <span className="absolute right-3 top-2.5 text-xs font-bold text-primary animate-pulse">
                      Buscando...
                    </span>
                  )}
                </div>
              </div>

              {/* Lista de resultados de búsqueda */}
              {customerSearchResults.length > 0 && (
                <div className="max-h-36 overflow-y-auto rounded-xl border border-border bg-surface divide-y divide-border shadow-xs">
                  {customerSearchResults.map((t) => {
                    const name =
                      t.razsoc?.trim() ||
                      [t.nomter, t.nomter2, t.apeter, t.apeter2].filter(Boolean).join(" ").trim() ||
                      t.nomcom?.trim() ||
                      "Cliente";
                    return (
                      <button
                        key={t.nitter}
                        type="button"
                        onClick={() => handleSelectTercero(t)}
                        className="w-full text-left px-3 py-2 hover:bg-primary/10 transition-colors flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-text-primary truncate">{name}</p>
                          <p className="text-[10px] font-mono text-text-muted">NIT: {t.nitter}</p>
                        </div>
                        <span className="shrink-0 text-[10px] font-bold text-primary">
                          Seleccionar ↵
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {customerSearchQuery.trim().length >= 2 && !isSearchingCustomer && customerSearchResults.length === 0 && (
                <p className="text-[11px] text-text-muted italic px-1">
                  No se encontraron terceros registrados con ese criterio.
                </p>
              )}

              {/* Opción de ingreso manual */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowManualCustomerInput(!showManualCustomerInput)}
                  className="text-[11px] font-bold text-text-secondary hover:text-primary transition-colors flex items-center gap-1"
                >
                  <span>{showManualCustomerInput ? "▼" : "▶"}</span>
                  <span>O ingresar manualmente (nuevo cliente sin registrar)</span>
                </button>

                {showManualCustomerInput && (
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 rounded-xl border border-border bg-surface">
                    <div>
                      <label className="text-[11px] font-bold text-text-muted">NIT / Cédula</label>
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
                        Aplicar Datos
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center justify-between text-xs gap-2">
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

        {/* Selector de Modo: Una forma de pago vs Varias formas de pago (sgHermes) */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-surface-alt/70 p-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Modo de Cobro:
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setPaymentMode("UNA_FORMA")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                paymentMode === "UNA_FORMA"
                  ? "bg-primary text-primary-fg shadow-xs"
                  : "bg-surface border border-border text-text-muted hover:text-text-primary"
              }`}
            >
              <span>🔘</span>
              <span>Una forma de pago</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPaymentMode("VARIAS_FORMAS");
                if (splitPayments.length === 0) {
                  setNewSplitAmount(totals.total);
                }
              }}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                paymentMode === "VARIAS_FORMAS"
                  ? "bg-primary text-primary-fg shadow-xs"
                  : "bg-surface border border-border text-text-muted hover:text-text-primary"
              }`}
            >
              <span>📑</span>
              <span>Varias formas de pago (sgHermes)</span>
            </button>
          </div>
        </div>

        {paymentMode === "VARIAS_FORMAS" ? (
          /* ======================================================== */
          /* MODO VARIAS FORMAS DE PAGO (sgHermes FORMAS DE PAGO)     */
          /* ======================================================== */
          <div className="space-y-3.5">
            {/* Formulario de agregar pago parcial */}
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <span>➕</span>
                  <span>Añadir Forma de Pago</span>
                </span>
                <span className="text-[11px] font-semibold text-text-muted">
                  Saldo pendiente por cubrir:{" "}
                  <strong
                    className={
                      splitSummary.remainingDifference > 0
                        ? "text-amber-800 font-bold"
                        : "text-emerald-800 font-bold"
                    }
                  >
                    {formatMoneyFull(Math.max(0, splitSummary.remainingDifference))}
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                {/* Selector de Método */}
                <div className="sm:col-span-4">
                  <label
                    htmlFor="newSplitMethodSelect"
                    className="text-[11px] font-bold text-text-muted block mb-1"
                  >
                    Forma de Pago
                  </label>
                  <select
                    id="newSplitMethodSelect"
                    value={newSplitMethod}
                    onChange={(e) => setNewSplitMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-text-primary focus:border-primary focus:outline-none"
                  >
                    <option value="EFECTIVO">💵 EFECTIVO (F01)</option>
                    <option value="TRANSFERENCIA">📱 TRANSFERENCIA / BANCO (F07)</option>
                    <option value="DATAFONO">💳 DATÁFONO / TARJETA (F03)</option>
                    <option value="CREDITO">📝 CRÉDITO / CARTERA (F10)</option>
                  </select>
                </div>

                {/* Monto a abonar */}
                <div className="sm:col-span-4">
                  <label
                    htmlFor="newSplitAmountInput"
                    className="text-[11px] font-bold text-text-muted block mb-1"
                  >
                    Valor a Aplicar (COP)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-text-muted">
                      $
                    </span>
                    <input
                      id="newSplitAmountInput"
                      type="number"
                      step="50"
                      value={newSplitAmount || ""}
                      onChange={(e) =>
                        setNewSplitAmount(Math.max(0, parseInt(e.target.value, 10) || 0))
                      }
                      placeholder="0"
                      className="w-full rounded-xl border border-border bg-surface px-3 py-2 pl-7 text-xs font-black text-text-primary focus:border-primary focus:outline-none tabular-nums"
                    />
                  </div>
                </div>

                {/* Referencia o Comprobante */}
                <div className="sm:col-span-4">
                  <label
                    htmlFor="newSplitRefInput"
                    className="text-[11px] font-bold text-text-muted block mb-1"
                  >
                    Referencia / Comprobante
                  </label>
                  <input
                    id="newSplitRefInput"
                    type="text"
                    value={newSplitReference}
                    onChange={(e) => setNewSplitReference(e.target.value)}
                    placeholder="Ej. Ref 0092055984"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Botón de añadir y atajo para saldo restante */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() =>
                    setNewSplitAmount(Math.max(0, splitSummary.remainingDifference))
                  }
                  disabled={splitSummary.remainingDifference <= 0}
                  className="text-[11px] font-bold text-primary hover:underline disabled:opacity-50 disabled:no-underline"
                >
                  Cubrir saldo restante ({formatMoneyFull(Math.max(0, splitSummary.remainingDifference))})
                </button>

                <button
                  type="button"
                  onClick={handleAddSplitPayment}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-fg hover:bg-primary-dark transition-colors shadow-xs active:scale-95 flex items-center gap-1.5"
                >
                  <span>+</span>
                  <span>Agregar Pago</span>
                </button>
              </div>
            </div>

            {/* Tabla de pagos agregados (sgHermes) */}
            <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-xs">
              <div className="bg-surface-alt px-3.5 py-2 border-b border-border flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-text-secondary">
                  Detalles de pago ({splitPayments.length}{" "}
                  {splitPayments.length === 1 ? "forma" : "formas"})
                </span>
                <span className="text-[11px] text-text-muted font-mono">
                  Paridad tabla `detapago`
                </span>
              </div>

              {splitPayments.length === 0 ? (
                <div className="p-6 text-center text-xs text-text-muted">
                  No has agregado formas de pago todavía. Selecciona una forma arriba y pulsa
                  &quot;Agregar Pago&quot;.
                </div>
              ) : (
                <div className="divide-y divide-border overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-surface-alt/50 text-[11px] font-bold text-text-muted uppercase">
                        <th className="py-2 px-3">Item</th>
                        <th className="py-2 px-3">Forma de Pago</th>
                        <th className="py-2 px-3 text-right">Valor</th>
                        <th className="py-2 px-3">Referencia / Comprobante</th>
                        <th className="py-2 px-3 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {splitPayments.map((p, idx) => (
                        <tr key={p.id} className="hover:bg-surface-alt/50 transition-colors">
                          <td className="py-2 px-3 font-mono text-[11px] text-text-muted">
                            {idx}
                          </td>
                          <td className="py-2 px-3 font-bold text-text-primary">
                            {p.method === "EFECTIVO" && "💵 EFECTIVO"}
                            {p.method === "TRANSFERENCIA" && "📱 CONSIGNACION BANCO"}
                            {p.method === "DATAFONO" && "💳 TARJETA / DATAFONO"}
                            {p.method === "CREDITO" && "📝 CUENTAS X COBRAR"}
                          </td>
                          <td className="py-2 px-3 text-right font-black text-text-primary tabular-nums">
                            {formatMoneyFull(p.amount)}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-text-secondary">
                            {p.reference || "—"}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveSplitPayment(p.id)}
                              className="rounded-lg p-1 text-text-muted hover:bg-rose-50 hover:text-rose-600 transition-colors"
                              title="Eliminar forma de pago"
                              aria-label="Eliminar"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Barra de Totales y Diferencia (idéntica a la ventana de sgHermes) */}
              <div className="bg-surface-dark text-text-inverse px-4 py-3 border-t border-border grid grid-cols-3 gap-2 text-center items-center">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted block">
                    Total
                  </span>
                  <span className="text-sm font-black text-text-inverse tabular-nums">
                    {formatMoneyFull(totals.total)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted block">
                    Debe sumar
                  </span>
                  <span className="text-sm font-black text-primary tabular-nums">
                    {formatMoneyFull(splitSummary.totalPaid)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-text-muted block">
                    Diferencia
                  </span>
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-lg text-sm font-black tabular-nums ${
                      splitSummary.isBalanced && splitPayments.length > 0
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {formatMoneyFull(splitSummary.remainingDifference)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ======================================================== */
          /* MODO UNA SOLA FORMA DE PAGO (FLUJO DIRECTO)              */
          /* ======================================================== */
          <>
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
                  <label
                    htmlFor="cashReceivedInput"
                    className="text-xs font-bold uppercase tracking-wide text-text-secondary"
                  >
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
                    onChange={(e) =>
                      setCashReceived(Math.max(0, parseInt(e.target.value, 10) || 0))
                    }
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

            {/* Campos específicos para Transferencia con Asistente QR Bancolombia */}
            {selectedMethod === "TRANSFERENCIA" && (
              <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="refInput"
                    className="text-xs font-bold uppercase tracking-wide text-text-secondary"
                  >
                    Referencia / Comprobante Bancolombia / Nequi
                  </label>
                  {customer.nit !== "222222222222" && (
                    <button
                      type="button"
                      onClick={handleSelectConsumidorFinal}
                      className="text-xs font-bold text-primary hover:underline"
                    >
                      Asignar Consumidor Final
                    </button>
                  )}
                </div>

                <input
                  id="refInput"
                  type="text"
                  value={reference}
                  onChange={(e) => {
                    // Lo que escribe el operador gana: el prellenado no lo pisa.
                    referenceDirtyRef.current = true;
                    setReference(sanitizeBancolombiaReference(e.target.value));
                  }}
                  onBlur={(e) => setReference(sanitizeBancolombiaReference(e.target.value))}
                  placeholder="Ej. 0092055984 (el sufijo 'null' se remueve automáticamente)"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold focus:border-primary focus:outline-none font-mono"
                />

                {/* Verificación contra el nodo local del banco */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleVerificarTransferencia()}
                    disabled={isVerifyingBank}
                    className="rounded-xl border border-primary bg-primary/10 px-3 py-1.5 text-xs font-black text-primary transition-colors hover:bg-primary/20 disabled:cursor-wait disabled:opacity-60"
                  >
                    {isVerifyingBank ? "Consultando el banco…" : "Verificar transacción"}
                  </button>
                  {isVerifyingBank && bankConsultedOn && (
                    <span role="status" className="text-xs font-medium text-text-muted">
                      Hoy, {formatSpanishDayMonth(bankConsultedOn)}
                    </span>
                  )}
                </div>

                {bankStartError && (
                  <p
                    role="alert"
                    className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs font-medium text-rose-900"
                  >
                    {bankStartError}
                  </p>
                )}

                {bankTimedOut && (
                  <div
                    role="alert"
                    className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs font-medium text-amber-900"
                  >
                    <p>
                      La consulta al banco superó los 5 minutos y se detuvo. No
                      se confirmó ningún pago.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleVerificarTransferencia()}
                      className="rounded-lg border border-amber-500/40 bg-surface px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-500/10"
                    >
                      Reintentar
                    </button>
                  </div>
                )}

                {activeBankJob?.estado === "esperando_otp" && (
                  <p
                    role="status"
                    className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs font-medium text-amber-900"
                  >
                    El banco pide un código: ingrésalo en la consola del nodo local
                  </p>
                )}

                {activeBankJob?.estado === "sin_coincidencia" && (
                  <div
                    role="status"
                    className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs font-medium text-amber-900"
                  >
                    <p>
                      No entró un pago de {formatMoneyFull(totals.total)} hoy.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleVerificarTransferencia()}
                      className="rounded-lg border border-amber-500/40 bg-surface px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-500/10"
                    >
                      Reintentar
                    </button>
                  </div>
                )}

                {activeBankJob?.estado === "ambiguo" && (
                  <div
                    role="status"
                    className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs font-medium text-amber-900"
                  >
                    <p>El banco encontró varios pagos con este valor. Elegí el correcto:</p>
                    {ambiguousCandidates.length > 0 ? (
                      <div className="space-y-2">
                        {ambiguousCandidates.map((candidato) => (
                          <button
                            key={candidato.id}
                            type="button"
                            onClick={() => aplicarCandidato(candidato)}
                            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-left text-xs font-semibold text-text-secondary transition-colors hover:border-primary hover:text-primary"
                          >
                            <span className="block font-bold text-text-primary">
                              {candidato.pagadorNombre}
                            </span>
                            <span className="mt-0.5 block font-mono text-[11px]">
                              {candidato.referencia}
                            </span>
                            <span className="mt-0.5 block">
                              {formatMoneyFull(Number(candidato.valor))}
                              {candidato.fecha
                                ? ` · ${formatSpanishLongDate(candidato.fecha)}`
                                : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p>No se pudieron cargar los candidatos. Reintentá la verificación.</p>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleVerificarTransferencia()}
                      className="rounded-lg border border-amber-500/40 bg-surface px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-500/10"
                    >
                      Reintentar
                    </button>
                  </div>
                )}

                {bankTerminalError && (
                  <div
                    role="alert"
                    className="space-y-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs font-medium text-rose-900"
                  >
                    <p>{bankTerminalError}</p>
                    <button
                      type="button"
                      onClick={() => void handleVerificarTransferencia()}
                      className="rounded-lg border border-rose-500/40 bg-surface px-2.5 py-1 text-xs font-bold text-rose-900 hover:bg-rose-500/10"
                    >
                      Reintentar
                    </button>
                  </div>
                )}

                {resolvedCandidate && (
                  <div
                    data-testid="bank-verification-confirmation"
                    className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-sm font-black text-white"
                      >
                        ✓
                      </span>
                      <p className="text-sm font-bold text-emerald-900">Pago confirmado</p>
                    </div>
                    <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="font-bold uppercase tracking-wide text-emerald-800/70">
                          Pagador
                        </dt>
                        <dd className="font-semibold text-emerald-950">
                          {resolvedCandidate.pagadorNombre}
                        </dd>
                      </div>
                      {resolvedCandidate.nitter &&
                        !NITS_CONSUMIDOR_FINAL.has(resolvedCandidate.nitter) && (
                          <div>
                            <dt className="font-bold uppercase tracking-wide text-emerald-800/70">
                              NIT del cliente
                            </dt>
                            <dd className="font-mono font-semibold text-emerald-950">
                              {resolvedCandidate.nitter}
                            </dd>
                          </div>
                        )}
                      {resolvedCandidate.clienteNombre && (
                        <div>
                          <dt className="font-bold uppercase tracking-wide text-emerald-800/70">
                            Cliente
                          </dt>
                          <dd className="font-semibold text-emerald-950">
                            {resolvedCandidate.clienteNombre}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt className="font-bold uppercase tracking-wide text-emerald-800/70">
                          Valor
                        </dt>
                        <dd className="font-semibold text-emerald-950">
                          {formatMoneyFull(Number(resolvedCandidate.valor))}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-bold uppercase tracking-wide text-emerald-800/70">
                          Fecha del movimiento
                        </dt>
                        <dd className="font-semibold text-emerald-950">
                          {formatSpanishLongDate(resolvedCandidate.fecha) ||
                            resolvedCandidate.fecha}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-bold uppercase tracking-wide text-emerald-800/70">
                          Referencia bancaria
                        </dt>
                        <dd className="font-mono font-semibold text-emerald-950">
                          {resolvedCandidate.referencia}
                        </dd>
                      </div>
                    </dl>
                    {reviewedNote && (
                      <p className="text-[11px] font-medium text-emerald-800/80">
                        {reviewedNote}
                      </p>
                    )}
                  </div>
                )}

                {/* Asistente inteligente QR Bancolombia */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                      <span>⚡</span>
                      <span>Asistente Comprobante QR Bancolombia</span>
                    </div>
                    <button
                      type="button"
                      onClick={handlePasteFromClipboard}
                      className="rounded-lg bg-surface border border-primary/30 px-2 py-0.5 text-[11px] font-bold text-primary hover:bg-primary/10 transition-colors"
                    >
                      📋 Pegar del Portapapeles
                    </button>
                  </div>

                  <p className="text-[11px] text-text-secondary leading-snug">
                    Pega la línea copiada de movimientos Bancolombia (ej:{" "}
                    <code className="font-mono bg-surface px-1 py-0.5 rounded text-[10px]">
                      PAGO QR JUAN PEREZ 0092055984 null $ 45.000
                    </code>
                    ). Extrae el nombre del pagador y la referencia sin el{" "}
                    <code className="text-rose-600 font-mono">null</code>.
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={qrRawText}
                      onChange={(e) => {
                        setQrRawText(e.target.value);
                        if (e.target.value.trim()) {
                          handleProcessQRText(e.target.value);
                        }
                      }}
                      placeholder="Pega aquí el movimiento o descripción del QR..."
                      className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium focus:border-primary focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleProcessQRText(qrRawText)}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-black text-primary-fg shrink-0 hover:bg-primary-dark transition-colors"
                    >
                      Procesar
                    </button>
                  </div>

                  {/* Feedback del procesamiento */}
                  {qrFeedback && (
                    <div
                      className={`rounded-lg p-2.5 text-xs font-medium space-y-1 ${
                        qrFeedback.matched
                          ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-900"
                          : "bg-amber-500/10 border border-amber-500/30 text-amber-900"
                      }`}
                    >
                      {qrFeedback.matched ? (
                        <>
                          {qrFeedback.name && (
                            <p className="font-bold flex items-center gap-1">
                              <span>✓</span>
                              <span>Cliente asignado:</span>
                              <span className="font-black text-emerald-950 underline">
                                {qrFeedback.name}
                              </span>
                            </p>
                          )}
                          {qrFeedback.ref && (
                            <p className="font-mono text-[11px]">
                              ✓ Referencia asignada:{" "}
                              <strong className="font-bold">{qrFeedback.ref}</strong> (sufijo &apos;null&apos; eliminado)
                            </p>
                          )}
                          {qrFeedback.amountMismatch && qrFeedback.detectedAmount && (
                            <p className="text-amber-800 font-bold text-[11px] pt-0.5">
                              ⚠️ Aviso: El monto en el comprobante ({formatMoneyFull(qrFeedback.detectedAmount)}) no coincide exactamente con el total ({formatMoneyFull(totals.total)}).
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-amber-800 text-[11px]">
                          No se detectó un patrón de Pago QR o referencia en el texto ingresado.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Campos adicionales para Datáfono */}
            {selectedMethod === "DATAFONO" && (
              <div className="rounded-2xl border border-border bg-surface p-4 space-y-2">
                <label
                  htmlFor="refInputDatafono"
                  className="text-xs font-bold uppercase tracking-wide text-text-secondary"
                >
                  Número de Aprobación Datáfono / Voucher
                </label>
                <input
                  id="refInputDatafono"
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Ej. Aprobación 8921 / Voucher Visa"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm font-medium focus:border-primary focus:outline-none"
                />
              </div>
            )}
          </>
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
          disabled={isSubmitting || (paymentMode === "UNA_FORMA" ? !isCashComplete : !isMultiPaymentValid)}
          onClick={handleConfirmSale}
          className={`w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl px-7 py-3 text-sm font-black text-primary-fg shadow-lg transition-all ${
            isSubmitting || (paymentMode === "UNA_FORMA" ? !isCashComplete : !isMultiPaymentValid)
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
