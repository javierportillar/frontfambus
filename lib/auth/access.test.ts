import { describe, expect, it } from "vitest";
import {
  canAccessAssistantDomain,
  canAccessFeature,
  canAccessPath,
  isSafeAssistantEntityHref,
  resolvePathAccess,
} from "./access";

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
    expect(resolvePathAccess("/chat")).toEqual({ feature: "chat-ia" });
  });

  it("blocks a direct restricted URL instead of relying on hidden navigation", () => {
    expect(canAccessPath("/dashboards/movimientos", restricted)).toBe(false);
    expect(canAccessPath("/dashboards/analisis", restricted)).toBe(true);
    expect(canAccessFeature("forecast", restricted)).toBe(false);
  });

  it("gates the assistant by the tenant chat feature", () => {
    expect(canAccessPath("/chat", { role: "gerente", enabledFeatures: ["chat-ia"], allowedModules: null })).toBe(true);
    expect(canAccessPath("/chat", { role: "gerente", enabledFeatures: [], allowedModules: null })).toBe(false);
  });

  it("gates purchase entity references with the existing ventas-summary module", () => {
    expect(canAccessAssistantDomain("purchases", {
      role: "admin",
      enabledFeatures: ["ventas-summary"],
      allowedModules: null,
    })).toBe(true);
    expect(canAccessAssistantDomain("purchases", {
      role: "analista",
      enabledFeatures: ["analisis"],
      allowedModules: ["analisis"],
    })).toBe(false);
  });

  it("allows only the server route template for product and alert entity links", () => {
    expect(isSafeAssistantEntityHref("product", "SKU/1", "inventory", "/dashboards/productos/SKU%2F1")).toBe(true);
    expect(isSafeAssistantEntityHref("product", "SKU-1", "sales", "/dashboards/productos/SKU-1")).toBe(false);
    expect(isSafeAssistantEntityHref("product", "SKU-1", "inventory", "/inventario/productos/SKU-1")).toBe(false);
    expect(isSafeAssistantEntityHref("product", "SKU-1", "inventory", "https://evil.test/SKU-1")).toBe(false);
    expect(isSafeAssistantEntityHref("alert", "SKU-1", "alerts", "/inventario/alertas/SKU-1")).toBe(true);
  });

  it("allows only exact tenant-scoped purchase document and supplier routes", () => {
    expect(isSafeAssistantEntityHref(
      "purchase_document",
      "2026-07-20|FC|00123",
      "purchases",
      "/dashboards/compras/dia/2026-07-20/documento/00123?cod_clase=FC",
    )).toBe(true);
    expect(isSafeAssistantEntityHref(
      "supplier",
      "1116274616",
      "purchases",
      "/dashboards/compras/proveedores/1116274616",
    )).toBe(true);
    expect(isSafeAssistantEntityHref(
      "purchase_document",
      "2026-07-20|F/C|INV/123",
      "purchases",
      "/dashboards/compras/dia/2026-07-20/documento/INV%2F123?cod_clase=F%2FC",
    )).toBe(true);

    expect(isSafeAssistantEntityHref(
      "purchase_document",
      "2026-02-30|FC|00123",
      "purchases",
      "/dashboards/compras/dia/2026-02-30/documento/00123?cod_clase=FC",
    )).toBe(false);
    expect(isSafeAssistantEntityHref(
      "purchase_document",
      "2026-07-20|FC|00123",
      "purchases",
      "/dashboards/compras/dia/2026-07-20/documento/00123?cod_clase=OTHER",
    )).toBe(false);
    expect(isSafeAssistantEntityHref(
      "purchase_document",
      "2026-07-20|FC|00123|OTHER",
      "purchases",
      "/dashboards/compras/dia/2026-07-20/documento/00123?cod_clase=FC",
    )).toBe(false);
    expect(isSafeAssistantEntityHref(
      "purchase_document",
      "2026-07-20|FC|..",
      "purchases",
      "/dashboards/compras/dia/2026-07-20/documento/..?cod_clase=FC",
    )).toBe(false);
    expect(isSafeAssistantEntityHref(
      "supplier",
      "1116274616",
      "purchases",
      "/dashboards/compras/proveedores/1116274616?tenant=other",
    )).toBe(false);
    expect(isSafeAssistantEntityHref(
      "supplier",
      "not-a-nit",
      "purchases",
      "/dashboards/compras/proveedores/not-a-nit",
    )).toBe(false);
    expect(isSafeAssistantEntityHref(
      "supplier",
      "1116274616",
      "sales",
      "/dashboards/compras/proveedores/1116274616",
    )).toBe(false);
  });


  it("allows compras daily detail with the movimientos module", () => {
    expect(canAccessPath("/dashboards/compras/dia/2026-07-20", {
      role: "vendedor",
      enabledFeatures: ["ventas-summary"],
      allowedModules: ["ventas-summary"],
    })).toBe(true);
    expect(canAccessPath("/dashboards/compras/proveedores/1116274616", {
      role: "vendedor",
      enabledFeatures: ["ventas-summary"],
      allowedModules: ["ventas-summary"],
    })).toBe(true);
    expect(canAccessPath("/dashboards/compras/proveedores/1116274616", {
      role: "vendedor",
      enabledFeatures: ["ventas-summary"],
      allowedModules: ["analisis"],
    })).toBe(false);
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
