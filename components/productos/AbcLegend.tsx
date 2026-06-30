"use client";

import { useState } from "react";

/**
 * Leyenda compacta que explica qué significan los chips A / B / C que
 * aparecen en las tablas de productos.
 *
 * La clasificación ABC ordena productos por % de revenue acumulado:
 *  - A: pocos productos que generan ~80% de las ventas (los más importantes)
 *  - B: siguiente ~15% — medianos
 *  - C: cola — ~5% restante, muchos productos
 *  - —: sin ventas en la ventana
 *
 * Es la regla 80/20 (Pareto) aplicada al catálogo: hay un puñado de SKUs
 * que mueven el negocio y muchos que aportan poco. Saber esto ayuda a
 * priorizar reposición (no quebrar nunca con A) y limpieza (revisar C).
 */
export function AbcLegend(): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[0.7rem] text-text-muted">
      <span className="font-semibold">ABC:</span>
      <Chip letter="A" color="#15803D" bg="#DCFCE7" label="Top — 80% ventas" />
      <Chip letter="B" color="#C2410C" bg="#FFEDD5" label="Medio — 15%" />
      <Chip letter="C" color="#6B7280" bg="#F3F4F6" label="Cola — 5%" />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-accent hover:underline text-[0.7rem]"
      >
        {open ? "ocultar" : "qué es esto"}
      </button>
      {open && (
        <div className="basis-full mt-1 rounded-md border border-border bg-surface-alt/40 px-3 py-2 text-xs text-text-secondary">
          <p>
            La clasificación <strong>ABC</strong> ordena tus productos por % de revenue acumulado en
            los últimos 180 días — es la <strong>regla 80/20</strong> aplicada a tu catálogo:
          </p>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            <li><strong>A</strong>: pocos productos que generan el <strong>~80% de tus ventas</strong>.
              <span className="text-text-muted"> Nunca debés quebrar stock de un A.</span></li>
            <li><strong>B</strong>: siguiente ~15%. Importantes pero no críticos.</li>
            <li><strong>C</strong>: cola del ~5%. Muchos productos que aportan poco.
              <span className="text-text-muted"> Si están en sobrestock o zombie, son candidatos a liquidar.</span></li>
            <li><strong>—</strong>: sin ventas en la ventana (no clasificable).</li>
          </ul>
        </div>
      )}
    </div>
  );
}

function Chip({ letter, color, bg, label }: { letter: string; color: string; bg: string; label: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded-md text-[0.65rem] font-bold"
        style={{ color, background: bg }}
      >
        {letter}
      </span>
      <span>{label}</span>
    </span>
  );
}
