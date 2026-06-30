"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// V1.17: ABC consolidado dentro de /dashboards/inventario (chip por producto
// en lugar de pantalla aparte). Redirige al tab Resumen del inventario.
export default function AbcRedirect(): JSX.Element {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboards/inventario?tab=resumen");
  }, [router]);
  return (
    <div className="p-6 text-sm text-text-muted">
      Esta sección se movió a{" "}
      <a href="/dashboards/inventario?tab=resumen" className="text-accent hover:underline">
        Inventario
      </a>.
    </div>
  );
}
