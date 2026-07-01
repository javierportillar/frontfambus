"use client";

import Link from "next/link";
import { useSaludCatalogo } from "@/lib/api/hooks";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

interface Bucket {
  key: string;
  label: string;
  count: number;
  pct: number;
  color: string;
  description: string;
}

/**
 * KPI agregado del catálogo: cuántos SKUs están vivos, lentos, dormidos o zombie.
 *
 * Score salud = (activos + lentos) / total. Cuanto más alto, más del catálogo
 * está generando movimiento. Bajo = oportunidad enorme de limpiar inventario.
 *
 * Usable en /dashboards (home) y /dashboards/productos.
 */
export function SaludCatalogo(): JSX.Element {
  const { data, isLoading } = useSaludCatalogo();

  if (isLoading && !data) return <Card><Skeleton className="h-48 rounded-lg" /></Card>;
  if (!data) return <Card><Skeleton className="h-32 rounded-lg" /></Card>;

  const buckets: Bucket[] = [
    {
      key: "activos",
      label: "Activos",
      count: data.activos,
      pct: data.activos_pct,
      color: "#16A34A",
      description: "vendieron últimos 30 días",
    },
    {
      key: "lentos",
      label: "Lentos",
      count: data.lentos,
      pct: data.lentos_pct,
      color: "#FCD34D",
      description: "30–90 días sin venta",
    },
    {
      key: "dormidos",
      label: "Dormidos",
      count: data.dormidos,
      pct: data.dormidos_pct,
      color: "#DC2626",
      description: "+90 días sin venta",
    },
    {
      key: "zombie",
      label: "Zombie",
      count: data.zombie,
      pct: data.zombie_pct,
      color: "#6B7280",
      description: "nunca vendidos",
    },
  ];

  // Mensaje según score
  let mensaje: string;
  let scoreColor: string;
  if (data.salud_pct >= 60) {
    mensaje = "Catálogo sano — la mayoría de SKUs generan movimiento.";
    scoreColor = "#16A34A";
  } else if (data.salud_pct >= 30) {
    mensaje = "Margen de mejora — más de la mitad del catálogo está dormido o nunca vendió.";
    scoreColor = "#C2410C";
  } else {
    mensaje = "Catálogo poco eficiente — gran parte del inventario no se mueve. Considerá liquidación.";
    scoreColor = "#DC2626";
  }

  return (
    <Card header={
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-text-primary">Salud del catálogo</h2>
        <Link href="/dashboards/productos" className="text-xs text-accent hover:underline">
          Ver productos →
        </Link>
      </div>
    }>
      <div className="space-y-4">
        {/* Score grande */}
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold" style={{ color: scoreColor }}>
            {data.salud_pct}%
          </span>
          <span className="text-sm text-text-muted">salud · {data.total_skus.toLocaleString("es-CO")} SKUs en catálogo</span>
        </div>

        <p className="text-sm text-text-secondary">{mensaje}</p>

        {/* Barra apilada */}
        <div className="space-y-1">
          <div className="flex h-3 overflow-hidden rounded-full">
            {buckets.filter(b => b.pct > 0).map((b) => (
              <div
                key={b.key}
                style={{ width: `${b.pct}%`, background: b.color }}
                title={`${b.label}: ${b.count.toLocaleString("es-CO")} (${b.pct}%)`}
              />
            ))}
          </div>
        </div>

        {/* Leyenda + tabla */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {buckets.map((b) => (
            <div key={b.key} className="rounded-md border border-border bg-surface-alt/40 p-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: b.color }} />
                <span className="font-semibold text-text-primary">{b.label}</span>
              </div>
              <div className="mt-1 text-lg font-bold text-text-primary tabular-nums">
                {b.count.toLocaleString("es-CO")}
              </div>
              <div className="text-text-muted">
                {b.pct}% · {b.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
