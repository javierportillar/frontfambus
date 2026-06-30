"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useInventarioOverview, type InventarioItem } from "@/lib/api/hooks";
import { formatMoneyFull } from "@/lib/format/currency";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/Stat";
import { Skeleton } from "@/components/ui/Skeleton";

type Grupo = "liquidar" | "sobrestock" | "zombie";

export function OptimizarTab(): JSX.Element {
  const { data, isLoading } = useInventarioOverview();
  const [grupo, setGrupo] = useState<Grupo>("liquidar");
  const [filter, setFilter] = useState("");

  const grupos = useMemo(() => {
    if (!data) return null;
    const liquidar = data.items.filter((i) => i.accion === "liquidar");
    const sobrestock = data.items.filter((i) => i.accion === "sobrestock");
    const zombie = data.items.filter((i) => i.accion === "zombie_con_stock");
    return { liquidar, sobrestock, zombie };
  }, [data]);

  const matchesFilter = (it: InventarioItem) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return it.nom_producto.toLowerCase().includes(q) || it.cod_producto.toLowerCase().includes(q);
  };

  if (isLoading && !data) return <Card><Skeleton className="h-96 rounded-lg" /></Card>;
  if (!data || !grupos) return <Card><p className="py-8 text-center text-sm text-text-muted">Sin datos.</p></Card>;

  const totalCapitalLiquidar = grupos.liquidar.reduce((s, i) => s + i.capital_inmovilizado, 0);
  const totalCapitalSobre = grupos.sobrestock.reduce((s, i) => s + i.capital_inmovilizado, 0);
  const totalCapitalZombie = grupos.zombie.reduce((s, i) => s + i.capital_inmovilizado, 0);

  const grupoData = grupos[grupo];
  const visible = grupoData.filter(matchesFilter).sort((a, b) => b.capital_inmovilizado - a.capital_inmovilizado);

  const meta = {
    liquidar: {
      title: "🧹 Liquidar — vendía pero ya no",
      desc: "Productos con stock que vendían en su momento pero NO en los últimos 90 días. Acción: ofrecer descuento agresivo, promoción cruzada, devolver al proveedor.",
      color: "#C2410C",
    },
    sobrestock: {
      title: "📦 Sobrestock — más de 6 meses de cobertura",
      desc: "Productos con stock para más de 180 días al ritmo actual. Capital atrapado innecesariamente. Acción: reducir próxima compra, ofrecer combo/promoción.",
      color: "#9333EA",
    },
    zombie: {
      title: "💀 Zombie con stock — nunca vendieron",
      desc: "Productos en el catálogo que tienen stock pero NUNCA se vendieron desde que entraron. Acción: liquidación agresiva, devolución al proveedor, descatalogación.",
      color: "#6B7280",
    },
  }[grupo];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-surface-alt/40 px-4 py-3 text-sm">
        <p className="text-text-secondary">
          Decisión: <strong>¿qué saco del inventario para liberar plata?</strong> Acá vive lo que no rota
          y está atrapando capital. Cada bucket sugiere una acción distinta.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card>
          <Stat
            label="Capital en liquidar"
            value={formatMoneyFull(totalCapitalLiquidar)}
            subtitle={`${grupos.liquidar.length} productos`}
          />
        </Card>
        <Card>
          <Stat
            label="Capital en sobrestock"
            value={formatMoneyFull(totalCapitalSobre)}
            subtitle={`${grupos.sobrestock.length} productos`}
          />
        </Card>
        <Card>
          <Stat
            label="Capital en zombie"
            value={formatMoneyFull(totalCapitalZombie)}
            subtitle={`${grupos.zombie.length} productos nunca vendidos`}
          />
        </Card>
      </div>

      {/* Selector de grupo */}
      <div className="flex flex-wrap gap-2">
        {(["liquidar", "sobrestock", "zombie"] as Grupo[]).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGrupo(g)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              grupo === g ? "bg-surface-dark text-text-inverse" : "bg-surface-alt text-text-secondary hover:bg-surface-alt/70"
            }`}
          >
            {g === "liquidar" ? "Liquidar" : g === "sobrestock" ? "Sobrestock" : "Zombie con stock"}{" "}
            <span className="opacity-60">({grupos[g].length})</span>
          </button>
        ))}
      </div>

      <Card header={
        <div>
          <h2 className="font-semibold" style={{ color: meta.color }}>{meta.title}</h2>
          <p className="mt-1 text-xs text-text-muted">{meta.desc}</p>
        </div>
      }>
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar SKU o nombre..."
          className="mb-3 block w-full max-w-md rounded-lg border border-border bg-surface px-3 py-1.5 text-sm"
        />
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-secondary">
            {filter ? "Sin resultados para el filtro." : "🎉 No hay productos en este grupo."}
          </p>
        ) : (
          <OptimizarTable items={visible} grupo={grupo} />
        )}
      </Card>
    </div>
  );
}

function OptimizarTable({ items, grupo }: { items: InventarioItem[]; grupo: Grupo }): JSX.Element {
  const router = useRouter();
  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt text-left text-[0.7rem] uppercase tracking-wide text-text-muted">
              <th className="py-2 px-3">Producto</th>
              <th className="py-2 px-3">ABC</th>
              <th className="py-2 px-3 text-right">Stock</th>
              <th className="py-2 px-3 text-right">Costo unit.</th>
              <th className="py-2 px-3 text-right">Capital atrapado</th>
              {grupo !== "zombie" && <th className="py-2 px-3 text-right">Días sin venta</th>}
              {grupo === "sobrestock" && <th className="py-2 px-3 text-right">Cobertura</th>}
              {grupo === "zombie" && <th className="py-2 px-3">Última compra</th>}
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 100).map((it) => (
              <tr
                key={it.cod_producto}
                className="border-b border-border/60 hover:bg-surface-alt cursor-pointer"
                onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(it.cod_producto)}`)}
              >
                <td className="py-2 px-3">
                  <div className="text-text-primary font-medium">{it.nom_producto}</div>
                  <div className="text-[0.65rem] text-text-muted">{it.cod_producto}</div>
                </td>
                <td className="py-2 px-3 text-xs text-text-muted">{it.abc ?? "—"}</td>
                <td className="py-2 px-3 text-right tabular-nums">
                  {it.stock.toLocaleString("es-CO", { maximumFractionDigits: 2 })}{" "}
                  <span className="text-xs text-text-muted">{it.unidad_medida}</span>
                </td>
                <td className="py-2 px-3 text-right tabular-nums text-text-muted">
                  {formatMoneyFull(it.costo_unit)}
                </td>
                <td className="py-2 px-3 text-right tabular-nums font-semibold text-red-700">
                  {formatMoneyFull(it.capital_inmovilizado)}
                </td>
                {grupo !== "zombie" && (
                  <td className="py-2 px-3 text-right tabular-nums">
                    {it.dias_desde_venta != null ? `${it.dias_desde_venta}d` : "—"}
                  </td>
                )}
                {grupo === "sobrestock" && (
                  <td className="py-2 px-3 text-right tabular-nums">{it.cobertura_dias ?? "—"}d</td>
                )}
                {grupo === "zombie" && (
                  <td className="py-2 px-3 text-text-muted text-xs">{it.ultima_compra ?? "—"}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {items.length > 100 && (
          <p className="border-t border-border bg-surface-alt/40 px-3 py-2 text-center text-xs text-text-muted">
            Mostrando 100 de {items.length}. Refiná con el buscador o trabajalos por lotes.
          </p>
        )}
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-2">
        {items.slice(0, 50).map((it) => (
          <button
            key={it.cod_producto}
            type="button"
            onClick={() => router.push(`/dashboards/productos/${encodeURIComponent(it.cod_producto)}`)}
            className="block w-full rounded-lg border border-border bg-surface px-3 py-2 text-left"
          >
            <div className="text-sm font-medium text-text-primary truncate">{it.nom_producto}</div>
            <div className="text-[0.65rem] text-text-muted">{it.cod_producto} · ABC: {it.abc ?? "—"}</div>
            <div className="mt-1.5 grid grid-cols-2 gap-1 text-xs">
              <span>Stock: <strong>{it.stock} {it.unidad_medida}</strong></span>
              <span className="text-red-700">Capital: <strong>{formatMoneyFull(it.capital_inmovilizado)}</strong></span>
              {grupo !== "zombie" && it.dias_desde_venta != null && (
                <span className="col-span-2 text-text-muted">{it.dias_desde_venta}d sin venta</span>
              )}
            </div>
          </button>
        ))}
        {items.length > 50 && (
          <p className="text-center text-xs text-text-muted">Mostrando 50 de {items.length}</p>
        )}
      </div>
    </>
  );
}
