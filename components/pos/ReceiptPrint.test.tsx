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

  it("diseña el tiquete como SgHermes: logo 40x15, nombre a 13 y sin DIAN", () => {
    render(<ReceiptPrint sale={baseSale} />);

    const logo = screen.getByAltText(/MOTOSHOP/i) as HTMLImageElement;
    expect(logo.style.width).toBe("40mm");
    expect(logo.style.height).toBe("15mm");

    const nombre = screen.getByText(/MOTOSHOP REPUESTOS/i);
    expect(nombre.style.fontSize).toBe("13px");

    // El negocio no es responsable de IVA: no se imprime resolución ni CUFE.
    expect(screen.queryByText(/Resolución DIAN/i)).toBeNull();
    expect(screen.queryByText(/CUFE/i)).toBeNull();
    expect(screen.queryByText(/Documento Equivalente Electrónico/i)).toBeNull();
  });

  it("imprime las columnas adicionales con cero decimales", () => {
    render(<ReceiptPrint sale={baseSale} />);

    expect(screen.getByText("Código")).toBeInTheDocument();
    expect(screen.getByText("V/Unit")).toBeInTheDocument();
    expect(screen.getByText("Imp")).toBeInTheDocument();
    expect(screen.getByText("OIL-1")).toBeInTheDocument();
    // 33320 con la configuración de SgHermes (0 decimales) es "33.320".
    expect(screen.getAllByText("33.320").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/33\.320,00/)).toBeNull();
  });

  it("numera el documento con las 4 cifras configuradas", () => {
    render(<ReceiptPrint sale={{ ...baseSale, documentNumber: "FVP7" }} />);
    expect(screen.getByText("FVP0007")).toBeInTheDocument();
  });

  it("cierra el pie con 'Impreso por' a 6", () => {
    render(<ReceiptPrint sale={baseSale} />);
    const pie = screen.getByText(/Impreso por/);
    expect(pie.style.fontSize).toBe("6px");
    expect(pie.textContent).toContain("Cajero Test");
  });
});
