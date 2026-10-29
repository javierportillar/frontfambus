import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitSale } from "@/lib/api/pos";
import { apiFetch } from "@/lib/api/client";
import type { SalePayload } from "@/lib/pos/types";

vi.mock("@/lib/api/client", () => ({ apiFetch: vi.fn(), apiFetchJson: vi.fn() }));
vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => undefined),
  del: vi.fn(async () => undefined),
  keys: vi.fn(async () => []),
}));

const VENTA = {
  id: "3f1b9a86-2c1e-4f0e-9a4c-8c1f0f2a9b11",
  tenant: "masvital",
  documentNumber: "",
  documentType: "FACTURA_VENTA",
  customer: { id: "222222222222", nit: "222222222222", name: "Consumidor Final" },
  items: [
    {
      id: "l1",
      product: { sku: "SOFIA0015", name: "CHICHARRON", price: 6700, unit: "UND" },
      quantity: 1,
      unitPrice: 6700,
      discount: 0,
      total: 6700,
    },
  ],
  payments: [{ method: "EFECTIVO", amount: 6700 }],
  totals: { subtotal: 6700, discount: 0, tax: 0, total: 6700 },
  cashier: "javier",
  status: "COMPLETED",
  offline: false,
  createdAt: "2026-10-27T21:00:00.000Z",
} as unknown as SalePayload;

function respuesta(status: number, cuerpo: unknown): Response {
  const texto = JSON.stringify(cuerpo);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(texto),
    text: async () => texto,
  } as unknown as Response;
}

beforeEach(() => {
  vi.mocked(apiFetch).mockReset();
  Object.defineProperty(globalThis.navigator, "onLine", {
    configurable: true,
    value: true,
  });
});

describe("submitSale · rechazo del servidor", () => {
  it("un 422 se muestra como error y NO se encola", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      respuesta(422, {
        detail: {
          message: "Datos no válidos",
          fields: { nitter: "El tercero no existe" },
        },
      }),
    );

    const result = await submitSale(VENTA);

    expect(result.success).toBe(false);
    expect(result.offline).toBe(false);
    expect(result.error).toContain("El tercero no existe");
    expect(result.sale.status).toBe("PENDING_SYNC");
  });

  it("un 503 del ERP se encola para reintentar (no es culpa de la venta)", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      respuesta(503, {
        detail: { message: "El ERP no pudo guardar", code: "erp_save_failed" },
      }),
    );

    const result = await submitSale(VENTA);

    expect(result.success).toBe(true);
    expect(result.offline).toBe(true);
  });

  it("una caída de red se encola", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("sin red"));

    const result = await submitSale(VENTA);

    expect(result.success).toBe(true);
    expect(result.offline).toBe(true);
  });

  it("un 201 registra la venta como completada", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      respuesta(201, { success: true, numfven: 1, prefven: "POS" }),
    );

    const result = await submitSale(VENTA);

    expect(result.success).toBe(true);
    expect(result.offline).toBe(false);
    expect(result.sale.status).toBe("COMPLETED");
  });

  it("manda la clave de idempotencia con el nombre que el proxy reenvía", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      respuesta(201, { success: true, numfven: 1, prefven: "POS" }),
    );

    await submitSale(VENTA);

    const [, init] = vi.mocked(apiFetch).mock.calls[0] ?? [];
    const headers = new Headers((init as RequestInit)?.headers as HeadersInit);
    // `X-Idempotency-Key` NO es lo mismo que `Idempotency-Key`: el proxy sólo
    // reenvía el segundo, y sin clave un reintento duplica la venta.
    expect(headers.get("Idempotency-Key")).toBe(VENTA.id);
    expect(headers.get("X-Idempotency-Key")).toBeNull();
  });

  it("pega al proxy same-origin, no directo al backend", async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      respuesta(201, { success: true, numfven: 1, prefven: "POS" }),
    );

    await submitSale(VENTA);

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/pos/sales",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
