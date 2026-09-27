import { describe, expect, it } from "vitest";
import {
  PURCHASES_DAY_METRICS_OPTIONS,
  buildComprasProveedorPerfilUrl,
  resolveMetricsKeepPreviousData,
} from "./hooks";

describe("metrics previous-data policy", () => {
  it("keeps previous data by default for existing metrics views", () => {
    expect(resolveMetricsKeepPreviousData()).toBe(true);
  });

  it("opts the grouped purchases-day hook out of previous data", () => {
    expect(PURCHASES_DAY_METRICS_OPTIONS.keepPreviousData).toBe(false);
    expect(resolveMetricsKeepPreviousData(PURCHASES_DAY_METRICS_OPTIONS)).toBe(
      false,
    );
  });

  it("builds the bounded supplier profile endpoint query in contract order", () => {
    expect(buildComprasProveedorPerfilUrl(
      "1116274616",
      "2025-09-27",
      "2026-09-27",
      1,
      20,
    )).toBe(
      "/api/metrics/compras-proveedor-perfil?nit_proveedor=1116274616&fecha_inicio=2025-09-27&fecha_fin=2026-09-27&page=1&page_size=20",
    );
  });
});
