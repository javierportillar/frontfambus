"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CompraDetalleContent } from "@/components/compras/CompraDetalleContent";

export default function CompraDetallePage(): JSX.Element {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = decodeURIComponent(String(params.date ?? ""));
  const documentNumber = decodeURIComponent(String(params.documento ?? ""));
  const classCode = searchParams.get("cod_clase") ?? "";

  if (!date || !documentNumber) return <div className="p-4">Compra no especificada.</div>;

  return (
    <div className="space-y-4">
      <div>
        <button type="button" onClick={() => router.back()} className="cursor-pointer text-sm text-accent hover:underline">
          ← Volver
        </button>
        <h1 className="mt-1 text-xl font-bold text-text-primary">Detalle de la compra</h1>
        <p className="text-xs text-text-muted">Factura {documentNumber} · {date}</p>
      </div>
      <CompraDetalleContent date={date} documentNumber={documentNumber} classCode={classCode} />
    </div>
  );
}
