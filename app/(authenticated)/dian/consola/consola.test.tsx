import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import DianConsolePage from "./page";
import * as dianApi from "@/lib/api/dian";
import { useAuthStore } from "@/lib/auth/store";

vi.mock("@/lib/api/dian", () => ({
  fetchDianQueueStatus: vi.fn(),
  retryDianTransmission: vi.fn(),
  fetchDianDocument: vi.fn(),
}));

describe("DIAN Invoicing Console Page (app/(authenticated)/dian/consola/page.tsx)", () => {
  const mockQueueResponse: dianApi.DianQueueResponse = {
    total: 3,
    accepted: 1,
    pending: 1,
    failed: 1,
    rejected: 0,
    documents: [
      {
        sale_id: "sale-acc-1",
        doc_number: "POS-0001",
        cufe: "96charsafeabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
        qr_url: "https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=96charsafeabcdef",
        status: "ACCEPTED",
        sent_at: "2026-10-21T08:30:00Z",
        accepted_at: "2026-10-21T08:30:02Z",
        error_message: null,
        retry_count: 0,
        track_id: "track-1",
        estfele: 1,
      },
      {
        sale_id: "sale-pen-2",
        doc_number: "POS-0002",
        cufe: null,
        qr_url: null,
        status: "PENDING",
        sent_at: "2026-10-21T08:45:00Z",
        accepted_at: null,
        error_message: null,
        retry_count: 0,
        track_id: null,
        estfele: null,
      },
      {
        sale_id: "sale-fail-3",
        doc_number: "POS-0003",
        cufe: null,
        qr_url: null,
        status: "FAILED",
        sent_at: "2026-10-21T09:00:00Z",
        accepted_at: null,
        error_message: "DIAN gateway timeout (503 Service Unavailable)",
        retry_count: 2,
        track_id: null,
        estfele: 0,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ currentTenant: "motoshop", role: "admin", user: "Admin User" });
    vi.mocked(dianApi.fetchDianQueueStatus).mockResolvedValue(mockQueueResponse);
  });

  it("renders header, KPI cards, and documents table", async () => {
    render(<DianConsolePage />);

    // Verifica que se cargan los KPIs
    await waitFor(() => {
      expect(screen.getByText("Consola de Facturación Electrónica DIAN")).toBeDefined();
    });

    expect(screen.getByText("Total Documentos")).toBeDefined();
    expect(screen.getByText("Aceptadas por DIAN")).toBeDefined();
    expect(screen.getByText("En Cola / Pendientes")).toBeDefined();
    expect(screen.getByText("Con Error de Envío")).toBeDefined();

    // Valores en los KPIs
    expect(screen.getAllByText("3").length).toBeGreaterThan(0); // Total
    expect(screen.getAllByText("1").length).toBeGreaterThan(0); // Aceptadas y pendientes

    // Filas en la tabla
    expect(screen.getByText("POS-0001")).toBeDefined();
    expect(screen.getByText("POS-0002")).toBeDefined();
    expect(screen.getByText("POS-0003")).toBeDefined();

    // Badges de estado
    expect(screen.getByText("Aceptada DIAN")).toBeDefined();
    expect(screen.getByText("En Cola DIAN")).toBeDefined();
    expect(screen.getByText("Error Transmisión")).toBeDefined();
  });

  it("filters documents when clicking filter tabs", async () => {
    render(<DianConsolePage />);

    await waitFor(() => {
      expect(screen.getByText("POS-0001")).toBeDefined();
    });

    // Clic en pestaña "Aceptadas"
    const tabAceptadas = screen.getByRole("tab", { name: /Aceptadas/i });
    fireEvent.click(tabAceptadas);

    expect(screen.getByText("POS-0001")).toBeDefined();
    expect(screen.queryByText("POS-0002")).toBeNull();
    expect(screen.queryByText("POS-0003")).toBeNull();

    // Clic en pestaña "Con Error"
    const tabError = screen.getByRole("tab", { name: /Con Error/i });
    fireEvent.click(tabError);

    expect(screen.getByText("POS-0003")).toBeDefined();
    expect(screen.queryByText("POS-0001")).toBeNull();
    expect(screen.queryByText("POS-0002")).toBeNull();
  });

  it("filters by search query input", async () => {
    render(<DianConsolePage />);

    await waitFor(() => {
      expect(screen.getByText("POS-0001")).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText(/Buscar por # factura, CUFE/i);
    fireEvent.change(searchInput, { target: { value: "POS-0002" } });

    expect(screen.getByText("POS-0002")).toBeDefined();
    expect(screen.queryByText("POS-0001")).toBeNull();
    expect(screen.queryByText("POS-0003")).toBeNull();
  });

  it("opens XML Modal viewer on 'Ver XML' click and inspects UBL stub", async () => {
    render(<DianConsolePage />);

    await waitFor(() => {
      expect(screen.getByText("POS-0001")).toBeDefined();
    });

    const verXmlButtons = screen.getAllByRole("button", { name: /Ver XML/i });
    expect(verXmlButtons[0]).toBeDefined();
    fireEvent.click(verXmlButtons[0]!);

    // Modal dialog abierto
    await waitFor(() => {
      expect(screen.getByText(/Inspección UBL 2.1 — POS-0001/i)).toBeDefined();
    });

    expect(screen.getByText(/AttachedDocument xmlns=/i)).toBeDefined();
    expect(screen.getByText(/DIAN 2.1: Factura Electrónica de Venta/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Copiar XML/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Descargar \.xml/i })).toBeDefined();
  });

  it("allows admin/gerente to retry transmission on failed documents", async () => {
    useAuthStore.setState({ role: "gerente" });
    vi.mocked(dianApi.retryDianTransmission).mockResolvedValueOnce({
      sale_id: "sale-fail-3",
      doc_number: "POS-0003",
      cufe: "new-cufe-3",
      qr_url: "https://dian/qr/3",
      status: "ACCEPTED",
      sent_at: "2026-10-21T09:15:00Z",
      accepted_at: "2026-10-21T09:15:01Z",
      error_message: null,
      retry_count: 3,
      track_id: "track-3",
      estfele: 1,
    });

    render(<DianConsolePage />);

    await waitFor(() => {
      expect(screen.getByText("POS-0003")).toBeDefined();
    });

    // Localizar botón de reintentar para el item fallido
    const retryButtons = screen.getAllByRole("button", { name: /Reintentar/i });
    // El tercer botón corresponde a POS-0003 (el fallido)
    const activeRetryButton = retryButtons.find((btn) => !btn.hasAttribute("disabled"));
    expect(activeRetryButton).toBeDefined();

    if (activeRetryButton) {
      fireEvent.click(activeRetryButton);

      await waitFor(() => {
        expect(dianApi.retryDianTransmission).toHaveBeenCalledWith("sale-fail-3", false, "motoshop");
      });
    }
  });

  it("disables retry button when user role is vendedor", async () => {
    useAuthStore.setState({ role: "vendedor" });

    render(<DianConsolePage />);

    await waitFor(() => {
      expect(screen.getByText("POS-0003")).toBeDefined();
    });

    const retryButtons = screen.getAllByRole("button", { name: /Reintentar/i });
    // Todos los botones deben estar deshabilitados para rol vendedor
    retryButtons.forEach((btn) => {
      expect(btn.hasAttribute("disabled")).toBe(true);
    });
  });
});
