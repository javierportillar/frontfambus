"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePurchasesDayGrouped, type CompraDocumento } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
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

  if (isLoading && !data) return <Skeleton className="h-96 rounded-xl" />;
  if (error) {
    return <Card><p className="py-10 text-center text-sm text-warning">No pudimos cargar el detalle de la compra.</p></Card>;
  }
  if (!document) {
    return <Card><p className="py-10 text-center text-sm text-text-muted">Compra no encontrada para esa fecha.</p></Card>;
  }

  return <PurchaseDocument document={document} />;
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
