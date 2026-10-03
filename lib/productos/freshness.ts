import type { ProductDataFreshness } from "@/lib/api/hooks";

export function productFreshnessLabel(
  freshness: ProductDataFreshness,
  windowDays: number,
): string {
  const salesCutoff = freshness.sales_cutoff ?? "sin corte";

  if (freshness.stock_source === "catalog_snapshot") {
    return `Ventana ${windowDays} días · ventas al ${salesCutoff} · inventario del snapshot ${freshness.inventory_snapshot ?? "sin snapshot"}`;
  }

  return `Ventana ${windowDays} días · stock estimado: compras hasta ${freshness.purchase_cutoff ?? "sin corte"} menos ventas hasta ${salesCutoff}`;
}
