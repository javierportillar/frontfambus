import { describe, expect, it } from "vitest";
import { canTenantAccessPath } from "./access";

describe("tenant-only routes", () => {
  it("allows MasVital to open the catalog and nested catalog paths", () => {
    expect(canTenantAccessPath("/catalogo", "masvital")).toBe(true);
    expect(canTenantAccessPath("/catalogo/producto/KAR0028", "masvital")).toBe(
      true,
    );
  });

  it("blocks MotoShop from the catalog without changing shared routes", () => {
    expect(canTenantAccessPath("/catalogo", "motoshop")).toBe(false);
    expect(canTenantAccessPath("/catalogo/producto/KAR0028", "motoshop")).toBe(
      false,
    );
    expect(canTenantAccessPath("/dashboards/inventario", "motoshop")).toBe(
      true,
    );
  });
});
