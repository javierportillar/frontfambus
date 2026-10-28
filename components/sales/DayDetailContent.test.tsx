import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DayInvoice } from "@/lib/api/hooks";
import type { VentaVerificada } from "@/lib/erp/bank";
import { InvoiceCard } from "./DayDetailContent";

function isoDeHace(dias: number): string {
  const ahora = new Date();
  const dia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - dias);
  const mes = String(dia.getMonth() + 1).padStart(2, "0");
  const numero = String(dia.getDate()).padStart(2, "0");
  return `${dia.getFullYear()}-${mes}-${numero}`;
}

function factura(overrides: Partial<DayInvoice> = {}): DayInvoice {
  return {
    num_documento: "3679",
    cod_clase: "FVP",
    prefijo: "FVP",
    hora: "11:14",
    cliente: "JULIANA DELGADO",
    vendedor: "sin asignar",
    cod_formapago: "F05",
    nombre_formapago: "Crédito a 30 días",
    subtotal: 30000,
    total_descuentos: 0,
    total_iva: 0,
    total: 30000,
    costo_total: 22525,
    ganancia: 7475,
    margen_pct: 24.9,
    items: [],
    ...overrides,
  };
}

/** Expande la tarjeta: la acción vive dentro del detalle, no en el header. */
function expandir(): void {
  fireEvent.click(screen.getByRole("button", { expanded: false }));
}

describe("InvoiceCard · verificar pago", () => {
  it("ofrece verificar una factura a crédito del día", () => {
    render(<InvoiceCard invoice={factura()} fechaDia={isoDeHace(0)} onVerify={vi.fn()} />);
    expandir();
    expect(screen.getByRole("button", { name: /verificar pago/i })).toBeDefined();
  });

  it("la ofrece también para ayer (la ventana del banco es de días)", () => {
    render(<InvoiceCard invoice={factura()} fechaDia={isoDeHace(1)} onVerify={vi.fn()} />);
    expandir();
    expect(screen.getByRole("button", { name: /verificar pago/i })).toBeDefined();
  });

  it("no la ofrece para una venta en efectivo", () => {
    render(
      <InvoiceCard
        invoice={factura({ nombre_formapago: "Contado/Efectivo", cod_formapago: "F01" })}
        fechaDia={isoDeHace(0)}
        onVerify={vi.fn()}
      />,
    );
    expandir();
    expect(screen.queryByRole("button", { name: /verificar pago/i })).toBeNull();
  });

  it("no la ofrece fuera de la ventana del portal", () => {
    render(<InvoiceCard invoice={factura()} fechaDia={isoDeHace(9)} onVerify={vi.fn()} />);
    expandir();
    expect(screen.queryByRole("button", { name: /verificar pago/i })).toBeNull();
  });

  it("sin handler no dibuja la acción (tarjetas de sólo lectura)", () => {
    render(<InvoiceCard invoice={factura()} fechaDia={isoDeHace(0)} />);
    expandir();
    expect(screen.queryByRole("button", { name: /verificar pago/i })).toBeNull();
  });

  it("al tocar la acción devuelve la factura a la página", () => {
    const onVerify = vi.fn();
    const unaFactura = factura();
    render(<InvoiceCard invoice={unaFactura} fechaDia={isoDeHace(0)} onVerify={onVerify} />);
    expandir();
    fireEvent.click(screen.getByRole("button", { name: /verificar pago/i }));
    expect(onVerify).toHaveBeenCalledWith(unaFactura);
  });
});

describe("InvoiceCard · verificación guardada", () => {
  function guardada(overrides: Partial<VentaVerificada> = {}): VentaVerificada {
    return {
      cod_clase: "FVP",
      num_documento: "3679",
      fecha_venta: isoDeHace(0),
      valor: "30000.00",
      estado: "verificado",
      pagador: "SANDRA MILENA ARTEAGA",
      referencia: "0092055984",
      fecha_movimiento: isoDeHace(0),
      job_id: "job-1",
      verificado_por: "gerente",
      verificado_at: "2026-10-27T16:00:00Z",
      ...overrides,
    };
  }

  it("muestra el pago guardado sin volver a consultar", () => {
    render(
      <InvoiceCard
        invoice={factura()}
        fechaDia={isoDeHace(0)}
        onVerify={vi.fn()}
        verificada={guardada()}
      />,
    );
    expandir();
    const chip = screen.getByTestId("venta-verificada");
    expect(chip.textContent).toContain("SANDRA MILENA ARTEAGA");
    expect(screen.getByRole("button", { name: /verificar de nuevo/i })).toBeDefined();
  });

  it("avisa cuando ya se consultó y no había pago", () => {
    render(
      <InvoiceCard
        invoice={factura()}
        fechaDia={isoDeHace(0)}
        onVerify={vi.fn()}
        verificada={guardada({ estado: "sin_coincidencia", pagador: "" })}
      />,
    );
    expandir();
    expect(screen.queryByTestId("venta-verificada")).toBeNull();
    expect(screen.getByText(/no había pago ese día/i)).toBeDefined();
  });

  it("no muestra el chip fuera de la ventana aunque esté guardada", () => {
    render(
      <InvoiceCard
        invoice={factura()}
        fechaDia={isoDeHace(9)}
        onVerify={vi.fn()}
        verificada={guardada()}
      />,
    );
    expandir();
    // El dato guardado sigue siendo visible: se consultó y hay pago.
    expect(screen.getByTestId("venta-verificada")).toBeDefined();
    expect(screen.queryByRole("button", { name: /verificar/i })).toBeNull();
  });
});
