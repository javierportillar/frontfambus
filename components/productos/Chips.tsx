"use client";

import type { ProductEstado, ProductAccion, ProductAbc } from "@/lib/api/hooks";
import { estadoCfg, accionCfg, abcCfg } from "@/lib/productos/display";

function Pill({ label, color, bg, title }: { label: string; color: string; bg: string; title?: string }): JSX.Element {
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold whitespace-nowrap"
      style={{ color, background: bg }}
    >
      {label}
    </span>
  );
}

export function EstadoChip({ estado }: { estado: ProductEstado }): JSX.Element {
  const c = estadoCfg(estado);
  return <Pill label={c.label} color={c.color} bg={c.bg} title={c.desc} />;
}

export function AccionChip({ accion }: { accion: ProductAccion }): JSX.Element {
  const c = accionCfg(accion);
  if (accion === "n/a") return <span className="text-text-muted text-xs">—</span>;
  return <Pill label={c.label} color={c.color} bg={c.bg} />;
}

export function AbcChip({ abc }: { abc: ProductAbc }): JSX.Element {
  const c = abcCfg(abc);
  return (
    <span
      title={c.desc}
      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-[0.7rem] font-bold"
      style={{ color: c.color, background: c.bg }}
    >
      {c.label}
    </span>
  );
}
