"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBankVerification } from "@/lib/api/hooks";
import {
  createBankVerification,
  esEstadoFinal,
  mensajeDeErrorDeVerificacion,
  resultadoDelJob,
  type BankCandidato,
} from "@/lib/erp/bank";
import { formatSpanishLongDate } from "@/lib/erp/bankPresentation";
import { formatMoneyFull } from "@/lib/format/currency";

/** TTL del job de verificación: pasado este tiempo no se sondea más. */
const BANK_VERIFICATION_TIMEOUT_MS = 300_000;

export interface BankVerifyModalProps {
  open: boolean;
  onClose: () => void;
  /** Importe exacto a buscar en la cuenta del banco. */
  valor: number;
  /** Día a consultar (`AAAA-MM-DD`). Sin esto el nodo mira el día en curso. */
  fecha: string;
  /** Identificación de la venta, sólo para el encabezado. */
  referencia: string;
  /** Nombre del cliente: señal opcional, nunca decide el match. */
  nombreEsperado?: string;
}

/**
 * Verificación de un pago **para una venta que ya existe**.
 *
 * Es el hermano retroactivo del botón del POS: allí se verifica antes de
 * facturar (modo `pago` sin factura), acá se verifica una factura del día o de
 * ayer que quedó a crédito. El importe y la fecha se toman de la venta, así que
 * el nodo consulta el día en que esa plata pudo haber entrado.
 *
 * No aplica nada: sólo informa. La conciliación la sigue haciendo el operador.
 */
