"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useInventoryOverview, type DecisionList, type ProductMetric } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { estadoCfg } from "@/lib/productos/display";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";
import { AbcChip } from "@/components/productos/Chips";
import { SaludCatalogo } from "@/components/productos/SaludCatalogo";
import { CatalogoZombie } from "@/components/productos/CatalogoZombie";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { ResumenTab } from "./ResumenTab";

const WINDOWS = [
  { value: 90, label: "90 días" },
  { value: 180, label: "180 días" },
  { value: 365, label: "1 año" },
];

interface Props {
  // V1.24: agregado 'estado' — cuando target='catalogo' se puede filtrar por estado
  // (soporta lista separada por coma, p.ej. 'quiebre,agotado' para "Por agotarse").
  /* eslint-disable no-unused-vars */
  onGoToTab: (target: "comprar" | "optimizar" | "catalogo", estado?: string) => void;
  /* eslint-enable no-unused-vars */
}

export function ResumenUnificado({ onGoToTab }: Props): JSX.Element {
  const [window, setWindow] = useState(180);
  const { data, isLoading } = useInventoryOverview(window);

  return (
    <div className="space-y-4">
      {/* Selector de ventana temporal — afecta KPIs/Pareto/Decisions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">Decisiones rápidas y panorama del catálogo.</p>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              type="button"
              onClick={() => setWindow(w.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                window === w.value ? "bg-surface-dark text-text-inverse" : "bg-surface-alt text-text-secondary"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && !data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : data ? (
        <>
          {/* KPIs gerenciales */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Card><Stat label="Valor del inventario" value={formatMoneyFull(data.kpis.valor_inventario_total)} subtitle={`${data.kpis.skus_con_stock.toLocaleString("es-CO")} con stock · valuados a costo`} /></Card>
            <Card><Stat label="Productos activos" value={data.kpis.skus_activos.toLocaleString("es-CO")} subtitle={`vendieron en ${window} días`} /></Card>
            <Card><Stat label="Rotación promedio" value={`${data.kpis.rotacion_promedio}×`} subtitle="veces al año" /></Card>
            <Card><Stat label="Margen del período" value={formatMoneyFull(data.kpis.margen_total_win)} subtitle={data.kpis.revenue_total_win > 0 ? `${(data.kpis.margen_total_win / data.kpis.revenue_total_win * 100).toFixed(0)}% sobre ventas` : ""} /></Card>
          </div>

          {/* Pareto */}
          <Card>
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <div className="md:w-1/2">
                <div className="text-sm text-text-secondary">Concentración de tus ventas</div>
                <div className="mt-1 text-2xl font-bold text-text-primary">
                  {data.pareto.skus_para_80.toLocaleString("es-CO")} productos
                </div>
                <div className="text-sm text-text-secondary">
                  generan el <strong className="text-primary">80%</strong> de tus ventas — eso es solo el{" "}
                  <strong>{data.pareto.pct_para_80}%</strong> de tu catálogo activo.
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  Estos son los que NO podés dejar que se agoten. El otro {(100 - data.pareto.pct_para_80).toFixed(0)}% aporta poco:
                  candidato a reducir, liquidar o discontinuar.
                </p>
                <button
                  type="button"
                  onClick={() => onGoToTab("catalogo")}
                  className="mt-3 inline-flex rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg"
                >
                  Ver catálogo completo →
                </button>
              </div>
              <div className="md:w-1/2">
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={data.pareto.curva}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="pct_productos" tick={{ fontSize: 9 }} stroke="#a3a3a3" tickFormatter={(v: number) => `${v}%`} />
                    <YAxis tick={{ fontSize: 9 }} stroke="#a3a3a3" tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
                    <Tooltip
                      formatter={(v) => [`${Number(v)}% de las ventas`, "Acumulado"]}
                      labelFormatter={(v) => `${Number(v)}% de productos`}
                      contentStyle={{ borderRadius: "8px", fontSize: "11px" }}
                    />
                    <ReferenceLine y={80} stroke="var(--color-primary, #C83828)" strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="pct_revenue_acum" stroke="var(--color-primary, #C83828)" fill="var(--color-primary, #C83828)" fillOpacity={0.12} strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="text-center text-[0.65rem] text-text-muted">Curva de Pareto: % de productos vs % de ventas acumulado</p>
              </div>
            </div>
          </Card>

          {/* 4 decision cards — V1.25.1:
              Los conteos usan el endpoint inventory-overview (por estado)
              porque es rápido y consistente. Los links llevan al plan real
              (Decisiones/Comprar o Vender) que usa el endpoint inventario-overview
              (por accion). Los N pueden diferir por criterios distintos —
              honestidad: mostramos ambos vía link secundario al catálogo. */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DecisionCard
              title="🔴 Por agotarse"
              subtitle="Se acaban pronto o ya se agotaron y se venden bien"
              list={data.listas.quiebre_inminente}
              accent="#B91C1C"
              primaryLabel="Ver plan de compras"
              onPrimary={() => onGoToTab("comprar")}
              secondaryLabel="en catálogo"
              onSecondary={() => onGoToTab("catalogo", "quiebre,agotado")}
            />
            <DecisionCard
              title="❤️ Importantes sin reabastecer"
              subtitle="Categoría A/B sin compra hace 45+ días"
              list={data.listas.importantes_sin_recompra}
              accent="#C2410C"
              primaryLabel="Ver plan de compras"
              onPrimary={() => onGoToTab("comprar")}
            />
            <DecisionCard
              title="💸 Capital atrapado"
              subtitle="Sobrestock: más de 6 meses de inventario"
              list={data.listas.capital_atrapado}
              accent="#C2410C"
              showValor
              primaryLabel="Ver plan de liquidación"
              onPrimary={() => onGoToTab("optimizar")}
              secondaryLabel="en catálogo"
              onSecondary={() => onGoToTab("catalogo", "sobrestock")}
            />
            <DecisionCard
              title="😴 Dormidos con valor"
              subtitle="Sin venta hace 90+ días, plata quieta"
              list={data.listas.dormidos_premium}
              accent="#6B7280"
              showValor
              primaryLabel="Ver plan de liquidación"
              onPrimary={() => onGoToTab("optimizar")}
              secondaryLabel="en catálogo"
              onSecondary={() => onGoToTab("catalogo", "dormido")}
            />
          </div>

          {/* Salud del inventario */}
          <Card header={<h2 className="font-semibold text-text-primary">Salud del inventario</h2>}>
            <div className="space-y-2">
              {data.estados.map((e) => {
                const cfg = estadoCfg(e.estado as ProductMetric["estado"]);
                const maxN = Math.max(...data.estados.map((x) => x.n));
                return (
                  <button
                    key={e.estado}
                    type="button"
                    onClick={() => onGoToTab("catalogo", e.estado)}
                    className="flex w-full items-center gap-3 text-left hover:bg-surface-alt rounded px-1 py-0.5"
                  >
                    <span className="w-32 shrink-0 text-xs" style={{ color: cfg.color }}>{cfg.label}</span>
                    <div className="h-4 flex-1 overflow-hidden rounded-full bg-surface-alt">
                      <div className="h-full rounded-full" style={{ width: `${(e.n / maxN) * 100}%`, background: cfg.color, opacity: 0.7 }} />
                    </div>
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-text-secondary">{e.n.toLocaleString("es-CO")}</span>
                    <span className="hidden w-28 shrink-0 text-right text-xs tabular-nums text-text-muted md:inline">{formatMoneyFull(e.valor)}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Salud del catálogo + zombies */}
          <SaludCatalogo />
          <CatalogoZombie />
        </>
      ) : (
        <Card><p className="py-12 text-center text-sm text-text-muted">No se pudo cargar la analítica de productos.</p></Card>
      )}

      {/* Matriz Stock×Rotación + Top 5 alertas (vienen del ResumenTab operativo) */}
      <div className="border-t border-border pt-4">
        <h2 className="mb-2 text-base font-semibold text-text-primary">📊 Vista operativa — qué hacer ahora</h2>
        {/* Adaptador: ResumenTab en HEAD tiene una firma más restrictiva; el
            estado extra que exportamos hacia el padre se descarta al bajar. */}
        <ResumenTab onGoToTab={(t) => onGoToTab(t as "comprar" | "optimizar" | "catalogo")} />
      </div>
    </div>
  );
}

function DecisionCard({
  title, subtitle, list, accent, showValor,
  primaryLabel, onPrimary, secondaryLabel, onSecondary,
}: {
  title: string;
  subtitle: string;
  list: DecisionList;
  accent: string;
  showValor?: boolean;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}): JSX.Element {
  const router = useRouter();
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-text-primary">{title}</h3>
          <p className="text-xs text-text-muted">{subtitle}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold tabular-nums" style={{ color: accent }}>{list.total}</div>
          {showValor && <div className="text-[0.65rem] text-text-muted">{formatMoneyFull(list.valor)}</div>}
        </div>
      </div>
      {list.items.length > 0 ? (
        <ul className="mt-3 divide-y divide-border/60">
          {list.items.slice(0, 5).map((p) => (
            <li
              key={p.cod_producto}
              onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(p.cod_producto)}`)}
              className="flex cursor-pointer items-center gap-2 py-1.5 hover:bg-surface-alt"
            >
              <AbcChip abc={p.abc} />
              <span className="flex-1 truncate text-xs text-text-primary">{p.nombre}</span>
              <span className="text-[0.65rem] text-text-muted shrink-0">
                {showValor
                  ? formatMoneyFull(p.valor_inventario)
                  : p.dias_stock != null && p.dias_stock >= 0
                    ? `${Math.round(p.dias_stock)}d`
                    : p.dias_sin_venta != null ? `${p.dias_sin_venta}d s/venta` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 py-3 text-center text-xs text-text-muted">Nada por acá. 👌</p>
      )}
      {list.total > 0 && (onPrimary || onSecondary) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          {onPrimary && primaryLabel && (
            <button
              type="button"
              onClick={onPrimary}
              className="text-xs font-semibold"
              style={{ color: accent }}
            >
              {primaryLabel} →
            </button>
          )}
          {onSecondary && secondaryLabel && (
            <button
              type="button"
              onClick={onSecondary}
              className="text-[0.65rem] text-text-muted hover:text-text-secondary underline underline-offset-2"
            >
              {secondaryLabel} ({list.total}) →
            </button>
          )}
        </div>
      )}
    </Card>
  );
}
