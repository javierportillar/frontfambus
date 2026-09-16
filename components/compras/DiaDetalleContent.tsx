"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { usePurchasesDayGrouped, type CompraDocumento } from "@/lib/api/hooks";
import { useAuthStore } from "@/lib/auth/store";
import {
  canRestorePurchaseDayScroll,
  clearPurchaseDayScroll,
  getPurchaseDayStateKey,
  getPurchaseDaySessionStorage,
  getPurchaseDocumentId,
  readPurchaseDayState,
  saveExpandedPurchaseDocuments,
  savePurchaseDayNavigation,
} from "@/lib/compras/dayDetailState";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

interface Props {
  date: string;
}

/**
 * Contenido del detalle de compras de un día específico.
 *
 * Agrupado por DOCUMENTO + PROVEEDOR. Cada factura es una card
 * colapsable que muestra: nombre del proveedor + NIT, total, # productos.
 * Al expandir, la tabla de productos de esa factura específica.
 *
 * Reemplaza la vista plana legacy. Se usa tanto en la página dedicada
 * /dashboards/compras/dia/[date] como podría reusarse en cualquier
 * vista que necesite mostrar el detalle de un día.
 */
export function DiaDetalleContent({ date }: Props): JSX.Element {
  const currentTenant = useAuthStore((state) => state.currentTenant);
  const { data, error, isLoading, isValidating } = usePurchasesDayGrouped(date);
  const storageKey = useMemo(
    () => (currentTenant ? getPurchaseDayStateKey(currentTenant, date) : null),
    [currentTenant, date],
  );
  const [savedView, setSavedView] = useState<{
    storageKey: string | null;
    expandedDocumentIds: Set<string>;
  }>({ storageKey: null, expandedDocumentIds: new Set() });

  const expandedDocumentIds =
    savedView.storageKey === storageKey
      ? savedView.expandedDocumentIds
      : new Set<string>();
  useEffect(() => {
    const storage = getPurchaseDaySessionStorage();
    if (!storageKey || !storage) {
      setSavedView({ storageKey, expandedDocumentIds: new Set() });
      return;
    }

    const saved = readPurchaseDayState(storage, storageKey);
    setSavedView({
      storageKey,
      expandedDocumentIds: new Set(saved.expandedDocumentIds),
    });
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;

    const storage = getPurchaseDaySessionStorage();
    if (!storage) return;
    const saved = readPurchaseDayState(storage, storageKey);
    if (
      !canRestorePurchaseDayScroll({
        dataDate: data?.date,
        requestedDate: date,
        isValidating,
        hasError: error !== undefined,
        storageKey,
        loadedStorageKey: savedView.storageKey,
        scrollY: saved.scrollY,
      })
    ) {
      return;
    }

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        window.scrollTo({ top: saved.scrollY, left: 0, behavior: "auto" });
        clearPurchaseDayScroll(storage, storageKey);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [data?.date, date, error, isValidating, savedView.storageKey, storageKey]);

  const handleDocumentToggle = (documentId: string): void => {
    const next = new Set(expandedDocumentIds);
    if (next.has(documentId)) next.delete(documentId);
    else next.add(documentId);

    setSavedView({ storageKey, expandedDocumentIds: next });
    const storage = getPurchaseDaySessionStorage();
    if (storageKey && storage) {
      saveExpandedPurchaseDocuments(storage, storageKey, next);
    }
  };

  const handleBeforeProductNavigation = (): void => {
    const storage = getPurchaseDaySessionStorage();
    if (storageKey && storage && typeof window !== "undefined") {
      savePurchaseDayNavigation(
        storage,
        storageKey,
        expandedDocumentIds,
        window.scrollY,
      );
    }
  };

  if (isLoading && !data) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data || data.documentos.length === 0) {
    return (
      <Card>
        <p className="py-12 text-center text-sm text-text-muted">
          Sin compras este día.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="rounded-md border border-border bg-surface-alt/40 px-3 py-1.5">
          <span className="text-text-muted">Total comprado:</span>{" "}
          <strong>{formatMoneyFull(data.total_compras)}</strong>
        </div>
        <div className="rounded-md border border-border bg-surface-alt/40 px-3 py-1.5">
          <span className="text-text-muted">Documentos:</span>{" "}
          <strong>{data.total_documentos}</strong>
        </div>
      </div>

      <div className="space-y-3">
        {data.documentos.map((doc) => {
          const documentId = getPurchaseDocumentId(doc);
          return (
            <DocumentoCard
              key={documentId}
              doc={doc}
              open={expandedDocumentIds.has(documentId)}
              onToggle={() => handleDocumentToggle(documentId)}
              onBeforeProductNavigation={handleBeforeProductNavigation}
            />
          );
        })}
      </div>
    </div>
  );
}

interface DocumentoCardProps {
  doc: CompraDocumento;
  open: boolean;
  onToggle: () => void;
  onBeforeProductNavigation: () => void;
}

export function DocumentoCard({
  doc,
  open,
  onToggle,
  onBeforeProductNavigation,
}: DocumentoCardProps): JSX.Element {
  const reactId = useId();
  const panelId = `purchase-document-${reactId.replace(/:/g, "")}`;
  const header = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {doc.items.length > 0 && (
            <span className="text-base">{open ? "▾" : "▸"}</span>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-text-primary truncate">
              {doc.nombre_proveedor}
            </div>
            <div className="text-[0.65rem] text-text-muted">
              Factura {doc.num_documento}
              {doc.cod_clase ? ` · ${doc.cod_clase}` : ""}
              {doc.nit_proveedor && ` · NIT ${doc.nit_proveedor}`}
            </div>
          </div>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-bold text-text-primary tabular-nums">
          {formatMoneyFull(doc.total_factura)}
        </div>
        <div className="text-[0.65rem] text-text-muted">
          {doc.num_items} producto{doc.num_items === 1 ? "" : "s"}
        </div>
      </div>
    </>
  );

  return (
    <div className="rounded-lg border border-border bg-surface">
      {doc.items.length > 0 ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-alt"
        >
          {header}
        </button>
      ) : (
        <div className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left">
          {header}
        </div>
      )}
      {doc.items.length > 0 && (
        <div
          id={panelId}
          hidden={!open}
          className="border-t border-border overflow-x-auto"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-alt/40 text-left text-[0.65rem] uppercase tracking-wide text-text-muted">
                <th className="py-1.5 px-3">Producto</th>
                <th className="py-1.5 px-3 text-right">Cant.</th>
                <th className="py-1.5 px-3 text-right">V. unit.</th>
                <th className="py-1.5 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((it, i) => (
                <tr
                  key={`${it.cod_producto}-${i}`}
                  className="border-t border-border/40"
                >
                  <td className="py-1.5 px-3">
                    <Link
                      href={`/dashboards/productos/${encodeURIComponent(it.cod_producto)}`}
                      className="block max-w-md text-left hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      onClick={onBeforeProductNavigation}
                    >
                      <span className="block truncate text-xs text-text-primary">
                        {it.nom_producto}
                      </span>
                      <span className="block text-[0.6rem] text-text-muted">
                        {it.cod_producto}
                      </span>
                    </Link>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-xs">
                    {it.cantidad}{" "}
                    <span className="text-text-muted">
                      {it.unidad_medida ?? "u"}
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-xs text-text-muted">
                    {formatMoneyFull(it.valor_unitario)}
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-xs font-semibold">
                    {formatMoneyFull(it.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
