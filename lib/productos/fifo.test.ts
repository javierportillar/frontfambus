import { describe, expect, it } from "vitest";
import type { ProductMovimiento } from "@/lib/api/hooks";
import { calculateFifoFromMovements } from "./fifo";

const purchase = (num_documento: string, fecha: string, cantidad: number): ProductMovimiento => ({
  fecha,
  tipo: "compra",
  cantidad,
  valor: cantidad * 10,
  num_documento,
  cod_clase: "FC",
});

const sale = (num_documento: string, fecha: string, cantidad: number): ProductMovimiento => ({
  fecha,
  tipo: "venta",
  cantidad,
  valor: cantidad * 20,
  num_documento,
  cod_clase: "FV",
});

describe("estimated FIFO lot allocation", () => {
  it("reconciles a complete receipt and sale history without reallocating stock", () => {
    const result = calculateFifoFromMovements(
      [purchase("P-1", "2026-09-08", 10)],
      [sale("S-1", "2026-10-01", 5)],
      5,
    );

    expect(result.reconciled).toBe(true);
    expect(result.movementBalance).toBe(5);
    expect(result.discrepancy).toBe(0);
    expect(result.lots).toEqual([{
      index: 0,
      vendidas: 5,
      enStock: 5,
      primeraVenta: "2026-10-01",
      ultimaVenta: "2026-10-01",
    }]);
  });

  it("does not fabricate a lot balance when movement totals disagree with the snapshot", () => {
    const result = calculateFifoFromMovements(
      [purchase("P-1", "2026-09-08", 10)],
      [sale("S-1", "2026-10-01", 5)],
      7,
    );

    expect(result.reconciled).toBe(false);
    expect(result.movementBalance).toBe(5);
    expect(result.discrepancy).toBe(2);
    expect(result.lots[0]?.enStock).toBe(5);
  });

  it("reports sales that cannot be allocated to any visible receipt", () => {
    const result = calculateFifoFromMovements(
      [purchase("P-1", "2026-09-08", 3)],
      [sale("S-1", "2026-09-07", 5)],
      0,
    );

    expect(result.reconciled).toBe(false);
    expect(result.unmatchedSales).toBe(5);
    expect(result.lots[0]?.enStock).toBe(3);
  });
});
