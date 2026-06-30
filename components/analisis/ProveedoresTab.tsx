"use client";

import { useState } from "react";
import { useAnalisisProveedores, type ProveedorAnalisis } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";

interface Props {
  ini: string;
  fin: string;
}

const RIESGO_CFG: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  "crítico":       { label: "🔴 Crítico",       color: "#DC2626", bg: "#FEE2E2", desc: "Un solo proveedor concentra ≥70% del volumen. Si te falla, te quedás sin reposición." },
  "alto":          { label: "🟠 Alto",          color: "#C2410C", bg: "#FFEDD5", desc: "Un proveedor concentra entre 50-70% del volumen. Vulnerable a fallas." },
  "medio":         { label: "🟡 Medio",         color: "#A16207", bg: "#FEF3C7", desc: "Los 3 primeros concentran ≥75% del volumen." },
  "diversificado": { label: "🟢 Diversificado", color: "#15803D", bg: "#DCFCE7", desc: "Distribución sana entre múltiples proveedores. Bajo riesgo." },
  "n/a":           { label: "—",                color: "#6B7280", bg: "#F3F4F6", desc: "Sin datos suficientes." },
};

type SortBy = "compras" | "ventas" | "margen" | "ratio";

export function ProveedoresTab({ ini, fin }: Props): JSX.Element {
  const { data, isLoading } = useAnalisisProveedores(ini, fin);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("compras");

  if (isLoading && !data) return <Card><Skeleton className="h-96 rounded-lg" /></Card>;
  if (!data) return <Card><p className="py-8 text-center text-sm text-text-muted">Sin datos.</p></Card>;
  if (data.total_proveedores === 0) {
    return <Card><p className="py-12 text-center text-sm text-text-muted">Sin compras en el período seleccionado.</p></Card>;
  }

  const riesgoFallback = RIESGO_CFG["n/a"] ?? { label: "—", color: "#6B7280", bg: "#F3F4F6", desc: "Sin datos suficientes." };
  const riesgo = RIESGO_CFG[data.concentracion.riesgo] ?? riesgoFallback;
  const proveedoresFiltrados = data.proveedores
    .filter((p) => !filter || p.nombre.toLowerCase().includes(filter.toLowerCase()) || p.nit.includes(filter))
    .sort((a, b) => {
      if (sortBy === "ventas") return (b.revenue_periodo ?? 0) - (a.revenue_periodo ?? 0);
      if (sortBy === "margen") return (b.margen_periodo ?? 0) - (a.margen_periodo ?? 0);
      if (sortBy === "ratio") return (b.ratio_venta_compra ?? 0) - (a.ratio_venta_compra ?? 0);
      return b.total_compras - a.total_compras;
    });

  return (
    <div className="space-y-4">
      {/* KPIs principales (cruce compra + venta) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <Stat
            label="Proveedores activos"
            value={data.total_proveedores.toLocaleString("es-CO")}
            subtitle="con compras en el período"
          />
        </Card>
        <Card>
          <Stat
            label="🔵 Total comprado"
            value={formatMoneyFull(data.total_compras)}
            subtitle="le pagaste a tus proveedores"
          />
        </Card>
        <Card>
          <Stat
            label="🟢 Total vendido"
            value={formatMoneyFull(data.total_ventas_de_proveedores ?? 0)}
            subtitle="ventas de productos asociados"
          />
        </Card>
        <Card>
          <Stat
            label="🟢 Margen aportado"
            value={formatMoneyFull(data.total_margen_de_proveedores ?? 0)}
            subtitle={
              data.total_ventas_de_proveedores
                ? `${((data.total_margen_de_proveedores ?? 0) / data.total_ventas_de_proveedores * 100).toFixed(1)}% del revenue`
                : "—"
            }
          />
        </Card>
      </div>

      {/* Alertas */}
      {data.alertas.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold text-text-primary">⚠️ Alertas</h2>
          <ul className="space-y-2">
            {data.alertas.map((a, idx) => (
              <li
                key={idx}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  a.severidad === "alta"
                    ? "border-red-300 bg-red-50 text-red-900"
                    : "border-amber-300 bg-amber-50 text-amber-900"
                }`}
              >
                {a.mensaje}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Concentración de riesgo */}
      <Card header={<h2 className="font-semibold text-text-primary">🎯 Concentración de riesgo</h2>}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <div
              className="rounded-lg border px-4 py-3"
              style={{ background: riesgo.bg, borderColor: riesgo.color }}
            >
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: riesgo.color }}>
                Nivel de riesgo
              </div>
              <div className="mt-1 text-2xl font-bold" style={{ color: riesgo.color }}>
                {riesgo.label}
              </div>
              <p className="mt-2 text-sm" style={{ color: riesgo.color }}>
                {riesgo.desc}
              </p>
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-16 text-xs text-text-muted">Top 1</span>
                <div className="flex-1 h-3 overflow-hidden rounded-full bg-surface-alt">
                  <div className="h-full bg-primary" style={{ width: `${Math.min(data.concentracion.top1_pct, 100)}%` }} />
                </div>
                <span className="w-14 text-right text-xs font-semibold tabular-nums">{data.concentracion.top1_pct}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 text-xs text-text-muted">Top 3</span>
                <div className="flex-1 h-3 overflow-hidden rounded-full bg-surface-alt">
                  <div className="h-full bg-amber-500" style={{ width: `${Math.min(data.concentracion.top3_pct, 100)}%` }} />
                </div>
                <span className="w-14 text-right text-xs font-semibold tabular-nums">{data.concentracion.top3_pct}%</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-16 text-xs text-text-muted">Top 5</span>
                <div className="flex-1 h-3 overflow-hidden rounded-full bg-surface-alt">
                  <div className="h-full bg-green-600" style={{ width: `${Math.min(data.concentracion.top5_pct, 100)}%` }} />
                </div>
                <span className="w-14 text-right text-xs font-semibold tabular-nums">{data.concentracion.top5_pct}%</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Pareto: <strong>{data.pareto.prov_para_80_pct} de {data.pareto.total_prov} proveedores</strong>{" "}
              ({data.pareto.pct_prov}%) generan el 80% del volumen comprado.{" "}
              <span className="text-text-secondary">HHI: {data.concentracion.hhi}</span>
            </p>
          </div>
        </div>
      </Card>

      {/* Tabla de proveedores */}
      <Card header={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-text-primary">Detalle por proveedor</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              <SortPill label="🔵 Compras" active={sortBy === "compras"} onClick={() => setSortBy("compras")} />
              <SortPill label="🟢 Ventas" active={sortBy === "ventas"} onClick={() => setSortBy("ventas")} />
              <SortPill label="🟢 Margen" active={sortBy === "margen"} onClick={() => setSortBy("margen")} />
              <SortPill label="⚡ Ratio" active={sortBy === "ratio"} onClick={() => setSortBy("ratio")} />
            </div>
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar proveedor o NIT..."
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm w-56"
            />
          </div>
        </div>
      }>
        <p className="mb-2 text-xs text-text-muted">
          🔵 = lado compra (cuánto le pagaste) · 🟢 = lado venta (qué generaron sus productos) ·
          ⚡ ratio = ventas / compras (eficiencia de rotación)
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                <th className="py-2 px-3">#</th>
                <th className="py-2 px-3">Proveedor</th>
                <th className="py-2 px-3 text-right">Comprado</th>
                <th className="py-2 px-3 text-right">% compras</th>
                <th className="py-2 px-3 text-right">Vendido</th>
                <th className="py-2 px-3 text-right">Margen $</th>
                <th className="py-2 px-3 text-right">Margen %</th>
                <th className="py-2 px-3 text-right">SKUs</th>
                <th className="py-2 px-3 text-right">Ratio v/c</th>
                <th className="py-2 px-3 text-right">Días desde última</th>
              </tr>
            </thead>
            <tbody>
              {proveedoresFiltrados.map((p, idx) => (
                <ProveedorRow key={p.nit} p={p} rank={idx + 1} />
              ))}
            </tbody>
          </table>
        </div>
        {proveedoresFiltrados.length === 0 && filter && (
          <p className="mt-3 text-center text-sm text-text-muted">Sin resultados para &ldquo;{filter}&rdquo;</p>
        )}
        <p className="mt-2 text-[0.65rem] text-text-muted">
          <strong>Ratio v/c</strong>: por cada peso comprado a este proveedor, cuántos pesos vendiste
          de sus productos en el período. ≥1.5 verde (excelente rotación) · 1-1.5 ok · 0.5-1 lento ·
          &lt;0.5 rojo (sobre-comprado, capital atrapado).
        </p>
      </Card>
    </div>
  );
}

function SortPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2 py-1 text-[0.7rem] ${
        active ? "bg-surface-dark text-text-inverse" : "bg-surface-alt text-text-secondary hover:bg-surface-alt/70"
      }`}
    >
      {label}
    </button>
  );
}

function ProveedorRow({ p, rank }: { p: ProveedorAnalisis; rank: number }): JSX.Element {
  const dependencia = p.pct_del_total >= 30 ? "text-red-600 font-bold" : p.pct_del_total >= 15 ? "text-amber-600 font-semibold" : "text-text-primary";
  const durmiendo = (p.dias_desde_ultima_compra ?? 0) > 180;
  const ratio = p.ratio_venta_compra;
  const ratioColor = ratio == null
    ? "text-text-muted"
    : ratio >= 1.5 ? "text-green-700 font-bold"
    : ratio >= 1 ? "text-text-primary font-semibold"
    : ratio >= 0.5 ? "text-amber-600"
    : "text-red-600 font-semibold";
  return (
    <tr className="border-b border-border/60 hover:bg-surface-alt">
      <td className="py-2 px-3 text-xs text-text-muted tabular-nums">{rank}</td>
      <td className="py-2 px-3">
        <div className="text-text-primary font-medium">{p.nombre}</div>
        <div className="text-[0.65rem] text-text-muted">
          NIT {p.nit} · {p.num_documentos} doc · ticket {formatMoneyFull(p.ticket_promedio)}
        </div>
      </td>
      <td className="py-2 px-3 text-right tabular-nums font-semibold">{formatMoneyFull(p.total_compras)}</td>
      <td className={`py-2 px-3 text-right tabular-nums ${dependencia}`}>{p.pct_del_total}%</td>
      <td className="py-2 px-3 text-right tabular-nums font-semibold text-green-700">
        {formatMoneyFull(p.revenue_periodo ?? 0)}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-green-700">
        {formatMoneyFull(p.margen_periodo ?? 0)}
      </td>
      <td className={`py-2 px-3 text-right tabular-nums text-xs ${(p.margen_pct ?? 0) >= 30 ? "text-green-700" : (p.margen_pct ?? 0) >= 15 ? "text-amber-600" : "text-text-muted"}`}>
        {p.margen_pct != null ? `${p.margen_pct.toFixed(1)}%` : "—"}
      </td>
      <td className="py-2 px-3 text-right tabular-nums text-xs text-text-muted">{p.skus_vendidos ?? 0}</td>
      <td className={`py-2 px-3 text-right tabular-nums ${ratioColor}`} title="Revenue / Compras">
        {ratio != null ? ratio.toFixed(2) : "—"}
      </td>
      <td className={`py-2 px-3 text-right tabular-nums text-xs ${durmiendo ? "text-red-600 font-semibold" : "text-text-muted"}`}>
        {p.dias_desde_ultima_compra != null ? `${p.dias_desde_ultima_compra}d` : "—"}
        {durmiendo && " 💤"}
      </td>
    </tr>
  );
}
