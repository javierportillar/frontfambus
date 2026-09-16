import { describe, expect, it } from "vitest";
import { displayContent, getStatusDescription, isAttachmentExpired } from "@/lib/api/chatView";
import { canAccessAssistantDomain, isSafeServerHref } from "@/lib/auth/access";

describe("chat drawer contract states", () => {
  it.each([["complete", "Respuesta disponible"], ["partial", "Respuesta parcial"], ["empty", "Sin resultados"], ["needs_clarification", "Necesita aclaración"], ["unavailable", "No disponible"]] as const)("labels %s distinctly", (status, label) => { expect(getStatusDescription(status).label).toBe(label); });
  it("expires reports and removes raw URL fallbacks", () => { expect(isAttachmentExpired("2026-01-01T00:00:00Z", Date.parse("2026-01-02T00:00:00Z"))).toBe(true); expect(isAttachmentExpired("2026-01-03T00:00:00Z", Date.parse("2026-01-02T00:00:00Z"))).toBe(false); expect(displayContent("Ver [reporte](https://example.test/report) y https://example.test/raw")).toBe("Ver reporte y"); });
  it("accepts only authorized server-relative links", () => { expect(isSafeServerHref("/inventario/productos/SKU-1")).toBe(true); expect(isSafeServerHref("https://evil.test/tenant-b")).toBe(false); expect(isSafeServerHref("javascript:alert(1)")).toBe(false); expect(canAccessAssistantDomain("sales", { role: "gerente", enabledFeatures: ["ventas-summary"], allowedModules: null })).toBe(true); expect(canAccessAssistantDomain("sales", { role: "gerente", enabledFeatures: ["ventas-summary"], allowedModules: ["inventario"] })).toBe(false); });
});
