"use client";

import type { BankCandidato } from "@/lib/erp/bank";
import { formatSpanishLongDate } from "@/lib/erp/bankPresentation";
import { formatMoneyFull } from "@/lib/format/currency";
import type { EstadoSesion } from "@/components/sales/useColaVerificacion";

/**
 * Etapas que publica el nodo mientras raspa. `pct` es el umbral que marca la
 * etapa como cumplida; el orden es el del scrape.
 */
const ETAPAS: ReadonlyArray<{ paso: string; pct: number; label: string }> = [
  { paso: "credencial_lista", pct: 10, label: "Preparando la credencial" },
  { paso: "navegador_abierto", pct: 20, label: "Abriendo el navegador" },
  { paso: "sesion_iniciada", pct: 35, label: "Sesión del banco iniciada" },
  { paso: "cuenta_abierta", pct: 55, label: "Cuenta encontrada" },
  { paso: "movimientos_leidos", pct: 80, label: "Movimientos leídos" },
  { paso: "buscando_el_pago", pct: 90, label: "Buscando el pago" },
  { paso: "listo", pct: 100, label: "Listo" },
];

export interface BankVerifyModalProps {
  open: boolean;
  onClose: () => void;
  /** Importe exacto a buscar en la cuenta del banco. */
  valor: number;
  /** Día a consultar (`AAAA-MM-DD`). */
  fecha: string;
  /** Identificación de la venta, sólo para el encabezado. */
  referencia: string;
  /** Estado de la cola para esta factura. `undefined` = todavía no se pidió. */
  sesion?: EstadoSesion;
  /** 1 = se está corriendo; 2 = primera en espera; `null` = no está en la cola. */
  posicion: number | null;
  /** Cuántas verificaciones hay en la cola en total. */
  total: number;
  /** Encola la verificación de esta factura. */
  onVerificar: () => void;
}

/**
 * Verificación de un pago **para una venta que ya existe**.
 *
 * Es presentacional a propósito: el estado (job, etapa, cola) lo lleva
 * `useColaVerificacion` en la página. Así, cerrar esta factura y abrir otra no
 * pierde el progreso, y el nodo nunca recibe dos scrapes a la vez — el segundo
 * espera su turno en vez de fallar contra el turno de sesión.
 */
export function BankVerifyModal({
  open,
  onClose,
  valor,
  fecha,
  referencia,
  sesion,
  posicion,
  total,
  onVerificar,
}: BankVerifyModalProps): JSX.Element | null {
  if (!open) return null;

  const enCola = sesion?.estado === "en_cola" || (sesion === undefined && posicion !== null && posicion > 1);
  const corriendo =
    sesion?.estado === "consultando" || sesion?.estado === "esperando_otp";
  const pct = Math.max(0, Math.min(100, sesion?.pct ?? 0));
  const etapaActual = ETAPAS.reduce(
    (indice, etapa, i) => (pct >= etapa.pct ? i : indice),
    -1,
  );
  const candidato: BankCandidato | null =
    sesion?.estado === "resuelto" ? (sesion.candidato ?? null) : null;
  const ambiguos: BankCandidato[] =
    sesion?.estado === "ambiguo" ? (sesion.candidatos ?? []) : [];

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

        {sesion?.estado === "fallido" && (
          <p
            role="alert"
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs font-medium text-rose-900"
          >
            {sesion.error ?? "La consulta al banco falló."}
          </p>
        )}

        {enCola && (
          <div
            role="status"
            data-testid="bank-verify-en-cola"
            className="space-y-1 rounded-lg border border-sky-500/30 bg-sky-500/10 p-2.5 text-xs font-medium text-sky-900"
          >
            <p>
              Hay otra verificación en curso. Esta va a arrancar sola cuando
              termine — no hace falta que vuelvas a tocar nada.
            </p>
            {posicion !== null && (
              <p className="font-bold">
                Posición {posicion} de {Math.max(total, posicion)}
              </p>
            )}
          </div>
        )}

        {corriendo && (
          <div className="space-y-2" data-testid="bank-verify-progreso">
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-alt">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p role="status" className="text-xs font-semibold">
              {sesion?.paso === "esperando_otp"
                ? "El banco pide un código: ingrésalo en la consola del nodo."
                : (ETAPAS[etapaActual]?.label ?? "Consultando el banco…")}
              <span className="ml-1 font-normal text-text-muted">{pct}%</span>
            </p>
            <ol className="space-y-0.5 text-[11px] text-text-muted">
              {ETAPAS.map((etapa, i) => (
                <li
                  key={etapa.paso}
                  className={
                    i <= etapaActual ? "text-emerald-700 font-semibold" : ""
                  }
                >
                  {i <= etapaActual ? "✓" : "·"} {etapa.label}
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-text-muted">
              Podés cerrar esta ventana: la consulta sigue y el resultado queda
              guardado en la factura.
            </p>
          </div>
        )}

        {sesion?.estado === "sin_coincidencia" && (
          <p
            role="status"
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs font-medium text-amber-900"
          >
            No entró un pago de {formatMoneyFull(valor)} el{" "}
            {formatSpanishLongDate(fecha) || fecha}.
          </p>
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
                  Es la misma en todos los pagos QR de la tienda.
                </dd>
              </div>
            </dl>
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
            onClick={onVerificar}
            disabled={corriendo || enCola}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-fg hover:bg-primary-dark disabled:opacity-50"
          >
            {enCola
              ? "En cola"
              : corriendo
                ? "Consultando…"
                : sesion?.estado === "resuelto"
                  ? "Verificar de nuevo"
                  : "Verificar en el banco"}
          </button>
        </div>
      </div>
    </div>
  );
}
