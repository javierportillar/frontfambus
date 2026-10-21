import { describe, expect, it } from "vitest";
import {
  calculateArqueoTotal,
  calculateCartTotals,
  calculateCashBalance,
  calculateChange,
  calculateDifference,
  calculateLineValues,
} from "./calculations";
import type { CartItem, CashMovement } from "./types";

describe("lib/pos/calculations - sgHermes Mathematical Parity", () => {
  it("computes exact line values without tax and without discount", () => {
    // 2 units at $15.000 COP
    const line = calculateLineValues(15000, 2, 0, 0, 0);
    expect(line.valuni).toBe(15000);
    expect(line.candet).toBe(2);
    expect(line.dctpes).toBe(0);
    expect(line.ivapes).toBe(0);
    expect(line.ipopes).toBe(0);
    expect(line.totdet).toBe(30000);
  });

  it("applies discount before tax as defined in sgHermes formula", () => {
    // valuni = $10.000, discount = 10% -> dctpes = $1.000
    // base = $9.000, vat = 19% -> ivapes = $1.710
    // totdet = (10000 - 1000 + 1710) * 1 = 10710
    const line = calculateLineValues(10000, 1, 10, 19, 0);
    expect(line.dctpes).toBe(1000);
    expect(line.ivapes).toBe(1710);
    expect(line.ipopes).toBe(0);
    expect(line.totdet).toBe(10710);
  });

  it("handles impoconsumo (ipopes) accurately on base after discount", () => {
    // valuni = $20.000, discount = 5% -> dctpes = $1.000
    // base = $19.000, vat = 0, ipo = 8% -> ipopes = $1.520
    // totdet = (20000 - 1000 + 0 + 1520) * 2 = 20520 * 2 = 41040
    const line = calculateLineValues(20000, 2, 5, 0, 8);
    expect(line.dctpes).toBe(1000);
    expect(line.ivapes).toBe(0);
    expect(line.ipopes).toBe(1520);
    expect(line.totdet).toBe(41040);
  });

  it("verifies Factura 7322 arithmetic: sum of totdet matches header total exactly", () => {
    // Verification from Hermes blueprint:
    // Item 1: 2 units at 25.000 (total 50.000)
    // Item 2: 1 unit at 50.000 (total 50.000)
    // Total = 100.000
    const item1Line = calculateLineValues(25000, 2, 0, 0, 0);
    const item2Line = calculateLineValues(50000, 1, 0, 0, 0);

    const items: CartItem[] = [
      {
        id: "item-1",
        product: { sku: "SKU1", name: "Aceite Castrol", price: 25000 },
        candet: 2,
        valuni: 25000,
        discountPct: 0,
        dctpes: item1Line.dctpes,
        vatPct: 0,
        ivapes: item1Line.ivapes,
        ipoPct: 0,
        ipopes: item1Line.ipopes,
        totdet: item1Line.totdet,
      },
      {
        id: "item-2",
        product: { sku: "SKU2", name: "Pastillas freno", price: 50000 },
        candet: 1,
        valuni: 50000,
        discountPct: 0,
        dctpes: item2Line.dctpes,
        vatPct: 0,
        ivapes: item2Line.ivapes,
        ipoPct: 0,
        ipopes: item2Line.ipopes,
        totdet: item2Line.totdet,
      },
    ];

    const totals = calculateCartTotals(items);
    expect(totals.subtotal).toBe(100000);
    expect(totals.totalDiscount).toBe(0);
    expect(totals.totalVat).toBe(0);
    expect(totals.total).toBe(100000);
    expect(totals.itemCount).toBe(3);
    expect(totals.lineCount).toBe(2);
  });

  it("handles complex multi-item cart with mixed discounts and VAT", () => {
    const l1 = calculateLineValues(100000, 1, 10, 19, 0); // 100k - 10k + 17.1k = 107.1k
    const l2 = calculateLineValues(40000, 3, 0, 0, 0); // 120k exento
    const items: CartItem[] = [
      {
        id: "1",
        product: { sku: "P1", name: "Casco", price: 100000 },
        ...l1,
      },
      {
        id: "2",
        product: { sku: "P2", name: "Guantes", price: 40000 },
        ...l2,
      },
    ];

    const totals = calculateCartTotals(items);
    expect(totals.subtotal).toBe(220000); // 100.000 + 120.000
    expect(totals.totalDiscount).toBe(10000);
    expect(totals.netSubtotal).toBe(210000);
    expect(totals.totalVat).toBe(17100);
    expect(totals.total).toBe(227100);
    expect(totals.itemCount).toBe(4);
  });

  it("calculates arqueo total across Colombian denominations accurately", () => {
    const counts = {
      100000: 2, // 200.000
      50000: 3, // 150.000
      20000: 5, // 100.000
      10000: 10, // 100.000
      5000: 4, // 20.000
      2000: 5, // 10.000
      1000: 15, // 15.000
      500: 20, // 10.000
      200: 25, // 5.000
      100: 10, // 1.000
      50: 0,
    };

    const total = calculateArqueoTotal(counts);
    expect(total).toBe(611000);
  });

  it("calculates cash change and handles zero / underpayment gracefully", () => {
    expect(calculateChange(85000, 100000)).toBe(15000);
    expect(calculateChange(50000, 50000)).toBe(0);
    expect(calculateChange(60000, 50000)).toBe(0); // underpayment returns 0
  });

  it("calculates cash balance with movements and sales", () => {
    const movements: CashMovement[] = [
      {
        id: "m1",
        sessionId: "s1",
        type: "INGRESO",
        amount: 20000,
        reason: "Cambio sencillo",
        createdAt: "2026-10-21T08:00:00Z",
        cashier: "Carlos",
      },
      {
        id: "m2",
        sessionId: "s1",
        type: "EGRESO",
        amount: 15000,
        reason: "Almuerzo domicilio",
        createdAt: "2026-10-21T12:00:00Z",
        cashier: "Carlos",
      },
    ];

    const balance = calculateCashBalance(100000, movements, 250000);
    expect(balance.totalIngresos).toBe(20000);
    expect(balance.totalEgresos).toBe(15000);
    // 100.000 (base) + 250.000 (ventas) + 20.000 (ingresos) - 15.000 (egresos) = 355.000
    expect(balance.expectedCash).toBe(355000);

    const exactDiff = calculateDifference(355000, balance.expectedCash);
    expect(exactDiff.status).toBe("EXACT");
    expect(exactDiff.difference).toBe(0);

    const surplusDiff = calculateDifference(360000, balance.expectedCash);
    expect(surplusDiff.status).toBe("SURPLUS");
    expect(surplusDiff.difference).toBe(5000);

    const shortageDiff = calculateDifference(350000, balance.expectedCash);
    expect(shortageDiff.status).toBe("SHORTAGE");
    expect(shortageDiff.difference).toBe(-5000);
  });
});
