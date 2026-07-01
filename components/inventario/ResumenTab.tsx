"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
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

// ── Tipos exportados (los necesita ComprarTab / OptimizarTab) ─────────────

export type StockBucket = "sin_stock" | "bajo" | "normal" | "sobrestock";
export type RotBucket = "sin_rot" | "baja" | "alta";
export type MatrizFilter = { stock: StockBucket; rot: RotBucket };

export function getStockBucket(it: InventarioItem): StockBucket {
  if (it.stock <= 0) return "sin_stock";
  if (it.cobertura_dias !== null && it.cobertura_dias > 180) return "sobrestock";
  if (it.cobertura_dias !== null && it.cobertura_dias < 7) return "bajo";
  return "normal";
}

export function getRotBucket(
  it: InventarioItem,
  p33: number,
  p67: number,
): RotBucket {
  if (it.rotacion_diaria === 0) return "sin_rot";
  if (it.rotacion_diaria >= p67) return "alta";
  return "baja"; // < p67, includes both baja and media
}

export function computeRotationThresholds(
  items: InventarioItem[],
): { p33: number; p67: number } {
  const rot = items
    .filter((i) => i.rotacion_diaria > 0)
    .map((i) => i.rotacion_diaria)
    .sort((a, b) => a - b);
  return {
    p33: rot[Math.floor(rot.length * 0.33)] ?? 0.1,
    p67: rot[Math.floor(rot.length * 0.67)] ?? 1,
  };
}

// ── Config de la matriz ──────────────────────────────────────────────────

const STOCK_ORDER: StockBucket[] = ["sin_stock", "bajo", "normal", "sobrestock"];
const ROT_ORDER: RotBucket[] = ["sin_rot", "baja", "alta"];

const STOCK_LABELS: Record<StockBucket, string> = {
  sin_stock: "Sin stock",
  bajo: "Bajo (<7d)",
  normal: "Normal",
  sobrestock: "Sobrestock (>180d)",
};

const ROT_LABELS: Record<RotBucket, string> = {
  sin_rot: "Sin rotación",
  baja: "Rotación baja/media",
  alta: "Rotación alta",
};

const STOCK_COLORS: Record<StockBucket, string> = {
  sin_stock: "#9CA3AF",
  bajo: "#F59E0B",
  normal: "#16A34A",
  sobrestock: "#9333EA",
};

// Toda celda tiene un tab destino para que sea cliqueable
const CELL_ACTION: Record<
  string,
  { label: string; color: string; tab: "comprar" | "optimizar" | "catalogo" }
> = {
  "sin_stock-sin_rot": { label: "—", color: "#9CA3AF", tab: "catalogo" },
  "sin_stock-baja": { label: "Evaluar", color: "#F59E0B", tab: "comprar" },
  "sin_stock-alta": { label: "🔴 COMPRAR YA", color: "#DC2626", tab: "comprar" },
  "bajo-sin_rot": { label: "Liquidar", color: "#C2410C", tab: "optimizar" },
  "bajo-baja": { label: "Observar", color: "#9CA3AF", tab: "comprar" },
  "bajo-alta": { label: "🟡 Comprar pronto", color: "#F59E0B", tab: "comprar" },
  "normal-sin_rot": { label: "Liquidar", color: "#C2410C", tab: "optimizar" },
  "normal-baja": { label: "OK", color: "#16A34A", tab: "catalogo" },
  "normal-alta": { label: "✅ OK", color: "#16A34A", tab: "catalogo" },
  "sobrestock-sin_rot": { label: "🔴 LIQUIDAR", color: "#DC2626", tab: "optimizar" },
  "sobrestock-baja": { label: "Reducir", color: "#9333EA", tab: "optimizar" },
  "sobrestock-alta": { label: "Revisar", color: "#9333EA", tab: "optimizar" },
};

// Etiquetas legibles y color por bucket de acción (KPIs)
const ACCION_META: Record<InventarioAccion, { label: string; emoji: string; color: string; tabDestino: string }> = {
  comprar_ya: { label: "Comprar YA", emoji: "🔴", color: "#DC2626", tabDestino: "comprar" },
  comprar_pronto: { label: "Comprar pronto", emoji: "🟡", color: "#F59E0B", tabDestino: "comprar" },
  ok: { label: "Sanos", emoji: "✅", color: "#16A34A", tabDestino: "catalogo" },
  liquidar: { label: "Liquidar", emoji: "🧹", color: "#C2410C", tabDestino: "optimizar" },
  sobrestock: { label: "Sobrestock", emoji: "📦", color: "#9333EA", tabDestino: "optimizar" },
  zombie_con_stock: { label: "Zombie c/stock", emoji: "💀", color: "#6B7280", tabDestino: "optimizar" },
  sin_accion: { label: "Sin acción", emoji: "—", color: "#9CA3AF", tabDestino: "catalogo" },
};

// ── Componente principal ─────────────────────────────────────────────────

interface Props {
  onGoToTab: (tab: "comprar" | "optimizar" | "catalogo", filter?: MatrizFilter) => void;
}

// ── Tooltip personalizado para donas ────────────────────────────────────────

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { label: string; total: number; color: string } }[];
}): JSX.Element | null {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0];
  if (!d) return null;
  const pct = d.payload.total > 0 ? ((d.value / d.payload.total) * 100).toFixed(1) : "0";
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-lg">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.payload.color }} />
        <span className="font-medium text-text-primary">{d.payload.label}</span>
      </div>
      <div className="mt-1 text-text-muted text-xs">
        <strong className="tabular-nums text-text-primary">{d.value.toLocaleString("es-CO")}</strong> SKUs ·{" "}
        <strong>{pct}%</strong> del total
      </div>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────

