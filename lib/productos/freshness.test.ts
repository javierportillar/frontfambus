import { describe, expect, it } from "vitest";
import type { ProductDataFreshness } from "@/lib/api/hooks";
import { productFreshnessLabel } from "./freshness";

const freshness = (stock_source: ProductDataFreshness["stock_source"]): ProductDataFreshness => ({
  sales_cutoff: "2026-10-02",
  purchase_cutoff: "2026-09-29",
  inventory_snapshot: "2026-10-02",
  snapshot_generation: 4,
  stock_source,
});

describe("product data freshness labels", () => {
  it("distinguishes catalog snapshot stock from an estimated stock balance", () => {
    expect(productFreshnessLabel(freshness("catalog_snapshot"), 180)).toBe(
      "Ventana 180 días · ventas al 2026-10-02 · inventario del snapshot 2026-10-02",
    );
    expect(productFreshnessLabel(freshness("purchases_minus_sales_estimate"), 180)).toBe(
      "Ventana 180 días · stock estimado: compras hasta 2026-09-29 menos ventas hasta 2026-10-02",
    );
  });

  it("labels missing source cutoffs instead of implying they are current", () => {
    expect(productFreshnessLabel({
      ...freshness("purchases_minus_sales_estimate"),
      purchase_cutoff: null,
      sales_cutoff: null,
    }, 90)).toContain("compras hasta sin corte menos ventas hasta sin corte");
  });
});