export function BankVerifyModal({
  open,
  onClose,
  valor,
  fecha,
  referencia,
  nombreEsperado,
}: BankVerifyModalProps): JSX.Element | null {
  const [jobId, setJobId] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const limpiarTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Al abrir otra venta (o cerrar) el job anterior no sirve: es de otro importe
  // y de otro día.
  useEffect(() => {
    if (!open) return;
    setJobId(null);
    setStartError(null);
    setTimedOut(false);
    limpiarTimeout();
  }, [open, fecha, valor, limpiarTimeout]);

  useEffect(() => () => limpiarTimeout(), [limpiarTimeout]);

  const { data } = useBankVerification(jobId, {
    refreshInterval: 3_000,
  });

  // `useBankVerification` conserva el dato anterior entre claves
  // (`keepPreviousData`): al abrir otra factura su `data` sigue siendo el del
  // job previo. Sólo vale el job que este modal creó, y sólo si el id coincide.
  const job = data && jobId !== null && data.job_id === jobId ? data : null;

  const estado = job?.estado ?? null;
  const terminal = estado !== null && esEstadoFinal(estado);
  const resultado = resultadoDelJob(job);

  useEffect(() => {
    if (!jobId || !terminal) return;
    limpiarTimeout();
  }, [jobId, terminal, limpiarTimeout]);

  const verificar = useCallback(async () => {
    setStartError(null);
    setTimedOut(false);
    limpiarTimeout();
    try {
      const nuevo = await createBankVerification({
        valor,
        fecha,
        ...(nombreEsperado ? { nombreEsperado } : {}),
      });
      setJobId(nuevo.job_id);
      timeoutRef.current = setTimeout(() => {
        setTimedOut(true);
        setJobId(null);
      }, BANK_VERIFICATION_TIMEOUT_MS);
    } catch (error) {
      setJobId(null);
      setStartError(
        mensajeDeErrorDeVerificacion(error) ??
          "No se pudo iniciar la consulta al banco.",
      );
    }
  }, [valor, fecha, nombreEsperado, limpiarTimeout]);

  if (!open) return null;

  const consultando =
    jobId !== null && (estado === null || !terminal) && !timedOut;
  const candidato: BankCandidato | null =
    estado === "resuelto" ? (resultado?.candidato ?? null) : null;
  const ambiguos: BankCandidato[] =
    estado === "ambiguo" ? (resultado?.candidatos ?? []) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bank-verify-title"
        data-testid="bank-verify-modal"
        className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-surface p-4 text-text-primary shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="bank-verify-title" className="text-base font-bold">
              Verificar pago
            </h2>
            <p className="text-xs text-text-muted">
              {referencia} · {formatMoneyFull(valor)} ·{" "}
              {formatSpanishLongDate(fecha) || fecha}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg border border-border px-2 py-1 text-xs font-bold text-text-secondary hover:bg-surface-alt"
          >
            ✕
          </button>
        </div>

        {startError !== null && (
          <p
            role="alert"
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs font-medium text-rose-900"
          >
            {startError}
          </p>
        )}

        {timedOut && (
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs font-medium text-amber-900"
          >
            <p>
              La consulta superó los 5 minutos y se detuvo. No se confirmó
              ningún pago.
            </p>
          </div>
        )}

        {consultando && (
          <p role="status" className="text-xs font-medium text-text-secondary">
            Consultando el banco… puede tardar hasta un minuto.
          </p>
        )}

        {estado === "esperando_otp" && (
          <p
            role="status"
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs font-medium text-amber-900"
          >
            El banco pide un código: ingrésalo en la consola del nodo local.
          </p>
        )}

        {estado === "sin_coincidencia" && (
          <div
            role="status"
            className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs font-medium text-amber-900"
          >
            <p>
              No entró un pago de {formatMoneyFull(valor)} el{" "}
              {formatSpanishLongDate(fecha) || fecha}.
            </p>
          </div>
        )}

        {ambiguos.length > 0 && (
          <div
            role="status"
            className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs font-medium text-amber-900"
          >
            <p>El banco encontró varios pagos con este valor:</p>
            <ul className="space-y-1">
              {ambiguos.map((item) => (
                <li key={item.id} className="rounded-lg bg-surface p-2">
                  <span className="block font-bold text-text-primary">
                    {item.pagadorNombre}
                  </span>
                  <span className="block font-mono text-[11px] text-text-muted">
                    ref. comercio {item.referencia}
                  </span>
                  <span className="block">
                    {formatMoneyFull(Number(item.valor))} ·{" "}
                    {formatSpanishLongDate(item.fecha) || item.fecha}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {estado === "fallido" && (
          <p
            role="alert"
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs font-medium text-rose-900"
          >
            {mensajeDeErrorDeVerificacion(job?.error) ??
              "La consulta al banco falló."}
          </p>
        )}

        {candidato !== null && (
          <div
            data-testid="bank-verify-confirmation"
            className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-950"
          >
            <p className="text-sm font-bold text-emerald-900">Pago encontrado</p>
            <dl className="space-y-1">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-emerald-800/70">
                  Pagador
                </dt>
                <dd className="font-semibold">{candidato.pagadorNombre}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-emerald-800/70">
                    Valor
                  </dt>
                  <dd className="font-semibold">
                    {formatMoneyFull(Number(candidato.valor))}
                  </dd>
                </div>
                <div className="text-right">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-emerald-800/70">
                    Fecha
                  </dt>
                  <dd className="font-semibold">
                    {formatSpanishLongDate(candidato.fecha) || candidato.fecha}
                  </dd>
                </div>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wide text-emerald-800/70">
                  Referencia del comercio
                </dt>
                <dd className="font-mono font-semibold">
                  {candidato.referencia}
                </dd>
                <dd className="text-[10px] text-emerald-800/70">
                  Es la misma en todos los pagos QR de la tienda: identifica al
                  comercio, no a este pago.
                </dd>
              </div>
            </dl>
            <p className="text-[11px] font-medium text-emerald-800/80">
              Sólo se informa: la venta no se modifica. Conciliá el pago por el
              camino de siempre.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-secondary hover:bg-surface-alt"
          >
            Cerrar
          </button>
          <button
            type="button"
            onClick={() => void verificar()}
            disabled={consultando}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-fg hover:bg-primary-dark disabled:opacity-50"
          >
            {consultando
              ? "Consultando…"
              : jobId !== null && !terminal
                ? "Consultando…"
                : "Verificar en el banco"}
          </button>
        </div>
      </div>
    </div>
  );
}