export function ResumenTab({ onGoToTab }: Props): JSX.Element {
  const { data, isLoading } = useInventarioOverview();
  const [donutHoverIndex, setDonutHoverIndex] = useState<number>(-1);

  const matriz = useMemo(() => {
    if (!data) return null;
    const { p33, p67 } = computeRotationThresholds(data.items);

    const grid = new Map<string, number>();
    for (const it of data.items) {
      const key = `${getStockBucket(it)}-${getRotBucket(it, p33, p67)}`;
      grid.set(key, (grid.get(key) ?? 0) + 1);
    }
    return { grid, p33, p67 };
  }, [data]);

  // Dona única: etiquetas de acción de la matriz (congruente con la tabla)
  const donutActions = useMemo(() => {
    if (!matriz) return [];
    const byLabel = new Map<string, { label: string; value: number; color: string }>();
    for (const s of STOCK_ORDER) {
      for (const r of ROT_ORDER) {
        const key = `${s}-${r}`;
        const count = matriz.grid.get(key) ?? 0;
        if (count === 0) continue;
        const action = CELL_ACTION[key]!;
        const existing = byLabel.get(action.label);
        if (existing) {
          existing.value += count;
        } else {
          byLabel.set(action.label, { label: action.label, value: count, color: action.color });
        }
      }
    }
    const total = data?.items.length ?? 0;
    return Array.from(byLabel.values())
      .map((d) => ({ ...d, total }))
      .sort((a, b) => b.value - a.value);
  }, [matriz, data]);

  if (isLoading && !data) return <Card><Skeleton className="h-96 rounded-lg" /></Card>;
  if (!data) return <Card><Skeleton className="h-32 rounded-lg" /></Card>;

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
            label="Valor inventario (todos)"
            value={formatMoneyFull(data.valor_total_inventario)}
            subtitle={`${data.total_skus.toLocaleString("es-CO")} SKUs registrados (con y sin stock)`}
          />
        </Card>
        <Card>
          <Stat
            label="Capital ocioso"
            value={formatMoneyFull(data.capital_ocioso)}
            subtitle="liquidar + zombie + sobrestock"
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

      {/* ── Fila: Dona + Matriz ────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Dona: acciones de la matriz */}
        <Card className="lg:col-span-2" header={
          <h2 className="font-semibold text-text-primary text-sm">Distribución por acción</h2>
        }>
          <div className="flex flex-col items-center">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={donutActions}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={78}
                  dataKey="value"
                  stroke="none"
                  onMouseEnter={(_, index) => setDonutHoverIndex(index)}
                  onMouseLeave={() => setDonutHoverIndex(-1)}
                >
                  {donutActions.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.color}
                      opacity={donutHoverIndex >= 0 && donutHoverIndex !== i ? 0.35 : 1}
                      style={{ transition: "opacity 0.25s ease" }}
                    />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Leyenda ≡ cada celda de la matriz */}
          <div className="mt-2 space-y-1 text-[0.65rem]">
            {donutActions.map((d, i) => (
              <div
                key={d.label}
                className="flex items-center gap-2 rounded px-1.5 py-1 transition-colors"
                style={{
                  backgroundColor: donutHoverIndex === i ? `${d.color}15` : "transparent",
                }}
              >
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-text-muted truncate">{d.label}</span>
                <span className="ml-auto font-semibold tabular-nums text-text-primary">
                  {d.value.toLocaleString("es-CO")}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Matriz Stock × Rotación */}
        <Card className="lg:col-span-3" header={
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text-primary text-sm">Matriz Stock × Rotación</h2>
            <span className="text-[0.6rem] text-text-muted">click en celda → productos filtrados</span>
          </div>
        }>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted text-[0.65rem] uppercase tracking-wider">
                  <th className="py-2 pr-3 font-medium"></th>
                  {ROT_ORDER.map((r) => (
                    <th key={r} className="py-2 px-2 text-center font-medium">{ROT_LABELS[r]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STOCK_ORDER.map((s) => (
                  <tr key={s} className="border-t border-border">
                    <td className="py-2.5 pr-3 font-semibold text-text-primary text-xs whitespace-nowrap">
                      {STOCK_LABELS[s]}
                    </td>
                    {ROT_ORDER.map((r) => {
                      const key = `${s}-${r}`;
                      const count = matriz?.grid.get(key) ?? 0;
                      const action = CELL_ACTION[key]!;
                      return (
                        <td
                          key={r}
                          className={`py-2.5 px-2 text-center ${
                            count > 0
                              ? "cursor-pointer hover:bg-surface-alt/60 transition-colors rounded"
                              : ""
                          }`}
                          onClick={() => {
                            if (count > 0) onGoToTab(action.tab, { stock: s, rot: r });
                          }}
                        >
                          <div
                            className="text-2xl font-bold tabular-nums leading-tight"
                            style={{ color: count > 0 ? action.color : "#D1D5DB" }}
                          >
                            {count}
                          </div>
                          <div
                            className="text-[0.6rem] mt-0.5 leading-tight"
                            style={{ color: count > 0 ? action.color : "#9CA3AF" }}
                          >
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
            <p className="mt-2 text-[0.6rem] text-text-muted leading-relaxed">
              Rotación: <strong>baja/media</strong> &lt; {matriz.p33.toFixed(2)} u/día,&nbsp;
              <strong>alta</strong> ≥ {matriz.p67.toFixed(2)} u/día.
              &nbsp;Cobertura: stock ÷ rotación diaria.
            </p>
          )}
        </Card>
      </div>

      {/* Top 5 alertas */}
      {topAlertas.length > 0 && (
        <Card header={
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-text-primary text-sm">🔴 Top 5 alertas — comprar YA</h2>
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
