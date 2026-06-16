"use client";

import { useState } from "react";
import type { ReactNode } from "react";

interface CollapsibleProps {
  /** Lo que se ve siempre (header del collapsable). */
  header: ReactNode;
  /** Lo que se despliega al hacer click. */
  children: ReactNode;
  /** Si arranca abierto. Default false. */
  defaultOpen?: boolean;
  /** Clases extras para el container. */
  className?: string;
  /** Para el caret derecho — texto opcional al lado (ej: "30 items"). */
  badge?: ReactNode;
}

/**
 * Acordeón simple sin animaciones complejas: click en header → toggle.
 * Diseñado para listas largas (productos, facturas) que se muestran
 * retraídas y el usuario expande on-demand.
 */
export function Collapsible({ header, children, defaultOpen = false, className = "", badge }: CollapsibleProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-xl border border-border bg-white ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-alt"
      >
        <div className="flex-1 min-w-0">{header}</div>
        <div className="flex items-center gap-2 shrink-0">
          {badge && <span className="text-xs text-text-muted">{badge}</span>}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`text-text-muted transition-transform ${open ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3">{children}</div>
      )}
    </div>
  );
}
