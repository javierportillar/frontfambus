import { describe, expect, it } from "vitest";
import { canAccessFeature, canAccessPath, resolvePathAccess } from "./access";

describe("module access", () => {
  const restricted = {
    role: "vendedor",
    enabledFeatures: ["ventas-summary", "analisis", "forecast"],
    allowedModules: ["analisis"],
  };

  it("maps direct dashboard URLs to their module", () => {
    expect(resolvePathAccess("/dashboards/movimientos")).toEqual({ feature: "ventas-summary" });
    expect(resolvePathAccess("/dashboards/compras/dia/2026-07-20")).toEqual({
      feature: "ventas-summary",
    });
    expect(resolvePathAccess("/dashboards/analisis")).toEqual({
      anyOfFeatures: ["analisis", "forecast"],
    });
    expect(resolvePathAccess("/admin/usuarios")).toEqual({ adminOnly: true });
    expect(resolvePathAccess("/catalogo")).toEqual({ tenantOnly: "masvital" });
  });

  it("blocks a direct restricted URL instead of relying on hidden navigation", () => {
    expect(canAccessPath("/dashboards/movimientos", restricted)).toBe(false);
    expect(canAccessPath("/dashboards/analisis", restricted)).toBe(true);
    expect(canAccessFeature("forecast", restricted)).toBe(false);
  });


  it("allows compras daily detail with the movimientos module", () => {
    expect(canAccessPath("/dashboards/compras/dia/2026-07-20", {
      role: "vendedor",
      enabledFeatures: ["ventas-summary"],
      allowedModules: ["ventas-summary"],
    })).toBe(true);
  });

  it("keeps tenant feature gates active for admins", () => {
    expect(canAccessFeature("forecast", {
      role: "admin",
      enabledFeatures: ["analisis"],
      allowedModules: null,
    })).toBe(false);
  });

  it("allows legacy unrestricted users only within enabled tenant features", () => {
    expect(canAccessFeature("analisis", {
      role: "gerente",
      enabledFeatures: ["analisis"],
      allowedModules: null,
    })).toBe(true);
  });

  it("allows the analysis route to forecast-only users", () => {
    expect(canAccessPath("/dashboards/analisis", {
      role: "vendedor",
      enabledFeatures: ["analisis", "forecast"],
      allowedModules: ["forecast"],
    })).toBe(true);
  });

  it("still blocks the analysis route when neither supported module is granted", () => {
    expect(canAccessPath("/dashboards/analisis", {
      role: "vendedor",
      enabledFeatures: ["analisis", "forecast"],
      allowedModules: ["inventario"],
    })).toBe(false);
  });

  it("keeps the catalog exclusive to MasVital on direct URLs", () => {
    expect(canAccessPath("/catalogo", {
      role: "admin",
      enabledFeatures: [],
      allowedModules: null,
      currentTenant: "masvital",
    })).toBe(true);

    expect(canAccessPath("/catalogo", {
      role: "admin",
      enabledFeatures: ["data-catalog"],
      allowedModules: null,
      currentTenant: "motoshop",
    })).toBe(false);
  });
});
