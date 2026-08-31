"use client";

import { useState } from "react";
import { ProductsTable } from "@/components/productos/ProductsTable";

type RotacionFiltro = "mas_rotados" | "menos_rotados" | "sin_rotacion";

const FILTROS: { key: RotacionFiltro; label: string; desc: string }[] = [
  { key: "mas_rotados", label: "🔥 Más rotados", desc: "Alta demanda (≥ 4x año)" },
  { key: "menos_rotados", label: "🐢 Menos rotados", desc: "Baja demanda (< 4x año)" },
  { key: "sin_rotacion", label: "🧊 Sin rotación", desc: "Sin movimiento reciente" },
];

export function RotacionTab({ window = 180 }: { window?: number }): JSX.Element {
  const [rotacion, setRotacion] = useState<RotacionFiltro>("mas_rotados");

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {FILTROS.map((f) => {
          const isActive = rotacion === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setRotacion(f.key)}
              className={`flex flex-col items-start gap-1 p-4 text-left rounded-xl border transition-all ${
                isActive
                  ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                  : "border-border bg-surface hover:bg-surface-alt"
              }`}
            >
              <div className="font-semibold text-text-primary text-sm">
                {f.label}
              </div>
              <div className="text-xs text-text-muted">{f.desc}</div>
            </button>
          );
        })}
      </div>

      <ProductsTable window={window} rotacion={rotacion} />
    </div>
  );
}
