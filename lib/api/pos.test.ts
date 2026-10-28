import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitSale } from "@/lib/api/pos";
import { fetchWithFailover } from "@/lib/api/backendFailover";
import type { SalePayload } from "@/lib/pos/types";

vi.mock("@/lib/api/backendFailover", () => ({ fetchWithFailover: vi.fn() }));
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
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  } as unknown as Response;
}

beforeEach(() => {
  vi.mocked(fetchWithFailover).mockReset();
  Object.defineProperty(globalThis.navigator, "onLine", {
    configurable: true,
    value: true,
  });
});

describe("submitSale · rechazo del servidor", () => {
  it("un 422 se muestra como error y NO se encola", async () => {
    vi.mocked(fetchWithFailover).mockResolvedValue({
      resp: respuesta(422, {
        detail: {
          message: "Datos no válidos",
          fields: { nitter: "El tercero no existe" },
        },
      }),
      node: "masvital",
    } as never);

    const result = await submitSale(VENTA);

    expect(result.success).toBe(false);
    expect(result.offline).toBe(false);
    expect(result.error).toContain("El tercero no existe");
    expect(result.sale.status).toBe("PENDING_SYNC");
  });

  it("un 503 del ERP se encola para reintentar (no es culpa de la venta)", async () => {
    vi.mocked(fetchWithFailover).mockResolvedValue({
      resp: respuesta(503, {
        detail: { message: "El ERP no pudo guardar", code: "erp_save_failed" },
      }),
      node: "masvital",
    } as never);

    const result = await submitSale(VENTA);

    expect(result.success).toBe(true);
    expect(result.offline).toBe(true);
  });

  it("una caída de red se encola", async () => {
    vi.mocked(fetchWithFailover).mockRejectedValue(new Error("sin red"));

    const result = await submitSale(VENTA);

    expect(result.success).toBe(true);
    expect(result.offline).toBe(true);
  });

  it("un 201 registra la venta como completada", async () => {
    vi.mocked(fetchWithFailover).mockResolvedValue({
      resp: respuesta(201, { success: true, numfven: 1, prefven: "POS" }),
      node: "masvital",
    } as never);

    const result = await submitSale(VENTA);

    expect(result.success).toBe(true);
    expect(result.offline).toBe(false);
    expect(result.sale.status).toBe("COMPLETED");
  });
});
