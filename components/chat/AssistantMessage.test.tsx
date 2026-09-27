import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AssistantMessage } from "./AssistantMessage";
import type { ChatMessage } from "@/lib/api/chat";
import type { AccessContext } from "@/lib/auth/access";

const baseContext: AccessContext = {
  role: "admin",
  enabledFeatures: ["ventas-summary", "inventario", "chat-ia"],
  allowedModules: null,
  currentTenant: "motoshop",
};

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    conversation_id: "conv-1",
    role: "assistant",
    content: "Test content",
    created_at: "2026-09-15T10:00:00Z",
    tenant_id: "motoshop",
    status: "complete",
    tools_used: [],
    sources: [],
    freshness: [],
    entity_refs: [],
    attachments: [],
    ...overrides,
  };
}

describe("AssistantMessage rendered states", () => {
  it("renders active report with download link", () => {
    const message = makeMessage({
      status: "partial",
      content: "Ventas disponibles.",
      sources: [{
        source_id: "sales-snapshot",
        domain: "sales",
        kind: "duckdb",
        citation: "Ventas del corte",
        cutoff_at: "2026-09-13",
        observed_at: "2026-09-15T10:00:00+00:00",
        status: "used",
      }],
      freshness: [{
        domain: "sales",
        cutoff_at: "2026-09-13",
        observed_at: "2026-09-15T10:00:00+00:00",
        status: "current",
      }],
      attachments: [{
        type: "report",
        format: "pdf",
        filename: "ventas.pdf",
        download_url: "/api/reports/download/rep-1",
        state: "available",
        expires_at: "2099-09-15T10:00:00+00:00",
        date_from: "2026-09-01",
        date_to: "2026-09-13",
        period_label: "Septiembre 2026",
      }],
    });

    render(<AssistantMessage message={message} context={baseContext} />);

    const article = screen.getByRole("article", { name: "Mensaje del asistente: Respuesta parcial" });
    expect(article).toBeInTheDocument();
    expect(within(article).getByText("Respuesta parcial")).toBeInTheDocument();
    expect(within(article).getByText("Ventas disponibles.")).toBeInTheDocument();
    expect(within(article).getByText(/Ventas del corte/)).toBeInTheDocument();
    expect(within(article).getByText(/sales: current/)).toBeInTheDocument();
    expect(within(article).getByText("Período: Septiembre 2026")).toBeInTheDocument();
    expect(within(article).getByRole("link", { name: "Descargar PDF" })).toHaveAttribute("href", "/api/reports/download/rep-1");
  });

  it("renders expired report with warning instead of download link", () => {
    const message = makeMessage({
      status: "partial",
      content: "El reporte anterior expiró.",
      attachments: [{
        type: "report",
        format: "pdf",
        filename: "ventas.pdf",
        download_url: "/api/reports/download/rep-1",
        state: "expired",
        expires_at: "2026-09-14T10:00:00+00:00",
        date_from: "2026-09-01",
        date_to: "2026-09-13",
        period_label: "Septiembre 2026",
      }],
    });

    render(<AssistantMessage message={message} context={baseContext} />);

    const article = screen.getByRole("article", { name: "Mensaje del asistente: Respuesta parcial" });
    expect(within(article).getByText("Este reporte expiró. Pedilo de nuevo en el chat.")).toBeInTheDocument();
    expect(within(article).queryByRole("link", { name: "Descargar PDF" })).not.toBeInTheDocument();
  });

  it("renders empty status with appropriate label", () => {
    const message = makeMessage({ status: "empty", content: "Sin resultados para esa consulta." });
    render(<AssistantMessage message={message} context={baseContext} />);

    const article = screen.getByRole("article", { name: "Mensaje del asistente: Sin resultados" });
    expect(within(article).getByText("Sin resultados")).toBeInTheDocument();
    expect(within(article).getByText("Sin resultados para esa consulta.")).toBeInTheDocument();
  });

  it("renders needs_clarification status", () => {
    const message = makeMessage({ status: "needs_clarification", content: "¿Podés especificar el período?" });
    render(<AssistantMessage message={message} context={baseContext} />);

    const article = screen.getByRole("article", { name: "Mensaje del asistente: Necesita aclaración" });
    expect(within(article).getByText("Necesita aclaración")).toBeInTheDocument();
  });

  it("renders unavailable status with warning tone", () => {
    const message = makeMessage({ status: "unavailable", content: "No se pudo procesar." });
    render(<AssistantMessage message={message} context={baseContext} />);

    const article = screen.getByRole("article", { name: "Mensaje del asistente: No disponible" });
    expect(within(article).getByText("No disponible")).toBeInTheDocument();
    expect(within(article).getByText("No se pudo procesar.")).toBeInTheDocument();
  });

  it("renders complete status without status badge", () => {
    const message = makeMessage({ status: "complete", content: "Todo listo." });
    render(<AssistantMessage message={message} context={baseContext} />);

    const article = screen.getByRole("article", { name: "Mensaje del asistente: Respuesta disponible" });
    expect(within(article).queryByText("Respuesta disponible")).not.toBeInTheDocument();
    expect(within(article).getByText("Todo listo.")).toBeInTheDocument();
  });

  it("strips external URLs from content display", () => {
    const message = makeMessage({
      status: "complete",
      content: "Ver [reporte](https://example.test/report) y https://example.test/raw",
    });
    render(<AssistantMessage message={message} context={baseContext} />);

    const article = screen.getByRole("article");
    expect(within(article).getByText("Ver reporte y")).toBeInTheDocument();
    expect(within(article).queryByText(/example\.test/)).not.toBeInTheDocument();
  });

  it("renders entity links with safe server-relative hrefs", () => {
    const message = makeMessage({
      entity_refs: [{
        entity_type: "product",
        entity_id: "SKU-1",
        label: "Filtro",
        domain: "inventory",
        href: "/dashboards/productos/SKU-1",
      }],
    });
    render(<AssistantMessage message={message} context={baseContext} />);

    const link = screen.getByRole("link", { name: "Filtro" });
    expect(link).toHaveAttribute("href", "/dashboards/productos/SKU-1");
  });

  it("links product SKUs and unique names in prose and Markdown tables", () => {
    const message = makeMessage({
      content: "Producto BONNAT001 SALSAS MRS TASTE para revisar.\n\n| Código | Producto |\n| --- | --- |\n| BONNAT001 | SALSAS MRS TASTE |",
      entity_refs: [{
        entity_type: "product",
        entity_id: "BONNAT001",
        label: "SALSAS MRS TASTE",
        domain: "inventory",
        href: "/dashboards/productos/BONNAT001",
      }],
    });
    render(<AssistantMessage message={message} context={baseContext} />);

    const skuLinks = screen.getAllByRole("link", {
      name: "Ver ficha de SALSAS MRS TASTE (BONNAT001)",
    });
    const nameLinks = screen.getAllByRole("link", { name: "Ver ficha de SALSAS MRS TASTE" });
    expect(skuLinks).toHaveLength(2);
    expect(nameLinks).toHaveLength(2);
    expect([...skuLinks, ...nameLinks].every(
      (link) => link.getAttribute("href") === "/dashboards/productos/BONNAT001",
    )).toBe(true);
  });

  it("does not link an ambiguous product name but keeps each verified SKU clickable", () => {
    const message = makeMessage({
      content: "SALSAS MRS TASTE: revisar BONNAT001 y BONNAT002.",
      entity_refs: ["BONNAT001", "BONNAT002"].map((entity_id) => ({
        entity_type: "product",
        entity_id,
        label: "SALSAS MRS TASTE",
        domain: "inventory",
        href: `/dashboards/productos/${entity_id}`,
      })),
    });
    render(<AssistantMessage message={message} context={baseContext} />);

    expect(screen.queryByRole("link", { name: "Ver ficha de SALSAS MRS TASTE" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver ficha de SALSAS MRS TASTE (BONNAT001)" })).toHaveAttribute(
      "href", "/dashboards/productos/BONNAT001",
    );
    expect(screen.getByRole("link", { name: "Ver ficha de SALSAS MRS TASTE (BONNAT002)" })).toHaveAttribute(
      "href", "/dashboards/productos/BONNAT002",
    );
    expect(screen.getByRole("link", { name: "SALSAS MRS TASTE (BONNAT001)" })).toHaveAttribute(
      "href", "/dashboards/productos/BONNAT001",
    );
    expect(screen.getByRole("link", { name: "SALSAS MRS TASTE (BONNAT002)" })).toHaveAttribute(
      "href", "/dashboards/productos/BONNAT002",
    );
  });

  it("does not link a catalog-wide ambiguous name absent from the visible refs", () => {
    const message = makeMessage({
      content: "SALSAS MRS TASTE: revisar BONNAT001.",
      entity_refs: [{
        entity_type: "product",
        entity_id: "BONNAT001",
        label: "SALSAS MRS TASTE",
        label_is_unique: false,
        domain: "inventory",
        href: "/dashboards/productos/BONNAT001",
      }],
    });
    render(<AssistantMessage message={message} context={baseContext} />);

    expect(screen.queryByRole("link", { name: /^Ver ficha de SALSAS MRS TASTE$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver ficha de SALSAS MRS TASTE (BONNAT001)" })).toHaveAttribute(
      "href", "/dashboards/productos/BONNAT001",
    );
  });

  it("keeps numeric invoice amounts plain and links the unique product name in a table", () => {
    const message = makeMessage({
      content: "| Código | Producto | Valor |\n| --- | --- | --- |\n| 123456 | Product alpha | $123456 |",
      entity_refs: [{
        entity_type: "product",
        entity_id: "123456",
        label: "Product alpha",
        domain: "inventory",
        href: "/dashboards/productos/123456",
      }],
    });
    render(<AssistantMessage message={message} context={baseContext} />);

    const row = screen.getByRole("row", { name: /\$123456/ });
    const skuCell = within(row).getByRole("cell", { name: "123456" });
    const productCell = within(row).getByRole("cell", { name: "Ver ficha de Product alpha" });
    const amountCell = within(row).getByRole("cell", { name: "$123456" });
    expect(within(skuCell).queryByRole("link")).not.toBeInTheDocument();
    expect(within(productCell).getByRole("link", { name: "Ver ficha de Product alpha" })).toHaveAttribute(
      "href", "/dashboards/productos/123456",
    );
    expect(within(amountCell).queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not render product links without Inventory access or for an untrusted destination", () => {
    const productRef = {
      entity_type: "product",
      entity_id: "BONNAT001",
      label: "SALSAS MRS TASTE",
      domain: "inventory",
      href: "/dashboards/productos/BONNAT001",
    };
    const restrictedContext: AccessContext = {
      role: "analista",
      enabledFeatures: ["chat-ia", "analisis"],
      allowedModules: ["chat-ia", "analisis"],
      currentTenant: "motoshop",
    };
    const restrictedMessage = makeMessage({
      content: "BONNAT001 SALSAS MRS TASTE",
      entity_refs: [productRef],
    });
    const { unmount } = render(
      <AssistantMessage message={restrictedMessage} context={restrictedContext} />,
    );
    expect(screen.queryByRole("link", { name: /Ver ficha de/ })).not.toBeInTheDocument();

    unmount();
    const unsafeMessage = makeMessage({
      content: "BONNAT001 SALSAS MRS TASTE",
      entity_refs: [{ ...productRef, href: "https://evil.test/product" }],
    });
    render(<AssistantMessage message={unsafeMessage} context={baseContext} />);
    expect(screen.queryByRole("link", { name: /Ver ficha de/ })).not.toBeInTheDocument();
  });

  it("hides entity links when domain access is denied", () => {
    const restrictedContext: AccessContext = {
      role: "user",
      enabledFeatures: ["chat-ia"],
      allowedModules: ["chat-ia"],
      currentTenant: "motoshop",
    };
    const message = makeMessage({
      entity_refs: [{
        entity_type: "product",
        entity_id: "SKU-1",
        label: "Filtro",
        domain: "inventory",
        href: "/dashboards/productos/SKU-1",
      }],
    });
    render(<AssistantMessage message={message} context={restrictedContext} />);

    expect(screen.queryByRole("link", { name: "Filtro" })).not.toBeInTheDocument();
  });

  it("hides entity links with unsafe hrefs", () => {
    const message = makeMessage({
      entity_refs: [{
        entity_type: "product",
        entity_id: "SKU-1",
        label: "Evil",
        domain: "inventory",
        href: "https://evil.test/steal",
      }],
    });
    render(<AssistantMessage message={message} context={baseContext} />);

    expect(screen.queryByRole("link", { name: "Evil" })).not.toBeInTheDocument();
  });

  it("renders freshness and evidence sections", () => {
    const message = makeMessage({
      sources: [{
        source_id: "inv-snapshot",
        domain: "inventory",
        kind: "duckdb",
        citation: "Inventario actual",
        cutoff_at: "2026-09-14",
        observed_at: "2026-09-15T10:00:00+00:00",
        status: "used",
      }],
      freshness: [{
        domain: "inventory",
        cutoff_at: "2026-09-14",
        observed_at: "2026-09-15T10:00:00+00:00",
        status: "stale",
      }],
    });
    render(<AssistantMessage message={message} context={baseContext} />);

    expect(screen.getByText("Actualidad de los datos")).toBeInTheDocument();
    expect(screen.getByText(/inventory: stale/)).toBeInTheDocument();
    expect(screen.getByText("Evidencia")).toBeInTheDocument();
    expect(screen.getByText(/Inventario actual/)).toBeInTheDocument();
  });
});

describe("AssistantMessage accessibility", () => {
  it("uses article with descriptive aria-label for each status", () => {
    const statuses = ["complete", "partial", "empty", "needs_clarification", "unavailable"] as const;
    const labels = ["Respuesta disponible", "Respuesta parcial", "Sin resultados", "Necesita aclaración", "No disponible"];

    for (let i = 0; i < statuses.length; i++) {
      const { unmount } = render(
        <AssistantMessage message={makeMessage({ status: statuses[i] })} context={baseContext} />,
      );
      expect(screen.getByRole("article", { name: `Mensaje del asistente: ${labels[i]}` })).toBeInTheDocument();
      unmount();
    }
  });

  it("uses role=status for non-complete status badges", () => {
    const message = makeMessage({ status: "partial" });
    render(<AssistantMessage message={message} context={baseContext} />);

    const statusEl = screen.getByRole("status");
    expect(statusEl).toHaveTextContent("Respuesta parcial");
  });

  it("uses role=status for expired report warning", () => {
    const message = makeMessage({
      status: "partial",
      attachments: [{
        type: "report",
        format: "pdf",
        filename: "ventas.pdf",
        download_url: "/api/reports/download/rep-1",
        state: "expired",
        expires_at: "2026-09-14T10:00:00+00:00",
        date_from: null,
        date_to: null,
        period_label: null,
      }],
    });
    render(<AssistantMessage message={message} context={baseContext} />);

    const statuses = screen.getAllByRole("status");
    const warning = statuses.find((el) => el.textContent?.includes("expiró"));
    expect(warning).toBeInTheDocument();
  });
});
