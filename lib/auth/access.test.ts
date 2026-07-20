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
    expect(resolvePathAccess("/dashboards/analisis")).toEqual({
      anyOfFeatures: ["analisis", "forecast"],
    });
    expect(resolvePathAccess("/admin/usuarios")).toEqual({ adminOnly: true });
  });

  it("blocks a direct restricted URL instead of relying on hidden navigation", () => {
    expect(canAccessPath("/dashboards/movimientos", restricted)).toBe(false);
    expect(canAccessPath("/dashboards/analisis", restricted)).toBe(true);
    expect(canAccessFeature("forecast", restricted)).toBe(false);
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
});
