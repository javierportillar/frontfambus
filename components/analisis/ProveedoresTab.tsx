"use client";

import { useState } from "react";
import Link from "next/link";
import { useAnalisisProveedores, type ProveedorAnalisis } from "@/lib/api/hooks";
import { isValidSupplierNit, supplierProfileHref } from "@/lib/compras/routes";
import { canAccessFeature } from "@/lib/auth/access";
import { useAuthStore } from "@/lib/auth/store";
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
  const role = useAuthStore((state) => state.role);
  const enabledFeatures = useAuthStore((state) => state.enabledFeatures);
  const allowedModules = useAuthStore((state) => state.allowedModules);
  const canOpenSupplierProfile = canAccessFeature("ventas-summary", {
    role,
    enabledFeatures,
    allowedModules,
  });
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("compras");

  if (isLoading && !data) return <Card><Skeleton className="h-96 rounded-lg" /></Card>;
  if (!data) return <Card><Skeleton className="h-32 rounded-lg" /></Card>;
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
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="font-semibold text-text-primary">Detalle por proveedor</h2>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap">
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
              aria-label="Buscar proveedor analizado o NIT"
              className="w-full min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm sm:w-56"
            />
          </div>
        </div>
      }>
        <p className="mb-2 text-xs text-text-muted">
          🔵 = lado compra (cuánto le pagaste) · 🟢 = lado venta (qué generaron sus productos) ·
          ⚡ ratio = ventas / compras (eficiencia de rotación)
        </p>
        <ul aria-label="Proveedores analizados" className="space-y-2 lg:hidden">
          {proveedoresFiltrados.map((provider, index) => (
            <SupplierInsightCard
              key={provider.nit}
              provider={provider}
              rank={index + 1}
              canOpenProfile={canOpenSupplierProfile}
            />
          ))}
        </ul>
        <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
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
                <ProveedorRow key={p.nit} p={p} rank={idx + 1} canOpenProfile={canOpenSupplierProfile} />
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
      aria-pressed={active}
      className={`min-h-9 rounded-md px-2 py-1 text-[0.7rem] ${
        active ? "bg-surface-dark text-text-inverse" : "bg-surface-alt text-text-secondary hover:bg-surface-alt/70"
      }`}
    >
      {label}
    </button>
  );
}

function SupplierInsightCard({
  provider,
  rank,
  canOpenProfile,
}: {
  provider: ProveedorAnalisis;
  rank: number;
  canOpenProfile: boolean;
}): JSX.Element {
  const ratio = provider.ratio_venta_compra;
  const isHighDependency = provider.pct_del_total >= 30;
  const isSleeping = (provider.dias_desde_ultima_compra ?? 0) > 180;
  const supplierHref = canOpenProfile && isValidSupplierNit(provider.nit)
    ? supplierProfileHref(provider.nit)
    : null;

  return (
    <li className="min-w-0 rounded-xl border border-border bg-surface p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-start gap-2">
            <span className="shrink-0 rounded-md bg-surface-alt px-1.5 py-0.5 text-xs font-semibold tabular-nums text-text-muted">
              #{rank}
            </span>
            {supplierHref ? (
              <Link href={supplierHref} className="break-words text-sm font-semibold leading-snug text-primary hover:underline">
                {provider.nombre}
              </Link>
            ) : (
              <p className="break-words text-sm font-semibold leading-snug text-text-primary">{provider.nombre}</p>
            )}
          </div>
          <p className="mt-1 break-all pl-8 font-mono text-xs text-text-muted">
            {supplierHref ? (
              <Link href={supplierHref} className="hover:text-primary hover:underline">NIT {provider.nit}</Link>
            ) : `NIT ${provider.nit}`}
            <span> · {provider.num_documentos.toLocaleString("es-CO")} doc</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[0.65rem] text-text-muted">Comprado</p>
          <p className="break-words text-sm font-bold leading-tight tabular-nums text-text-primary">
            {formatMoneyFull(provider.total_compras)}
          </p>
          <p className={`mt-1 text-xs tabular-nums ${isHighDependency ? "font-bold text-red-600" : "text-text-muted"}`}>
            {provider.pct_del_total}% del total
          </p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/70 pt-2 text-xs sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-text-muted">Vendido</dt>
          <dd className="mt-0.5 break-words font-semibold tabular-nums text-green-700">{formatMoneyFull(provider.revenue_periodo ?? 0)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-muted">Margen</dt>
          <dd className="mt-0.5 break-words font-semibold tabular-nums text-text-primary">{formatMoneyFull(provider.margen_periodo ?? 0)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Margen %</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">
            {provider.margen_pct == null ? "—" : `${provider.margen_pct.toFixed(1)}%`}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">SKU vendidos</dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-text-primary">{(provider.skus_vendidos ?? 0).toLocaleString("es-CO")}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Ratio venta/compra</dt>
          <dd className={`mt-0.5 font-semibold tabular-nums ${ratio == null ? "text-text-muted" : ratio >= 1.5 ? "text-green-700" : ratio < 0.5 ? "text-red-600" : "text-text-primary"}`}>
            {ratio == null ? "—" : ratio.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Última compra</dt>
          <dd className={`mt-0.5 font-medium tabular-nums ${isSleeping ? "text-red-600" : "text-text-primary"}`}>
            {provider.dias_desde_ultima_compra == null ? "—" : `${provider.dias_desde_ultima_compra} días`}
            {isSleeping ? " · inactivo" : ""}
          </dd>
        </div>
      </dl>
    </li>
  );
}

function ProveedorRow({ p, rank, canOpenProfile }: { p: ProveedorAnalisis; rank: number; canOpenProfile: boolean }): JSX.Element {
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
        {canOpenProfile && isValidSupplierNit(p.nit) ? (
          <Link href={supplierProfileHref(p.nit)} className="font-medium text-primary hover:underline">
            {p.nombre}
          </Link>
        ) : (
          <div className="font-medium text-text-primary">{p.nombre}</div>
        )}
        <div className="text-[0.65rem] text-text-muted">
          {canOpenProfile && isValidSupplierNit(p.nit) ? (
            <Link href={supplierProfileHref(p.nit)} className="hover:text-primary hover:underline">NIT {p.nit}</Link>
          ) : `NIT ${p.nit}`} · {p.num_documentos} doc · ticket {formatMoneyFull(p.ticket_promedio)}
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
