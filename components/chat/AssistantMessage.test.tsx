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
        href: "/inventario/productos/SKU-1",
      }],
    });
    render(<AssistantMessage message={message} context={baseContext} />);

    const link = screen.getByRole("link", { name: "Filtro" });
    expect(link).toHaveAttribute("href", "/inventario/productos/SKU-1");
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
        href: "/inventario/productos/SKU-1",
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
