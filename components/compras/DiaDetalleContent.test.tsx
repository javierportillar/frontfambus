import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DocumentoCard } from "./DiaDetalleContent";

describe("DocumentoCard", () => {
  it("links only the supplier name and invoice number while keeping the expand control separate", () => {
    const onToggle = vi.fn();
    render(
      <DocumentoCard
        date="2024-07-27"
        doc={{
          num_documento: "13",
          cod_clase: "S18",
          nit_proveedor: "1116274616",
          nombre_proveedor: "KAROL NATALIA BURGOS BUSTOS",
          total_factura: 11267897,
          num_items: 580,
          items: [{
            cod_producto: "SKU-1",
            nom_producto: "Product one",
            cantidad: 1,
            valor_unitario: 100,
            total: 100,
          }],
        }}
        open={false}
        onToggle={onToggle}
        onBeforeProductNavigation={vi.fn()}
      />,
    );

    const documentHref = "/dashboards/compras/dia/2024-07-27/documento/13?cod_clase=S18";

    const nameLink = screen.getByRole("link", {
      name: "Abrir factura 13 clase S18 de KAROL NATALIA BURGOS BUSTOS",
    });
    expect(nameLink).toHaveAttribute("href", documentHref);
    expect(nameLink).toHaveTextContent("KAROL NATALIA BURGOS BUSTOS");

    const invoiceLink = screen.getByRole("link", { name: "Factura 13" });
    expect(invoiceLink).toHaveAttribute("href", documentHref);

    const itemsText = screen.getByText("580 productos");
    expect(itemsText).toBeInTheDocument();
    expect(itemsText.closest("a")).toBeNull();

    const headerAmount = itemsText.previousElementSibling;
    expect(headerAmount?.textContent).toContain("$");
    expect(headerAmount?.closest("a")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mostrar productos" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
