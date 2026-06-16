"use client";

import { useState } from "react";
import Link from "next/link";
import { usePurchasesDayDetail } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ComprasPage(): JSX.Element {
  const [date, setDate] = useState(todayISO);
  const { data, isLoading, error } = usePurchasesDayDetail(date);

  function handlePrev(): void {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() - 1);
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }

  function handleNext(): void {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + 1);
    if (d > new Date()) return;
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }

  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const d = new Date(`${date}T00:00:00`);
  const dateLabel = `${dayNames[d.getDay()]}, ${d.getDate()} de ${monthNames[d.getMonth()]} de ${d.getFullYear()}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Compras</h1>
      </div>

      {/* Navegación de fecha */}
      <div className="flex items-center gap-3">
        <button onClick={handlePrev} className="rounded-lg bg-surface-alt px-3 py-2 text-sm font-semibold hover:bg-surface-dark/10">
          ◀
        </button>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
          />
          <span className="text-sm text-text-muted hidden sm:inline">{dateLabel}</span>
        </div>
        <button
          onClick={handleNext}
          disabled={date === todayISO()}
          className="rounded-lg bg-surface-alt px-3 py-2 text-sm font-semibold hover:bg-surface-dark/10 disabled:opacity-30"
        >
          ▶
        </button>
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
        <div className="space-y-3">
          <div className="flex gap-3 text-sm">
            <span className="rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-700">
              {data.total_documentos} documento{data.total_documentos !== 1 ? "s" : ""}
            </span>
            <span className="rounded-full bg-surface-alt px-3 py-1 font-semibold text-text-primary">
              {formatMoneyFull(data.total_compras)}
            </span>
          </div>

          {data.items.map((item, i) => (
            <div key={`${item.num_documento}-${item.cod_producto}-${i}`}
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
              <span className="whitespace-nowrap font-semibold text-text-primary">
                {formatMoneyFull(item.total)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center text-sm text-text-muted">
          No hay compras para esta fecha.
        </Card>
      )}
    </div>
  );
}
