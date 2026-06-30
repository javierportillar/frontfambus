"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// V1.17: 'Dormidos' fusionado con 'Liquidar' en /dashboards/inventario,
// que ahora separa correctamente dormidos reales de zombies (nunca vendidos).
export default function DormidosRedirect(): JSX.Element {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboards/inventario?tab=optimizar");
  }, [router]);
  return (
    <div className="p-6 text-sm text-text-muted">
      Esta sección se movió a{" "}
      <a href="/dashboards/inventario?tab=optimizar" className="text-accent hover:underline">
        Inventario · Optimizar
      </a>.
    </div>
  );
}
