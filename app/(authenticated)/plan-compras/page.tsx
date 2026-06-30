"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// V1.17: 'Plan de Compras' fusionado con el tab 'Comprar' de
// /dashboards/inventario, que ahora incluye sugerencia de cantidad
// por SKU + costo total estimado + filtros por urgencia.
export default function PlanComprasRedirect(): JSX.Element {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboards/inventario?tab=comprar");
  }, [router]);
  return (
    <div className="p-6 text-sm text-text-muted">
      Esta sección se movió a{" "}
      <a href="/dashboards/inventario?tab=comprar" className="text-accent hover:underline">
        Inventario · Comprar
      </a>.
    </div>
  );
}
