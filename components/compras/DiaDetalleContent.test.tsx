import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocumentoCard } from "./DiaDetalleContent";

describe("DocumentoCard", () => {
  it("links the supplier to the specific purchase detail page", () => {
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
          items: [],
        }}
        open={false}
        onToggle={vi.fn()}
        onBeforeProductNavigation={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: "KAROL NATALIA BURGOS BUSTOS" })).toHaveAttribute(
      "href",
      "/dashboards/compras/dia/2024-07-27/documento/13?cod_clase=S18",
    );
  });
});
