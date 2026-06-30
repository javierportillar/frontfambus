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

export function ProveedoresTab({ ini, fin }: Props): JSX.Element {
  const { data, isLoading } = useAnalisisProveedores(ini, fin);
  const [filter, setFilter] = useState("");

  if (isLoading && !data) return <Card><Skeleton className="h-96 rounded-lg" /></Card>;
  if (!data) return <Card><p className="py-8 text-center text-sm text-text-muted">Sin datos.</p></Card>;
  if (data.total_proveedores === 0) {
    return <Card><p className="py-12 text-center text-sm text-text-muted">Sin compras en el período seleccionado.</p></Card>;
  }

  const riesgoFallback = RIESGO_CFG["n/a"] ?? { label: "—", color: "#6B7280", bg: "#F3F4F6", desc: "Sin datos suficientes." };
  const riesgo = RIESGO_CFG[data.concentracion.riesgo] ?? riesgoFallback;
  const proveedoresFiltrados = data.proveedores.filter((p) =>
    !filter || p.nombre.toLowerCase().includes(filter.toLowerCase()) || p.nit.includes(filter),
  );

  return (
    <div className="space-y-4">
      {/* KPIs principales */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <Stat
            label="Proveedores activos"
            value={data.total_proveedores.toLocaleString("es-CO")}
            subtitle="en el período"
          />
        </Card>
        <Card>
          <Stat
            label="Total comprado"
            value={formatMoneyFull(data.total_compras)}
            subtitle="periodo seleccionado"
          />
        </Card>
        <Card>
          <Stat
            label="Top 1 proveedor"
            value={`${data.concentracion.top1_pct}%`}
            subtitle="del total"
          />
        </Card>
        <Card>
          <Stat
            label="Top 5 proveedores"
            value={`${data.concentracion.top5_pct}%`}
            subtitle="acumulado"
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
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Buscar proveedor o NIT..."
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm w-64"
          />
        </div>
      }>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-alt text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
                <th className="py-2 px-3">#</th>
                <th className="py-2 px-3">Proveedor</th>
                <th className="py-2 px-3 text-right">% del total</th>
                <th className="py-2 px-3 text-right">Total</th>
                <th className="py-2 px-3 text-right">Docs</th>
                <th className="py-2 px-3 text-right">Ticket prom.</th>
                <th className="py-2 px-3 text-right">Frec. (días)</th>
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
          <p className="mt-3 text-center text-sm text-text-muted">Sin resultados para "{filter}"</p>
        )}
      </Card>
    </div>
  );
}

function ProveedorRow({ p, rank }: { p: ProveedorAnalisis; rank: number }): JSX.Element {
  const dependencia = p.pct_del_total >= 30 ? "text-red-600 font-bold" : p.pct_del_total >= 15 ? "text-amber-600 font-semibold" : "text-text-primary";
  const durmiendo = (p.dias_desde_ultima_compra ?? 0) > 180;
  return (
    <tr className="border-b border-border/60 hover:bg-surface-alt">
      <td className="py-2 px-3 text-xs text-text-muted tabular-nums">{rank}</td>
      <td className="py-2 px-3">
        <div className="text-text-primary font-medium">{p.nombre}</div>
        <div className="text-[0.65rem] text-text-muted">NIT {p.nit}</div>
      </td>
      <td className={`py-2 px-3 text-right tabular-nums ${dependencia}`}>{p.pct_del_total}%</td>
      <td className="py-2 px-3 text-right tabular-nums font-semibold">{formatMoneyFull(p.total_compras)}</td>
      <td className="py-2 px-3 text-right tabular-nums">{p.num_documentos}</td>
      <td className="py-2 px-3 text-right tabular-nums text-text-muted">{formatMoneyFull(p.ticket_promedio)}</td>
      <td className="py-2 px-3 text-right tabular-nums text-text-muted">
        {p.frecuencia_dias_promedio != null ? `${p.frecuencia_dias_promedio}d` : "—"}
      </td>
      <td className={`py-2 px-3 text-right tabular-nums ${durmiendo ? "text-red-600 font-semibold" : "text-text-muted"}`}>
        {p.dias_desde_ultima_compra != null ? `${p.dias_desde_ultima_compra}d` : "—"}
        {durmiendo && " 💤"}
      </td>
    </tr>
  );
}
