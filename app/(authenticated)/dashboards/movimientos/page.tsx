"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/Skeleton";
import { VentasView } from "@/components/movimientos/VentasView";
import { ComprasView } from "@/components/movimientos/ComprasView";

// V1.23: Movimientos unificado (absorbe Ventas y Compras)
// Toggle Ventas|Compras en el header; cada modo conserva sus tabs internos.

type Modo = "ventas" | "compras";

function MovimientosInner(): JSX.Element {
  const searchParams = useSearchParams();
  const modoParam = (searchParams.get("modo") as Modo) || "ventas";
  const [modo, setModo] = useState<Modo>(
    modoParam === "compras" ? "compras" : "ventas",
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("modo") !== modo) {
      url.searchParams.set("modo", modo);
      window.history.replaceState({}, "", url);
    }
  }, [modo]);

  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-accent hover:underline">← Volver a inicio</Link>

      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Movimientos</h1>
          <p className="text-sm text-text-muted">
            Tus entradas y salidas — alterná entre lo que vendiste y lo que compraste.
          </p>
        </div>

        {/* Toggle Ventas | Compras — full width en mobile para tap fácil */}
        <div
          role="tablist"
          aria-label="Modo de movimiento"
          className="grid grid-cols-2 rounded-xl border border-border bg-surface-alt p-1 shadow-sm md:inline-flex"
        >
          <button
            type="button"
            role="tab"
            aria-selected={modo === "ventas"}
            onClick={() => setModo("ventas")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              modo === "ventas"
                ? "bg-primary text-primary-fg shadow"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            📈 Ventas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modo === "compras"}
            onClick={() => setModo("compras")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              modo === "compras"
                ? "bg-accent text-text-inverse shadow"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            📦 Compras
          </button>
        </div>
      </div>

      {modo === "ventas" ? <VentasView /> : <ComprasView />}
    </div>
  );
}

export default function MovimientosPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <MovimientosInner />
    </Suspense>
  );
}
