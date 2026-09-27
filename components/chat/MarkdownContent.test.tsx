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
});
