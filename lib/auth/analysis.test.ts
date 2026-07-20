import { describe, expect, it } from "vitest";
import { allowedAnalysisTabs, resolveAnalysisTab } from "./analysis";

describe("analysis tab permissions", () => {
  const enabledFeatures = ["analisis", "forecast"];

  it("shows only Projection and selects it for a forecast-only user", () => {
    const allowed = allowedAnalysisTabs({
      role: "vendedor",
      enabledFeatures,
      allowedModules: ["forecast"],
    });

    expect(allowed).toEqual(["proyeccion"]);
    expect(resolveAnalysisTab(null, null, allowed)).toBe("proyeccion");
    expect(resolveAnalysisTab("balance", null, allowed)).toBe("proyeccion");
  });

  it("does not expose Projection to an analysis-only user", () => {
    const allowed = allowedAnalysisTabs({
      role: "vendedor",
      enabledFeatures,
      allowedModules: ["analisis"],
    });

    expect(allowed).toEqual(["balance", "productos", "proveedores", "horas", "gastos"]);
    expect(resolveAnalysisTab("proyeccion", null, allowed)).toBe("balance");
  });

  it.each([
    { role: "admin", allowedModules: [] as string[] },
    { role: "gerente", allowedModules: null },
  ])("keeps all enabled tabs for $role compatibility", ({ role, allowedModules }) => {
    expect(allowedAnalysisTabs({ role, enabledFeatures, allowedModules })).toEqual([
      "balance",
      "productos",
      "proveedores",
      "horas",
      "gastos",
      "proyeccion",
    ]);
  });
});
