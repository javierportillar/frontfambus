"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  useInventarioOverview,
  type InventarioAccion,
  type InventarioItem,
} from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import { AbcLegend } from "@/components/productos/AbcLegend";

// Etiquetas legibles y color por bucket
const ACCION_META: Record<InventarioAccion, { label: string; emoji: string; color: string; tabDestino: string }> = {
  comprar_ya: { label: "Comprar YA", emoji: "🔴", color: "#DC2626", tabDestino: "comprar" },
  comprar_pronto: { label: "Comprar pronto", emoji: "🟡", color: "#F59E0B", tabDestino: "comprar" },
  ok: { label: "Sanos", emoji: "✅", color: "#16A34A", tabDestino: "catalogo" },
  liquidar: { label: "Liquidar", emoji: "🧹", color: "#C2410C", tabDestino: "optimizar" },
  sobrestock: { label: "Sobrestock", emoji: "📦", color: "#9333EA", tabDestino: "optimizar" },
  zombie_con_stock: { label: "Zombie c/stock", emoji: "💀", color: "#6B7280", tabDestino: "optimizar" },
  sin_accion: { label: "Sin acción", emoji: "—", color: "#9CA3AF", tabDestino: "catalogo" },
};

// Matriz Stock × Rotación: 4 filas × 3 cols
type StockBucket = "sin_stock" | "bajo" | "normal" | "sobrestock";
type RotBucket = "sin_rot" | "baja" | "alta";

interface Props {
  onGoToTab: (tab: "comprar" | "optimizar" | "catalogo") => void;
}

