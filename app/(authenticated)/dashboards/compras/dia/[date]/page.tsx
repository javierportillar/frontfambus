"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { DiaDetalleContent } from "@/components/compras/DiaDetalleContent";

export default function ComprasDiaPage(): JSX.Element {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = String(params.date ?? "");

  if (!date) return <div className="p-4">Fecha no especificada.</div>;

  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const d = new Date(`${date}T00:00:00`);

  // Si vino con ?from=mensual, el botón atrás te devuelve a /compras con el
  // mes correspondiente preseleccionado. Si no, router.back() respeta el
  // historial de navegación normal (ej. desde ficha de producto).
  const fromMensual = searchParams.get("from") === "mensual";
  const mesDelDia = date.slice(0, 7);

  const handleBack = (): void => {
    if (fromMensual) {
      router.push(`/dashboards/compras?month=${mesDelDia}`);
    } else {
      router.back();
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <button
          type="button"
          onClick={handleBack}
          className="text-sm text-accent hover:underline cursor-pointer"
        >
          ← Volver
        </button>
        <h1 className="mt-1 text-xl font-bold text-text-primary">
          Compras del {dayNames[d.getDay()]}, {d.getDate()} de {monthNames[d.getMonth()]} de {d.getFullYear()}
        </h1>
        <p className="text-xs text-text-muted">
          Detalle agrupado por documento y proveedor
        </p>
      </div>

      <DiaDetalleContent date={date} />
    </div>
  );
}
