"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/Skeleton";
import { ResumenUnificado } from "@/components/inventario/ResumenUnificado";
import { ExpiryLotsTab } from "@/components/inventario/ExpiryLotsTab";
import { ProductsTable } from "@/components/productos/ProductsTable";
import { useAuthStore } from "@/lib/auth/store";

// ── V1.24: Inventario reducido a 2 tabs ──
// Los tabs Comprar y Optimizar migraron a /dashboards/decisiones?tab=comprar|vender.
// Inventario ahora se enfoca en panorama (Resumen) y exploración del catálogo (Catálogo).
// El drilldown de las Decision Cards en Resumen navega al Catálogo con filtro por estado.

type InvTab = "resumen" | "catalogo" | "caducidad";

const TABS: { key: InvTab; label: string; emoji: string }[] = [
  { key: "resumen", label: "Resumen", emoji: "📊" },
  { key: "catalogo", label: "Catálogo", emoji: "📋" },
];

function InventarioInner(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTenant = useAuthStore((s) => s.currentTenant);
  const isMasVital = currentTenant === "masvital";
  const tabs = isMasVital
    ? [...TABS, { key: "caducidad" as const, label: "Caducidad", emoji: "⏳" }]
    : TABS;
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

  // The tenant is hydrated client-side. Keep this URL-only view unavailable
  // for MotoShop even if someone manually changes the query parameter.
  useEffect(() => {
    if (tab === "caducidad" && !isMasVital) setTab("resumen");
    if (tabParam === "caducidad" && isMasVital) setTab("caducidad");
  }, [isMasVital, tab, tabParam]);

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
          {tabs.map((t) => (
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
          onGoToTab={(target, arg) => {
            // V1.31:
            //   comprar/optimizar → /decisiones con ?scope=<preset>&back=inventario
            //     → Decisiones muestra un PLAN SCOPEADO con el MISMO count de la card.
            //   catalogo (con estado) → tab local Catálogo filtrado
            if (target === "comprar") {
              const params = new URLSearchParams({ tab: "comprar", back: "inventario" });
              if (arg) params.set("scope", arg);
              router.push(`/dashboards/decisiones?${params.toString()}`);
            } else if (target === "optimizar") {
              const params = new URLSearchParams({ tab: "vender", back: "inventario" });
              if (arg) params.set("scope", arg);
              router.push(`/dashboards/decisiones?${params.toString()}`);
            } else {
              // target === "catalogo"
              setCatalogoEstado(arg ?? "");
              setTab("catalogo");
              const url = new URL(window.location.href);
              url.searchParams.set("tab", "catalogo");
              if (arg) url.searchParams.set("estado", arg);
              else url.searchParams.delete("estado");
              window.history.replaceState({}, "", url);
            }
          }}
        />
      )}
      {tab === "catalogo" && (
        <ProductsTable key={catalogoEstado} window={180} initialEstado={catalogoEstado} />
      )}
      {tab === "caducidad" && isMasVital && <ExpiryLotsTab />}
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
