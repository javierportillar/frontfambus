import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ReceiptPrint } from "./ReceiptPrint";
import type { SalePayload } from "@/lib/pos/types";

describe("ReceiptPrint DIAN integration", () => {
  const baseSale: SalePayload = {
    id: "sale-uuid-1",
    documentType: "POS_TICKET",
    documentNumber: "POS-2026-000001",
    customer: {
      id: "cf",
      name: "Consumidor Final",
      nit: "222222222222",
    },
    items: [
      {
        id: "item-1",
        product: {
          sku: "OIL-1",
          name: "Aceite Castrol 20W50",
          price: 28000,
        },
        candet: 1,
        valuni: 28000,
        discountPct: 0,
        dctpes: 0,
        vatPct: 19,
        ivapes: 5320,
        ipoPct: 0,
        ipopes: 0,
        totdet: 33320,
      },
    ],
    totals: {
      subtotal: 28000,
      totalDiscount: 0,
      netSubtotal: 28000,
      totalVat: 5320,
      totalIpo: 0,
      total: 33320,
      itemCount: 1,
      lineCount: 1,
    },
    payments: [{ id: "p1", method: "EFECTIVO", amount: 33320 }],
    cashReceived: 40000,
    changeGiven: 6680,
    cashier: "Cajero Test",
    tenant: "motoshop",
    createdAt: "2026-10-21T10:00:00Z",
    status: "COMPLETED",
  };

  it("renders DIAN resolution and range in receipt header", () => {
    render(<ReceiptPrint sale={baseSale} />);

    expect(
      screen.getByText("Resolución DIAN No. 18760000001 de 2026-01-15"),
    ).toBeDefined();
    expect(
      screen.getByText("Rango autoriz: POS-000001 a POS-999999"),
    ).toBeDefined();
  });

  it("renders CUFE and verification link when CUFE is provided via prop", () => {
    const testCufe = "abc123cufe96characterslongsha384digestexamplecontent";
    render(<ReceiptPrint sale={baseSale} cufe={testCufe} />);

    expect(screen.getByText(`CUFE: ${testCufe}`)).toBeDefined();
    expect(
      screen.getByText("Consulte su documento en: catalogo-vpfe.dian.gov.co"),
    ).toBeDefined();
  });

  it("renders placeholder when CUFE is not yet emitted", () => {
    render(<ReceiptPrint sale={baseSale} />);

    expect(screen.getByText("CUFE: En trámite de transmisión DIAN")).toBeDefined();
  });
});
