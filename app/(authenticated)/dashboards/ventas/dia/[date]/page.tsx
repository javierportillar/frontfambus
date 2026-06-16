"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DayDetailContent } from "@/components/sales/DayDetailContent";

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export default function DiaDetailPage(): JSX.Element {
  const params = useParams();
  const date = String(params.date ?? "");

  if (!date) return <div className="p-4">Fecha no especificada.</div>;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/dashboards/ventas?month=${monthOf(date)}&tab=diaria`}
          className="text-sm text-accent hover:underline"
        >
          ← Volver a ventas
        </Link>
        <h1 className="mt-1 text-xl font-bold text-text-primary">
          Ventas del {(() => {
            const d = new Date(`${date}T00:00:00`);
            const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
            const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
            return `${dayNames[d.getDay()]}, ${d.getDate()} de ${monthNames[d.getMonth()]} de ${d.getFullYear()}`;
          })()}
        </h1>
      </div>

      <DayDetailContent date={date} />
    </div>
  );
}
