"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/Skeleton";
import { ResumenUnificado } from "@/components/inventario/ResumenUnificado";
import { ProductsTable } from "@/components/productos/ProductsTable";

// ── V1.24: Inventario reducido a 2 tabs ──
// Los tabs Comprar y Optimizar migraron a /dashboards/decisiones?tab=comprar|vender.
// Inventario ahora se enfoca en panorama (Resumen) y exploración del catálogo (Catálogo).

type InvTab = "resumen" | "catalogo";

const TABS: { key: InvTab; label: string; emoji: string }[] = [
  { key: "resumen", label: "Resumen", emoji: "📊" },
  { key: "catalogo", label: "Catálogo", emoji: "📋" },
];

function InventarioInner(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = (searchParams.get("tab") as InvTab) || "resumen";
  const [tab, setTab] = useState<InvTab>(
    TABS.some((t) => t.key === tabParam) ? tabParam : "resumen",
  );
  const [catalogoEstado, setCatalogoEstado] = useState<string>("");

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== tab) {
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url);
    }
  }, [tab]);

  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-accent hover:underline">← Volver a inicio</Link>
      <div>
        <h1 className="text-xl font-bold text-text-primary">Inventario</h1>
        <p className="text-sm text-text-muted">
          Panorama del catálogo. Las decisiones de compra y liquidación viven en{" "}
          <Link href="/dashboards/decisiones" className="text-accent hover:underline">Decisiones</Link>.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-surface-dark text-text-inverse"
                : "bg-surface-alt text-text-secondary hover:bg-surface-alt/70"
            }`}
          >
            <span className="mr-1">{t.emoji}</span> {t.label}
          </button>
        ))}
      </div>

      {tab === "resumen" && (
        <ResumenUnificado
          onGoToTab={(target) => {
            // V1.24: drilldown desde la matriz / decision cards
            //   comprar/optimizar → /dashboards/decisiones?tab=comprar|vender
            //   catalogo → tab interno
            if (target === "comprar") {
              router.push("/dashboards/decisiones?tab=comprar");
            } else if (target === "optimizar") {
              router.push("/dashboards/decisiones?tab=vender");
            } else {
              setCatalogoEstado("");
              setTab("catalogo");
            }
          }}
        />
      )}
      {tab === "catalogo" && (
        <ProductsTable key={catalogoEstado} window={180} initialEstado={catalogoEstado} />
      )}
    </div>
  );
}

export default function InventarioPage(): JSX.Element {
  return (
    <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
      <InventarioInner />
    </Suspense>
  );
}
