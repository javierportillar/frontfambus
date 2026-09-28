import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DocumentoCard } from "./DiaDetalleContent";

describe("DocumentoCard", () => {
  it("makes the entire purchase header clickable while keeping the expand control separate", () => {
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

    const documentLink = screen.getByRole("link", {
      name: "Abrir factura 13 clase S18 de KAROL NATALIA BURGOS BUSTOS",
    });
    expect(documentLink).toHaveAttribute(
      "href",
      "/dashboards/compras/dia/2024-07-27/documento/13?cod_clase=S18",
    );
    expect(documentLink).toHaveTextContent("Factura 13 · S18 · NIT 1116274616");
    expect(documentLink).toHaveTextContent("580 productos");
    expect(documentLink.textContent).toContain("$");

    fireEvent.click(screen.getByRole("button", { name: "Mostrar productos" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
