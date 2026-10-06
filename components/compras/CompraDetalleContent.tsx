"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  usePurchaseAssessment,
  usePurchasesDayGrouped,
  type CompraDocumento,
  type PurchaseAssessment,
} from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { MarkdownContent } from "@/components/chat/MarkdownContent";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

interface Props {
  date: string;
  documentNumber: string;
  classCode: string;
}

export function CompraDetalleContent({ date, documentNumber, classCode }: Props): JSX.Element {
  const { data, error, isLoading } = usePurchasesDayGrouped(date);
  const document = useMemo(
    () => data?.documentos.find(
      (item) => item.num_documento === documentNumber
        && (!classCode || item.cod_clase === classCode),
    ),
    [classCode, data?.documentos, documentNumber],
  );
  const evaluation = usePurchaseAssessment(
    date,
    classCode || document?.cod_clase || null,
    documentNumber,
  );

  if (isLoading && !data) return <Skeleton className="h-96 rounded-xl" />;
  if (error) {
    return <Card><p className="py-10 text-center text-sm text-warning">No pudimos cargar el detalle de la compra.</p></Card>;
  }
  if (!document) {
    return <Card><p className="py-10 text-center text-sm text-text-muted">Compra no encontrada para esa fecha.</p></Card>;
  }

  return (
    <div className="space-y-4">
      <PurchaseDocument document={document} />
      <PurchaseAssessmentPanel
        assessment={evaluation.data}
        error={evaluation.error}
        isLoading={evaluation.isLoading}
        onRetry={() => void evaluation.mutate()}
      />
    </div>
  );
}

function PurchaseAssessmentPanel({
  assessment,
  error,
  isLoading,
  onRetry,
}: {
  assessment: PurchaseAssessment | undefined;
  error: Error | undefined;
  isLoading: boolean;
  onRetry: () => void;
}): JSX.Element {
  const missing = error?.message.includes("API error 404") ?? false;
  const cutoffs = assessment?.source_cutoffs;
  const rating = assessment?.deterministic_metrics.assessment_summary?.senal_global;

  return (
    <Card
      header={(
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-text-primary">Evaluación automática de la compra</h2>
          {rating && (
            <span className="rounded-full border border-border bg-surface-alt px-2 py-1 text-[0.65rem] font-semibold text-text-secondary">
              {rating.replaceAll("_", " ")}
            </span>
          )}
        </div>
      )}
    >
      {isLoading && !assessment ? (
        <div role="status" className="space-y-2">
          <Skeleton className="h-4 w-1/2 rounded" />
          <Skeleton className="h-24 rounded-lg" />
        </div>
      ) : missing || (!assessment && !error) ? (
        <p role="status" className="text-sm text-text-muted">
          Esta factura aún no tiene una evaluación guardada. Se procesará automáticamente después de una actualización exitosa del pipeline.
        </p>
      ) : error && !assessment ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-warning">No se pudo consultar la evaluación automática.</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-xs font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Reintentar
          </button>
        </div>
      ) : assessment?.markdown ? (
        <div>
          {assessment.status === "fallback" && (
            <p role="status" className="mb-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              Respaldo determinístico: el proveedor LLM no estuvo disponible al generar esta evaluación.
            </p>
          )}
          {assessment.status === "processing" && (
            <p role="status" className="mb-3 rounded-md border border-border bg-surface-alt px-3 py-2 text-xs text-text-secondary">
              Se está actualizando la evaluación con el último snapshot del pipeline.
            </p>
          )}
          {cutoffs && (
            <p className="mb-3 text-[0.65rem] text-text-muted">
              Cortes — compras {cutoffs.purchases ?? "sin datos"} · ventas {cutoffs.sales ?? "sin datos"} ·
              {" "}inventario {cutoffs.inventory ?? "sin datos"} · ABC {cutoffs.abc ?? "sin clasificación"}.
              {assessment.completed_at && ` Evaluada ${assessment.completed_at.slice(0, 16).replace("T", " ")} UTC.`}
            </p>
          )}
          <div className="text-sm text-text-secondary">
            <MarkdownContent content={assessment.markdown} />
          </div>
        </div>
      ) : assessment?.status === "pending" || assessment?.status === "processing" ? (
        <p role="status" className="text-sm text-text-muted">
          La evaluación está en cola y aparecerá aquí cuando termine el análisis de esta factura y sus productos.
        </p>
      ) : (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-warning">La evaluación no pudo completarse todavía.</p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg border border-border bg-surface-alt px-3 py-2 text-xs font-semibold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Reintentar
          </button>
        </div>
      )}
    </Card>
  );
}

function PurchaseDocument({ document }: { document: CompraDocumento }): JSX.Element {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Total comprado" value={formatMoneyFull(document.total_factura)} />
        <Summary label="Productos" value={document.num_items.toLocaleString("es-CO")} />
        <Summary label="Proveedor" value={document.nombre_proveedor ?? "Sin proveedor"} />
      </div>

      <Card className="overflow-hidden p-0">
        <ul aria-label="Productos de la factura" className="space-y-2 md:hidden">
          {document.items.map((item, index) => (
            <li key={`${item.cod_producto}-${index}`} className="min-w-0 rounded-lg border border-border p-3">
              <Link
                href={`/dashboards/productos/${encodeURIComponent(item.cod_producto)}`}
                className="block min-w-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <span className="block break-words text-sm font-semibold leading-snug text-text-primary">{item.nom_producto}</span>
                <span className="mt-0.5 block break-all font-mono text-xs text-text-muted">{item.cod_producto}</span>
              </Link>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/70 pt-2 text-xs">
                <div>
                  <dt className="text-text-muted">Cantidad</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">
                    {item.cantidad.toLocaleString("es-CO")} {item.unidad_medida ?? "u"}
                  </dd>
                </div>
                <div>
                  <dt className="text-text-muted">Valor unitario</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-text-primary">{formatMoneyFull(item.valor_unitario)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Costo unitario</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-text-primary">{formatMoneyFull(item.costo_producto ?? 0)}</dd>
                </div>
                <div>
                  <dt className="text-text-muted">Total</dt>
                  <dd className="mt-0.5 break-words font-bold tabular-nums text-text-primary">{formatMoneyFull(item.total)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt/40 text-left text-[0.65rem] uppercase tracking-wide text-text-muted">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">V. unit.</th>
                <th className="px-4 py-3 text-right">Costo</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {document.items.map((item, index) => (
                <tr key={`${item.cod_producto}-${index}`} className="border-b border-border/40 last:border-0">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/dashboards/productos/${encodeURIComponent(item.cod_producto)}`}
                      className="block max-w-xl hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <span className="block truncate text-text-primary">{item.nom_producto}</span>
                      <span className="block text-xs text-text-muted">{item.cod_producto}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {item.cantidad.toLocaleString("es-CO")} {item.unidad_medida ?? "u"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">{formatMoneyFull(item.valor_unitario)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-muted">{formatMoneyFull(item.costo_producto ?? 0)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatMoneyFull(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Card>
      <p className="text-xs text-text-muted">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-text-primary">{value}</p>
    </Card>
  );
}
