"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { usePurchasesDayGrouped, type CompraDocumento } from "@/lib/api/hooks";
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
  const { data, isLoading } = usePurchasesDayGrouped(date);

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
        <p className="py-12 text-center text-sm text-text-muted">Sin compras este día.</p>
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
        {data.documentos.map((doc, idx) => (
          <DocumentoCard key={`${doc.num_documento}-${idx}`} doc={doc} />
        ))}
      </div>
    </div>
  );
}

function DocumentoCard({ doc }: { doc: CompraDocumento }): JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-alt"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base">{open ? "▾" : "▸"}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text-primary truncate">
                {doc.nombre_proveedor}
              </div>
              <div className="text-[0.65rem] text-text-muted">
                Factura {doc.num_documento}{doc.cod_clase ? ` · ${doc.cod_clase}` : ""}
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
      </button>
      {open && doc.items.length > 0 && (
        <div className="border-t border-border overflow-x-auto">
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
                  className="border-t border-border/40 hover:bg-surface-alt cursor-pointer"
                  onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(it.cod_producto)}`)}
                >
                  <td className="py-1.5 px-3">
                    <div className="text-text-primary text-xs truncate max-w-md">{it.nom_producto}</div>
                    <div className="text-[0.6rem] text-text-muted">{it.cod_producto}</div>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-xs">
                    {it.cantidad}{" "}
                    <span className="text-text-muted">{it.unidad_medida ?? "u"}</span>
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
