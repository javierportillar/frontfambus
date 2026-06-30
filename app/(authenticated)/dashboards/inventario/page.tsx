"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/Skeleton";
import { ResumenUnificado } from "@/components/inventario/ResumenUnificado";
import { ComprarTab } from "@/components/inventario/ComprarTab";
import { OptimizarTab } from "@/components/inventario/OptimizarTab";
import { ProductsTable } from "@/components/productos/ProductsTable";
import type { MatrizFilter } from "@/components/inventario/ResumenTab";

// ── V1.23: Inventario unificado (absorbe Productos) ──
// Tabs: Resumen (gerencial + operativo) / Comprar / Optimizar / Catálogo (lista filtrable)

type InvTab = "resumen" | "comprar" | "optimizar" | "catalogo";

const TABS: { key: InvTab; label: string; emoji: string }[] = [
  { key: "resumen", label: "Resumen", emoji: "📊" },
  { key: "comprar", label: "Comprar", emoji: "🛒" },
  { key: "optimizar", label: "Optimizar", emoji: "🧹" },
  { key: "catalogo", label: "Catálogo", emoji: "📋" },
];

function InventarioInner(): JSX.Element {
  const searchParams = useSearchParams();
  const tabParam = (searchParams.get("tab") as InvTab) || "resumen";
  const [tab, setTab] = useState<InvTab>(
    TABS.some((t) => t.key === tabParam) ? tabParam : "resumen",
  );
  // Filtro proveniente de la Matriz Stock×Rotación
  const [matrizFilter, setMatrizFilter] = useState<MatrizFilter | null>(null);
  // Filtro de estado proveniente de Decision Cards / Salud (para tab Catálogo)
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
          Productos, decisiones de compra, liquidación y gestión del catálogo.
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
          onGoToTab={(t, filter) => {
            setMatrizFilter(filter ?? null);
            setCatalogoEstado("");
            setTab(t);
          }}
        />
      )}
      {tab === "comprar" && (
        <ComprarTab
          matrizFilter={matrizFilter}
          onClearFilter={() => setMatrizFilter(null)}
        />
      )}
      {tab === "optimizar" && (
        <OptimizarTab
          matrizFilter={matrizFilter}
          onClearFilter={() => setMatrizFilter(null)}
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
