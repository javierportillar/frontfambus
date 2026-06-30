"use client";

import { useParams, useRouter } from "next/navigation";
import { usePurchasesDayDetail } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

export default function ComprasDiaPage(): JSX.Element {
  const params = useParams();
  const router = useRouter();
  const date = String(params.date ?? "");

  const { data, isLoading, error } = usePurchasesDayDetail(date);

  if (!date) return <div className="p-4">Fecha no especificada.</div>;

  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const d = new Date(`${date}T00:00:00`);

  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm text-accent hover:underline cursor-pointer"
        >
          ← Volver
        </button>
        <h1 className="mt-1 text-xl font-bold text-text-primary">
          Compras del {dayNames[d.getDay()]}, {d.getDate()} de {monthNames[d.getMonth()]} de {d.getFullYear()}
        </h1>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message="Error al cargar compras del día." />
      ) : data && data.items.length > 0 ? (
        <div className="space-y-2">
          <div className="flex gap-3 text-sm">
            <span className="rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-700">
              {data.total_documentos} documento{data.total_documentos !== 1 ? "s" : ""}
            </span>
            <span className="rounded-full bg-surface-alt px-3 py-1 font-semibold text-text-primary">
              {formatMoneyFull(data.total_compras)}
            </span>
          </div>

          <div className="space-y-1.5">
            {data.items.map((item, i) => (
              <div
                key={`${item.num_documento}-${item.cod_producto}-${i}`}
                className="flex items-center gap-3 rounded-xl bg-surface-alt/60 px-4 py-3 text-sm"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                <span className="font-mono text-xs text-text-muted">{item.num_documento}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-text-primary">
                  {item.nom_producto}
                </span>
                <span className="whitespace-nowrap font-semibold text-text-primary">
                  {item.cantidad.toLocaleString("es-CO")} uds
                </span>
                <span className="whitespace-nowrap text-text-muted">
                  × {formatMoneyFull(item.valor_unitario)}
                </span>
                {item.costo_producto != null && item.costo_producto > 0 && (
                  <span className="whitespace-nowrap text-xs text-text-muted">
                    costo: {formatMoneyFull(item.costo_producto)}
                  </span>
                )}
                <span className="whitespace-nowrap font-semibold text-text-primary">
                  {formatMoneyFull(item.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Card className="p-6 text-center text-sm text-text-muted">
          No hay compras para esta fecha.
        </Card>
      )}
    </div>
  );
}
