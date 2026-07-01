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
// El drilldown de las Decision Cards en Resumen navega al Catálogo con filtro por estado.

type InvTab = "resumen" | "catalogo";

const TABS: { key: InvTab; label: string; emoji: string }[] = [
  { key: "resumen", label: "Resumen", emoji: "📊" },
  { key: "catalogo", label: "Catálogo", emoji: "📋" },
];

function InventarioInner(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = (searchParams.get("tab") as InvTab) || "resumen";
  const estadoParam = searchParams.get("estado") ?? "";

  const [tab, setTab] = useState<InvTab>(
    TABS.some((t) => t.key === tabParam) ? tabParam : "resumen",
  );
  const [catalogoEstado, setCatalogoEstado] = useState<string>(estadoParam);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== tab) {
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url);
    }
  }, [tab]);

  // Si cambia el ?estado en URL (por navegación desde otra vista), sincronizar
  useEffect(() => {
    if (estadoParam !== catalogoEstado) {
      setCatalogoEstado(estadoParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estadoParam]);

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

      <div className="-mx-4 overflow-x-auto border-b border-border pb-2 md:mx-0">
        <div className="flex gap-2 whitespace-nowrap px-4 md:flex-wrap md:px-0">
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
      </div>

      {tab === "resumen" && (
        <ResumenUnificado
          onGoToTab={(target, estado) => {
            // V1.24:
            //   comprar/optimizar → /decisiones (contexto de acción)
            //   catalogo (con estado opcional) → tab local Catálogo filtrado
            if (target === "comprar") {
              router.push("/dashboards/decisiones?tab=comprar");
            } else if (target === "optimizar") {
              router.push("/dashboards/decisiones?tab=vender");
            } else {
              // target === "catalogo"
              setCatalogoEstado(estado ?? "");
              setTab("catalogo");
              const url = new URL(window.location.href);
              url.searchParams.set("tab", "catalogo");
              if (estado) url.searchParams.set("estado", estado);
              else url.searchParams.delete("estado");
              window.history.replaceState({}, "", url);
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