export function ResumenTab({ onGoToTab }: Props): JSX.Element {
  const { data, isLoading } = useInventarioOverview();

  const matriz = useMemo(() => {
    if (!data) return null;
    // Calcular terciles de rotación entre los que SÍ rotan
    const rot = data.items.filter((i) => i.rotacion_diaria > 0).map((i) => i.rotacion_diaria).sort((a, b) => a - b);
    const p33 = rot[Math.floor(rot.length * 0.33)] ?? 0.1;
    const p67 = rot[Math.floor(rot.length * 0.67)] ?? 1;

    function rotBucketOf(it: InventarioItem): RotBucket {
      if (it.rotacion_diaria === 0) return "sin_rot";
      if (it.rotacion_diaria < p33) return "baja";
      if (it.rotacion_diaria >= p67) return "alta";
      return "baja"; // medias agrupadas con bajas para simplicidad
    }

    function stockBucketOf(it: InventarioItem): StockBucket {
      if (it.stock <= 0) return "sin_stock";
      if (it.cobertura_dias !== null && it.cobertura_dias > 180) return "sobrestock";
      if (it.cobertura_dias !== null && it.cobertura_dias < 7) return "bajo";
      return "normal";
    }

    const grid = new Map<string, number>();
    for (const it of data.items) {
      const key = `${stockBucketOf(it)}-${rotBucketOf(it)}`;
      grid.set(key, (grid.get(key) ?? 0) + 1);
    }
    return { grid, p33, p67 };
  }, [data]);

  if (isLoading && !data) return <Card><Skeleton className="h-96 rounded-lg" /></Card>;
  if (!data) return <Card><p className="py-8 text-center text-sm text-text-muted">Sin datos.</p></Card>;

  const stockLabels: Record<StockBucket, string> = {
    sin_stock: "Sin stock",
    bajo: "Bajo (<7d)",
    normal: "Normal",
    sobrestock: "Sobrestock (>180d)",
  };
  const rotLabels: Record<RotBucket, string> = {
    sin_rot: "Sin rotación",
    baja: "Rotación baja/media",
    alta: "Rotación alta",
  };
  const stockOrder: StockBucket[] = ["sin_stock", "bajo", "normal", "sobrestock"];
  const rotOrder: RotBucket[] = ["sin_rot", "baja", "alta"];

  // Acción sugerida por celda
  const cellAction: Record<string, { label: string; color: string; tab?: "comprar" | "optimizar" }> = {
    "sin_stock-sin_rot": { label: "—", color: "#9CA3AF" },
    "sin_stock-baja": { label: "Evaluar", color: "#F59E0B", tab: "comprar" },
    "sin_stock-alta": { label: "🔴 COMPRAR YA", color: "#DC2626", tab: "comprar" },
    "bajo-sin_rot": { label: "Liquidar", color: "#C2410C", tab: "optimizar" },
    "bajo-baja": { label: "Observar", color: "#9CA3AF" },
    "bajo-alta": { label: "🟡 Comprar pronto", color: "#F59E0B", tab: "comprar" },
    "normal-sin_rot": { label: "Liquidar", color: "#C2410C", tab: "optimizar" },
    "normal-baja": { label: "OK", color: "#16A34A" },
    "normal-alta": { label: "✅ OK", color: "#16A34A" },
    "sobrestock-sin_rot": { label: "🔴 LIQUIDAR", color: "#DC2626", tab: "optimizar" },
    "sobrestock-baja": { label: "Reducir", color: "#9333EA", tab: "optimizar" },
    "sobrestock-alta": { label: "Revisar", color: "#9333EA" },
  };

  // Top 5 alertas críticas
  const topAlertas = [...data.items]
    .filter((i) => i.accion === "comprar_ya")
    .sort((a, b) => b.ingreso_perdido_estimado - a.ingreso_perdido_estimado)
    .slice(0, 5);

  const accionNecesaria =
    data.buckets_count.comprar_ya +
    data.buckets_count.comprar_pronto +
    data.buckets_count.liquidar +
    data.buckets_count.sobrestock;

  return (
    <div className="space-y-4">
      {/* KPIs principales */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <Stat
            label="Valor inventario"
            value={formatMoneyFull(data.valor_total_inventario)}
            subtitle={`${data.total_skus.toLocaleString("es-CO")} SKUs en catálogo`}
          />
        </Card>
        <Card>
          <Stat
            label="Capital ocioso"
            value={formatMoneyFull(data.capital_ocioso)}
            subtitle={`liquidar + zombie + sobrestock`}
          />
        </Card>
        <Card>
          <Stat
            label="Ingreso perdido estimado"
            value={formatMoneyFull(data.ingreso_perdido_estimado_mensual)}
            subtitle="al mes, por quiebres de stock"
          />
        </Card>
        <Card>
          <Stat
            label="Productos a accionar"
            value={accionNecesaria.toLocaleString("es-CO")}
            subtitle="entre comprar y optimizar"
          />
        </Card>
      </div>

      {/* Matriz Stock × Rotación */}
      <Card header={
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-text-primary">Matriz Stock × Rotación</h2>
          <span className="text-xs text-text-muted">click en celda → tab correspondiente</span>
        </div>
      }>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted text-[0.7rem] uppercase">
                <th className="py-2 pr-2"></th>
                {rotOrder.map((r) => (
                  <th key={r} className="py-2 px-2 text-center">{rotLabels[r]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stockOrder.map((s) => (
                <tr key={s} className="border-t border-border">
                  <td className="py-3 pr-2 font-semibold text-text-primary text-xs">{stockLabels[s]}</td>
                  {rotOrder.map((r) => {
                    const key = `${s}-${r}`;
                    const count = matriz?.grid.get(key) ?? 0;
                    const action = cellAction[key] ?? { label: "—", color: "#9CA3AF" };
                    const targetTab = action.tab;
                    const clickable = !!targetTab && count > 0;
                    return (
                      <td
                        key={r}
                        className={`py-3 px-2 text-center ${clickable ? "cursor-pointer hover:bg-surface-alt" : ""}`}
                        onClick={() => { if (clickable && targetTab) onGoToTab(targetTab); }}
                      >
                        <div className="text-2xl font-bold tabular-nums" style={{ color: count > 0 ? action.color : "#D1D5DB" }}>
                          {count}
                        </div>
                        <div className="text-[0.65rem] mt-0.5" style={{ color: count > 0 ? action.color : "#9CA3AF" }}>
                          {action.label}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {matriz && (
          <p className="mt-2 text-[0.7rem] text-text-muted">
            Rotación: <strong>baja/media</strong> &lt; {matriz.p33.toFixed(2)} u/día, <strong>alta</strong> ≥ {matriz.p67.toFixed(2)} u/día.
            Cobertura: stock / rotación diaria.
          </p>
        )}
      </Card>

      {/* Top 5 alertas */}
      {topAlertas.length > 0 && (
        <Card header={
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text-primary">🔴 Top 5 alertas — comprar YA</h2>
            <button
              type="button"
              onClick={() => onGoToTab("comprar")}
              className="text-xs text-accent hover:underline"
            >
              Ver todos los {data.buckets_count.comprar_ya} →
            </button>
          </div>
        }>
          <div className="mb-3">
            <AbcLegend />
          </div>
          <div className="space-y-2">
            {topAlertas.map((it) => (
              <AlertaRow key={it.cod_producto} item={it} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function AlertaRow({ item }: { item: InventarioItem }): JSX.Element {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(item.cod_producto)}`)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-left hover:bg-surface-alt"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text-primary truncate">{item.nom_producto}</div>
        <div className="text-[0.65rem] text-text-muted">
          {item.cod_producto} · rotación {item.rotacion_diaria.toFixed(2)} {item.unidad_medida}/día
          {item.abc && <span className="ml-1">· ABC: {item.abc}</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-red-700">
          Perdido: {formatMoneyFull(item.ingreso_perdido_estimado)}/mes
        </div>
        <div className="text-[0.65rem] text-text-muted">
          Sugerido: {item.sugerido_comprar} {item.unidad_medida}
        </div>
      </div>
    </button>
  );
}
