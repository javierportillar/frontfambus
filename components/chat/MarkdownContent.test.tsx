import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
