"use client";

import { useCallback, useEffect, useState } from "react";
import {
  discardPendingSale,
  getPendingSales,
  syncPendingSale,
} from "@/lib/api/pos";
import type { SalePayload } from "@/lib/pos/types";
import { formatMoneyFull } from "@/lib/format/currency";

/**
 * Panel de ventas encoladas en este equipo.
 *
 * Antes el badge "N Offline" reintentaba todo de golpe, sin mostrar qué había
 * ni dejar elegir. El cajero no podía ver el detalle, mandar una sola ni
 * descartar la que ya no corresponde.
 */
export function PendingSalesPanel({
  open,
  onClose,
  onCountChange,
}: {
  open: boolean;
  onClose: () => void;
  /** Avisa a la página cuántas quedan (para el badge). */
  onCountChange?: (count: number) => void;
}): JSX.Element | null {
  const [ventas, setVentas] = useState<SalePayload[]>([]);
  const [cargando, setCargando] = useState(false);
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const cola = await getPendingSales();
    setVentas(cola);
    onCountChange?.(cola.length);
  }, [onCountChange]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAviso(null);
    setCargando(true);
    void cargar().finally(() => setCargando(false));
  }, [open, cargar]);

  const enviarUna = useCallback(
    async (id: string) => {
      setEnCurso(id);
      setError(null);
      setAviso(null);
      try {
        const resultado = await syncPendingSale(id);
        if (!resultado.ok) setError(resultado.error ?? "No se pudo enviar.");
        else setAviso("Venta registrada en el ERP.");
        await cargar();
      } finally {
        setEnCurso(null);
      }
    },
    [cargar],
  );

  const descartar = useCallback(
    async (id: string) => {
      setEnCurso(id);
      setError(null);
      setAviso(null);
      try {
        await discardPendingSale(id);
        setAviso("Venta descartada de este equipo.");
        await cargar();
      } finally {
        setEnCurso(null);
      }
    },
    [cargar],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pendientes-title"
        data-testid="pending-sales-panel"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface text-text-primary shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 id="pendientes-title" className="text-base font-bold">
              Ventas pendientes de envío
            </h2>
            <p className="text-xs text-text-muted">
              Están guardadas en este equipo. No aparecen en SgHermes hasta que
              se envíen.
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

        {error && (
          <p
            role="alert"
            className="border-b border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-900"
          >
            {error}
          </p>
        )}
        {aviso && (
          <p
            role="status"
            className="border-b border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-900"
          >
            {aviso}
          </p>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {cargando ? (
            <p className="text-sm text-text-muted">Cargando…</p>
          ) : ventas.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">
              No hay ventas pendientes en este equipo.
            </p>
          ) : (
            <ul className="space-y-2">
              {ventas.map((venta) => {
                const items = Array.isArray(venta.items) ? venta.items : [];
                const unidades = items.reduce(
                  (total, item) => total + Number(item.candet ?? 0),
                  0,
                );
                return (
                  <li
                    key={venta.id}
                    data-testid={`pending-sale-${venta.id}`}
                    className="rounded-xl border border-border bg-surface-alt/30 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-bold">
                        {formatMoneyFull(Number(venta.totals?.total ?? 0))}
                      </span>
                      <span className="text-xs text-text-muted">
                        {new Date(venta.createdAt).toLocaleString("es-CO")}
                      </span>
                      <span className="text-xs text-text-secondary">
                        {unidades} und ·{" "}
                        {venta.customer?.name || "Consumidor Final"}
                      </span>
                      <span className="ml-auto flex gap-2">
                        <button
                          type="button"
                          onClick={() => void enviarUna(venta.id)}
                          disabled={enCurso === venta.id}
                          className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-fg hover:bg-primary-dark disabled:opacity-50"
                        >
                          {enCurso === venta.id ? "Enviando…" : "Enviar esta"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void descartar(venta.id)}
                          disabled={enCurso === venta.id}
                          className="rounded-lg border border-rose-400/50 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-500/10 disabled:opacity-50"
                        >
                          Descartar
                        </button>
                      </span>
                    </div>

                    <ul className="mt-2 space-y-0.5 text-[11px] text-text-secondary">
                      {items.slice(0, 6).map((item) => (
                        <li key={item.id} className="flex justify-between gap-2">
                          <span className="truncate">
                            {item.candet} × {item.product?.name ?? item.product?.sku}
                          </span>
                          <span className="shrink-0 font-mono">
                            {formatMoneyFull(Number(item.totdet ?? 0))}
                          </span>
                        </li>
                      ))}
                      {items.length > 6 && (
                        <li className="text-text-muted">
                          y {items.length - 6} línea(s) más…
                        </li>
                      )}
                    </ul>

                    {venta.syncError && (
                      <p className="mt-2 rounded-lg bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-800">
                        Último error: {venta.syncError}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <span className="text-xs text-text-muted">
            {ventas.length} venta(s) guardada(s) en este equipo
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-text-secondary hover:bg-surface-alt"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
