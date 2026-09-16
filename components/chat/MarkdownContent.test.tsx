import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
    render(<MarkdownContent content="[Ver producto](/inventario/productos/SKU-1) o https://evil.test/secret" />);

    expect(screen.getByRole("link", { name: "Ver producto" })).toHaveAttribute("href", "/inventario/productos/SKU-1");
    expect(screen.queryByText(/evil\.test/)).not.toBeInTheDocument();
  });

  it("keeps fenced code as text instead of interpreting HTML", () => {
    render(<MarkdownContent content={"```sql\n<select>*</select>\n```"} />);

    expect(screen.getByText("<select>*</select>")).toBeInTheDocument();
    expect(document.querySelector("select")).not.toBeInTheDocument();
  });
});
