import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { EntityRef } from "@/lib/api/chat";
import type { AccessContext } from "@/lib/auth/access";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders common markdown without exposing formatting markers", () => {
    render(<MarkdownContent content={"**Ventas:** 12\n\n- Stock **bajo**\n- `SKU-1`"} />);

    expect(screen.getByText("Ventas:")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Stock bajo");
    expect(screen.getByText("SKU-1")).toBeInTheDocument();
    expect(document.querySelector("p")?.textContent).toBe("Ventas: 12");
    expect(document.querySelector("ul")).toBeInTheDocument();
  });

  it("renders safe internal links and removes external URL content", () => {
    render(<MarkdownContent
      content="[Ver producto](/dashboards/productos/SKU-1) o https://evil.test/secret"
      entityRefs={[{
        entity_type: "product",
        entity_id: "SKU-1",
        label: "Filtro",
        domain: "inventory",
        href: "/dashboards/productos/SKU-1",
      }]}
      accessContext={{ role: "admin", enabledFeatures: ["inventario"], allowedModules: null }}
    />);

    expect(screen.getByRole("link", { name: "Ver producto" })).toHaveAttribute("href", "/dashboards/productos/SKU-1");
    expect(screen.queryByText(/evil\.test/)).not.toBeInTheDocument();
  });

  it("does not render arbitrary internal Markdown routes as links without a validated reference", () => {
    render(<MarkdownContent content="[Admin](/admin/usuarios) [Producto](/dashboards/productos/NOT-A-SKU)" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/Admin\s+Producto/)).toBeInTheDocument();
  });

  it("requires a numeric SKU's canonical name in the visible Markdown context", () => {
    const entityRefs: EntityRef[] = [{
      entity_type: "product",
      entity_id: "123456",
      label: "Product alpha",
      label_is_unique: true,
      domain: "inventory",
      href: "/dashboards/productos/123456",
    }];
    const accessContext: AccessContext = {
      role: "admin",
      enabledFeatures: ["inventario"],
      allowedModules: null,
    };
    const first = render(
      <MarkdownContent
        content="[SKU 123456](/dashboards/productos/123456) $123456"
        entityRefs={entityRefs}
        accessContext={accessContext}
      />,
    );

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    first.unmount();

    render(
      <MarkdownContent
        content="[Product alpha SKU 123456](/dashboards/productos/123456)"
        entityRefs={entityRefs}
        accessContext={accessContext}
      />,
    );

    expect(screen.getByRole("link", { name: "Product alpha SKU 123456" })).toHaveAttribute(
      "href", "/dashboards/productos/123456",
    );
  });

  it("does not treat a hidden Markdown destination as visible product-name context", () => {
    render(<MarkdownContent
      content="Total: $123456 [nota](/dashboards/productos/Product-alpha)"
      entityRefs={[{
        entity_type: "product",
        entity_id: "123456",
        label: "Product alpha",
        domain: "inventory",
        href: "/dashboards/productos/123456",
      }]}
      accessContext={{ role: "admin", enabledFeatures: ["inventario"], allowedModules: null }}
    />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps fenced code as text instead of interpreting HTML", () => {
    render(<MarkdownContent content={"```sql\n<select>*</select>\n```"} />);

    expect(screen.getByText("<select>*</select>")).toBeInTheDocument();
    expect(document.querySelector("select")).not.toBeInTheDocument();
  });

  it("links a verified document number only when its visible label identifies an invoice", () => {
    const ref: EntityRef = {
      entity_type: "purchase_document",
      entity_id: "2026-07-20|FC|456",
      label: "Factura 456",
      domain: "purchases",
      href: "/dashboards/compras/dia/2026-07-20/documento/456?cod_clase=FC",
    };
    const accessContext: AccessContext = {
      role: "admin",
      enabledFeatures: ["ventas-summary"],
      allowedModules: null,
      currentTenant: "motoshop",
    };
    const { rerender } = render(
      <MarkdownContent
        content="Factura 456 · total $7890"
        entityRefs={[ref]}
        accessContext={accessContext}
      />,
    );

    expect(screen.getByRole("link", { name: "Ver factura 456" })).toHaveAttribute("href", ref.href);
    expect(screen.getByText(/total \$7890/)).toBeInTheDocument();

    rerender(
      <MarkdownContent
        content="Doc. 456 · total $7890"
        entityRefs={[ref]}
        accessContext={accessContext}
      />,
    );
    expect(screen.getByRole("link", { name: "Ver factura 456" })).toHaveAttribute("href", ref.href);

    rerender(
      <MarkdownContent
        content="Comprobante Nro. 456 · total $7890"
        entityRefs={[ref]}
        accessContext={accessContext}
      />,
    );
    expect(screen.getByRole("link", { name: "Ver factura 456" })).toHaveAttribute("href", ref.href);

    rerender(
      <MarkdownContent
        content="[Factura 456](/dashboards/compras/dia/2026-07-20/documento/456?cod_clase=FC)"
        entityRefs={[ref]}
        accessContext={accessContext}
      />,
    );
    expect(screen.getByRole("link", { name: "Factura 456" })).toHaveAttribute("href", ref.href);

    rerender(
      <MarkdownContent
        content="[Abrir](/dashboards/compras/dia/2026-07-20/documento/456?cod_clase=FC)"
        entityRefs={[ref]}
        accessContext={accessContext}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    rerender(
      <MarkdownContent
        content="Referencia 456 · total $7890"
        entityRefs={[ref]}
        accessContext={accessContext}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("recognizes a document column label but leaves an equal numeric amount unlinked", () => {
    const ref: EntityRef = {
      entity_type: "purchase_document",
      entity_id: "2026-07-20|FC|456",
      label: "Factura 456",
      domain: "purchases",
      href: "/dashboards/compras/dia/2026-07-20/documento/456?cod_clase=FC",
    };
    render(
      <MarkdownContent
        content={"| Factura | Total |\n| --- | --- |\n| 456 | $456 |"}
        entityRefs={[ref]}
        accessContext={{ role: "admin", enabledFeatures: ["ventas-summary"], allowedModules: null }}
      />,
    );

    const row = screen.getByRole("row", { name: /456.*\$456/ });
    const documentCell = within(row).getByRole("cell", { name: "Ver factura 456" });
    const amountCell = within(row).getByRole("cell", { name: "$456" });
    expect(within(documentCell).getByRole("link", { name: "Ver factura 456" })).toHaveAttribute("href", ref.href);
    expect(within(amountCell).queryByRole("link")).not.toBeInTheDocument();
  });

  it("links repeated document numbers to their own exact purchase identities", () => {
    const august: EntityRef = {
      entity_type: "purchase_document",
      entity_id: "2026-08-03|FC|300",
      label: "Factura 300",
      domain: "purchases",
      href: "/dashboards/compras/dia/2026-08-03/documento/300?cod_clase=FC",
    };
    const september: EntityRef = {
      entity_type: "purchase_document",
      entity_id: "2026-09-10|NC|300",
      label: "Factura 300",
      domain: "purchases",
      href: "/dashboards/compras/dia/2026-09-10/documento/300?cod_clase=NC",
    };
    const accessContext: AccessContext = {
      role: "admin",
      enabledFeatures: ["ventas-summary"],
      allowedModules: null,
      currentTenant: "motoshop",
    };
    const content = [
      "Documento: 300 · Clase: FC · Fecha: 2026-08-03 · Total $500",
      "Documento: 300 · Clase: NC · Fecha: 2026-09-10 · Total $1300",
    ].join("\n");

    render(
      <MarkdownContent content={content} entityRefs={[august, september]} accessContext={accessContext} />,
    );

    const links = screen.getAllByRole("link", { name: "Ver factura 300" });
    expect(links).toHaveLength(2);
    expect(links.map((link) => link.getAttribute("href"))).toEqual([august.href, september.href]);
  });

  it("links a document number without matching its digits inside a thousands-formatted total", () => {
    const ref: EntityRef = {
      entity_type: "purchase_document",
      entity_id: "2026-09-10|FC|300",
      label: "Factura 300",
      domain: "purchases",
      href: "/dashboards/compras/dia/2026-09-10/documento/300?cod_clase=FC",
    };
    render(
      <MarkdownContent
        content="Documento: 300 · Clase: FC · Fecha: 2026-09-10 · Total: $1.300 COP"
        entityRefs={[ref]}
        accessContext={{ role: "admin", enabledFeatures: ["ventas-summary"], allowedModules: null }}
      />,
    );

    expect(screen.getByRole("link", { name: "Ver factura 300" })).toHaveAttribute("href", ref.href);
    expect(screen.getByText(/Total: \$1\.300 COP/)).toBeInTheDocument();
    expect(screen.getByText(/Total: \$1\.300 COP/).closest("a")).toBeNull();
  });

  it("uses document table rows to disambiguate repeated numbers without linking totals", () => {
    const august: EntityRef = {
      entity_type: "purchase_document",
      entity_id: "2026-08-03|FC|300",
      label: "Factura 300",
      domain: "purchases",
      href: "/dashboards/compras/dia/2026-08-03/documento/300?cod_clase=FC",
    };
    const september: EntityRef = {
      entity_type: "purchase_document",
      entity_id: "2026-09-10|NC|300",
      label: "Factura 300",
      domain: "purchases",
      href: "/dashboards/compras/dia/2026-09-10/documento/300?cod_clase=NC",
    };
    render(
      <MarkdownContent
        content={[
          "| Documento | Clase | Fecha | Total |",
          "| --- | --- | --- | --- |",
          "| 300 | FC | 2026-08-03 | $500 |",
          "| 300 | NC | 2026-09-10 | $1300 |",
        ].join("\n")}
        entityRefs={[august, september]}
        accessContext={{ role: "admin", enabledFeatures: ["ventas-summary"], allowedModules: null }}
      />,
    );

    const rows = screen.getAllByRole("row");
    expect(within(rows[1]!).getByRole("link", { name: "Ver factura 300" })).toHaveAttribute(
      "href", august.href,
    );
    expect(within(rows[2]!).getByRole("link", { name: "Ver factura 300" })).toHaveAttribute(
      "href", september.href,
    );
    expect(within(rows[1]!).getByRole("cell", { name: "$500" }).querySelector("a")).toBeNull();
    expect(within(rows[2]!).getByRole("cell", { name: "$1300" }).querySelector("a")).toBeNull();
  });

  it("links a supplier by its canonical unique name and explicit NIT", () => {
    const ref: EntityRef = {
      entity_type: "supplier",
      entity_id: "900123456",
      label: "Distribuidora Norte",
      label_is_unique: true,
      domain: "purchases",
      href: "/dashboards/compras/proveedores/900123456",
    };
    render(
      <MarkdownContent
        content="Distribuidora Norte · NIT: 900123456 · total $48000"
        entityRefs={[ref]}
        accessContext={{ role: "admin", enabledFeatures: ["ventas-summary"], allowedModules: null }}
      />,
    );

    const supplierLinks = screen.getAllByRole("link", {
      name: /Ver ficha de proveedor/,
    });
    expect(supplierLinks).toHaveLength(2);
    expect(supplierLinks.every((link) => link.getAttribute("href") === ref.href)).toBe(true);
    expect(screen.getByText(/total \$48000/)).toBeInTheDocument();
  });

  it("keeps an ambiguous supplier name plain while linking its verified NIT", () => {
    const ref: EntityRef = {
      entity_type: "supplier",
      entity_id: "900123456",
      label: "Distribuidora Norte",
      label_is_unique: false,
      domain: "purchases",
      href: "/dashboards/compras/proveedores/900123456",
    };
    render(
      <MarkdownContent
        content="Distribuidora Norte · NIT 900123456 · total $48000"
        entityRefs={[ref]}
        accessContext={{ role: "admin", enabledFeatures: ["ventas-summary"], allowedModules: null }}
      />,
    );

    expect(screen.queryByRole("link", { name: "Distribuidora Norte" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", {
      name: "Ver ficha de proveedor NIT 900123456",
    })).toHaveAttribute("href", ref.href);
  });

  it("does not turn an arbitrary internal Markdown destination into a link", () => {
    render(<MarkdownContent content="[Abrir ficha](/dashboards/compras/proveedores/900123456)" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Abrir ficha")).toBeInTheDocument();
  });

  it("renders clickable supplier links inside a supplier sales markdown table", () => {
    const ref: EntityRef = {
      entity_type: "supplier",
      entity_id: "900123456",
      label: "Distribuidora Norte",
      label_is_unique: true,
      domain: "purchases",
      href: "/dashboards/compras/proveedores/900123456",
    };
    render(
      <MarkdownContent
        content={`
| Proveedor | NIT | Unidades vendidas | Ventas asociadas ($ COP) | Margen ($ COP / %) | Compras ($ COP) | Ratio V/C |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: |
| Distribuidora Norte | NIT: 900123456 | 1,200 | $ 35,000,000 | $ 12,000,000 (34.3%) | $ 28,000,000 | 1.25 |
        `.trim()}
        entityRefs={[ref]}
        accessContext={{ role: "admin", enabledFeatures: ["ventas-summary"], allowedModules: null }}
      />,
    );

    const supplierLinks = screen.getAllByRole("link", {
      name: /Ver ficha de proveedor/,
    });
    expect(supplierLinks.length).toBeGreaterThanOrEqual(1);
    expect(supplierLinks.some((link) => link.getAttribute("href") === ref.href)).toBe(true);
    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(screen.getByText("$ 35,000,000")).toBeInTheDocument();
  });

  it("renders replenishment table linking suppliers, parenthesized NITs, and products while keeping amounts unlinked", () => {
    const camilaRef: EntityRef = {
      entity_type: "supplier",
      entity_id: "1010119448",
      label: "MARIA CAMILA MUÑOZ PANTOJA",
      label_is_unique: true,
      domain: "purchases",
      href: "/dashboards/compras/proveedores/1010119448",
    };
    const natifRef: EntityRef = {
      entity_type: "supplier",
      entity_id: "901406306",
      label: "NATIF",
      label_is_unique: true,
      domain: "purchases",
      href: "/dashboards/compras/proveedores/901406306",
    };
    const chocotabsRef: EntityRef = {
      entity_type: "product",
      entity_id: "EAN: 7709799022257",
      label: "CHOCOTABS CRUNCH LECHE 35GR",
      label_is_unique: true,
      domain: "inventory",
      href: `/dashboards/productos/${encodeURIComponent("EAN: 7709799022257")}`,
    };
    const chocolateRef: EntityRef = {
      entity_type: "product",
      entity_id: "7709990231205",
      label: "CHOCOLATE ORGANICO OSCURO 80%",
      label_is_unique: true,
      domain: "inventory",
      href: "/dashboards/productos/7709990231205",
    };

    render(
      <MarkdownContent
        content={`
| Proveedor (NIT) | Producto más importante | SKU | Unid. vendidas (180d) | Ventas asociadas |
| :--- | :--- | :--- | ---: | ---: |
| MARIA CAMILA MUÑOZ PANTOJA (1010119448) | [Litro Chilacuan Maracuya](/dashboards/productos/L-CM) | [L-CM](/dashboards/productos/L-CM) | 16 | $554.400 |
| NATIF (901406306) | CHOCOTABS CRUNCH LECHE 35GR | EAN: 7709799022257 | 36 | $324.000 |
| CHOCOLATES SAS (900111222) | [CHOCOLATE ORGÁNICO OSCURO 80%](/dashboards/productos/7709990231205) | [7709990231205](/dashboards/productos/7709990231205) | 10 | $125.400 |
        `.trim()}
        entityRefs={[camilaRef, natifRef, chocotabsRef, chocolateRef]}
        accessContext={{ role: "admin", enabledFeatures: ["ventas-summary", "inventario"], allowedModules: null }}
      />,
    );

    // Supplier links in row 1
    const camilaLinks = screen.getAllByRole("link", { name: /MARIA CAMILA MUÑOZ PANTOJA/ });
    expect(camilaLinks.length).toBeGreaterThanOrEqual(1);
    expect(camilaLinks[0]).toHaveAttribute("href", camilaRef.href);
    const camilaNitLinks = screen.getAllByRole("link", { name: /1010119448/ });
    expect(camilaNitLinks.length).toBeGreaterThanOrEqual(1);
    expect(camilaNitLinks[0]).toHaveAttribute("href", camilaRef.href);

    // Supplier links in row 2
    const natifLinks = screen.getAllByRole("link", { name: /NATIF/ });
    expect(natifLinks.length).toBeGreaterThanOrEqual(1);
    expect(natifLinks[0]).toHaveAttribute("href", natifRef.href);
    const natifNitLinks = screen.getAllByRole("link", { name: /901406306/ });
    expect(natifNitLinks.length).toBeGreaterThanOrEqual(1);
    expect(natifNitLinks[0]).toHaveAttribute("href", natifRef.href);

    // Product links in row 2 (plain text mentioned)
    const chocotabsProductLinks = screen.getAllByRole("link", { name: /CHOCOTABS CRUNCH LECHE 35GR/ });
    expect(chocotabsProductLinks.length).toBeGreaterThanOrEqual(1);
    expect(chocotabsProductLinks[0]).toHaveAttribute("href", chocotabsRef.href);
    const chocotabsSkuLinks = screen.getAllByRole("link", { name: /7709799022257/ });
    expect(chocotabsSkuLinks.length).toBeGreaterThanOrEqual(1);
    expect(chocotabsSkuLinks[0]).toHaveAttribute("href", chocotabsRef.href);

    // Product links in row 3 (markdown link format)
    const chocolateProductLinks = screen.getAllByRole("link", { name: /CHOCOLATE ORGÁNICO OSCURO 80%/ });
    expect(chocolateProductLinks.length).toBeGreaterThanOrEqual(1);
    expect(chocolateProductLinks[0]).toHaveAttribute("href", chocolateRef.href);
    const chocolateSkuLinks = screen.getAllByRole("link", { name: /7709990231205/ });
    expect(chocolateSkuLinks.length).toBeGreaterThanOrEqual(1);
    expect(chocolateSkuLinks[0]).toHaveAttribute("href", chocolateRef.href);

    // Amounts must not be linked
    expect(screen.getByText("16")).toBeInTheDocument();
    expect(screen.getByText("$554.400")).toBeInTheDocument();
    expect(screen.getByText("36")).toBeInTheDocument();
    expect(screen.getByText("$324.000")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("$125.400")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /\$324/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /\$554/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /\$125/ })).not.toBeInTheDocument();
  });
});
