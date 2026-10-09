import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  retryPurchaseAssessment,
  usePurchaseAssessment,
  usePurchasesDayGrouped,
  type PurchaseAssessment,
} from "@/lib/api/hooks";
import { CompraDetalleContent } from "./CompraDetalleContent";

vi.mock("@/lib/api/hooks", () => ({
  retryPurchaseAssessment: vi.fn(),
  usePurchaseAssessment: vi.fn(),
  usePurchasesDayGrouped: vi.fn(),
}));

vi.mock("@/components/chat/MarkdownContent", () => ({
  MarkdownContent: ({ content }: { content: string }) => <pre>{content}</pre>,
}));

const invoice = {
  num_documento: "FC-9001",
  cod_clase: "FC",
  nit_proveedor: "900",
  nombre_proveedor: "Proveedor de prueba",
  total_factura: 250_000,
  num_items: 1,
  items: [{
    cod_producto: "SKU-1",
    nom_producto: "Producto de prueba",
    cantidad: 5,
    valor_unitario: 50_000,
    total: 250_000,
  }],
};

const fallbackAssessment: PurchaseAssessment = {
  id: "assessment-1",
  business_date: "2026-10-05",
  cod_clase: "FC",
  num_documento: "FC-9001",
  nit_proveedor: "900",
  nombre_proveedor: "Proveedor de prueba",
  content_fingerprint: "a".repeat(64),
  assessment_fingerprint: "b".repeat(64),
  status: "fallback",
  attempt_count: 1,
  last_error_code: null,
  next_retry_at: null,
  deterministic_metrics: {
    assessment_summary: {
      senal_global: "requiere_revision",
      skus_evaluados: 1,
      skus_con_evidencia_de_demanda_y_stock: 1,
      skus_sin_historial_previo_180d: 0,
      valor_lineas_compra_cop: 250_000,
      valor_en_senales_de_revision_cop: 250_000,
      porcentaje_valor_en_senales_de_revision: 100,
    },
  },
  markdown: "# Resumen determinístico",
  source_cutoffs: { purchases: "2026-10-05", sales: "2026-10-05", inventory: "2026-10-05" },
  generation_mode: "deterministic_fallback",
  provider: null,
  model: null,
  analyzer_revision: "purchase-invoice-v1",
  prompt_revision: "purchase-assessment-spanish-v1",
  created_at: "2026-10-06T14:00:00Z",
  updated_at: "2026-10-06T14:00:00Z",
  completed_at: "2026-10-06T14:00:00Z",
};

const pendingAssessment: PurchaseAssessment = {
  ...fallbackAssessment,
  status: "pending",
  markdown: null,
  generation_mode: null,
  provider: null,
  model: null,
  completed_at: null,
};

function swr<T>(data: T) {
  return {
    data,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
  };
}

describe("CompraDetalleContent assessment retry", () => {
  const mutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usePurchasesDayGrouped).mockReturnValue(swr({
      date: "2026-10-05",
      total_compras: 250_000,
      total_documentos: 1,
      documentos: [invoice],
    }) as unknown as ReturnType<typeof usePurchasesDayGrouped>);
    vi.mocked(usePurchaseAssessment).mockReturnValue({
      ...swr(fallbackAssessment),
      mutate,
    } as ReturnType<typeof usePurchaseAssessment>);
    vi.mocked(retryPurchaseAssessment).mockResolvedValue(pendingAssessment);
  });

  it("queues an exact fallback assessment and shows that it is processing", async () => {
    render(<CompraDetalleContent date="2026-10-05" documentNumber="FC-9001" classCode="FC" />);

    fireEvent.click(screen.getByRole("button", { name: "Reintentar análisis con IA" }));

    await waitFor(() => {
      expect(retryPurchaseAssessment).toHaveBeenCalledWith("assessment-1");
      expect(mutate).toHaveBeenCalledWith(pendingAssessment, false);
    });
  });

  it("keeps the deterministic report visible and explains when the provider retry fails", async () => {
    vi.mocked(retryPurchaseAssessment).mockRejectedValue(new Error("API error 503"));
    render(<CompraDetalleContent date="2026-10-05" documentNumber="FC-9001" classCode="FC" />);

    fireEvent.click(screen.getByRole("button", { name: "Reintentar análisis con IA" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos volver a generar la narrativa",
    );
    expect(screen.getByText("# Resumen determinístico")).toBeInTheDocument();
  });

  it("does not offer an AI retry for an already completed narrative", () => {
    vi.mocked(usePurchaseAssessment).mockReturnValue({
      ...swr({ ...fallbackAssessment, status: "completed", generation_mode: "llm" }),
      mutate,
    } as unknown as ReturnType<typeof usePurchaseAssessment>);
    render(<CompraDetalleContent date="2026-10-05" documentNumber="FC-9001" classCode="FC" />);

    expect(screen.queryByRole("button", { name: "Reintentar análisis con IA" })).not.toBeInTheDocument();
  });

  it("links a valid supplier NIT to the existing supplier profile", () => {
    vi.mocked(usePurchasesDayGrouped).mockReturnValue(swr({
      date: "2026-10-05",
      total_compras: 250_000,
      total_documentos: 1,
      documentos: [{ ...invoice, nit_proveedor: "900123456" }],
    }) as unknown as ReturnType<typeof usePurchasesDayGrouped>);

    render(<CompraDetalleContent date="2026-10-05" documentNumber="FC-9001" classCode="FC" />);

    expect(screen.getByRole("link", {
      name: "Abrir perfil del proveedor Proveedor de prueba, NIT 900123456",
    })).toHaveAttribute("href", "/dashboards/compras/proveedores/900123456");
  });

  it("keeps supplier text non-clickable when the NIT is missing or invalid", () => {
    vi.mocked(usePurchasesDayGrouped).mockReturnValue(swr({
      date: "2026-10-05",
      total_compras: 250_000,
      total_documentos: 1,
      documentos: [invoice],
    }) as unknown as ReturnType<typeof usePurchasesDayGrouped>);

    render(<CompraDetalleContent date="2026-10-05" documentNumber="FC-9001" classCode="FC" />);

    expect(screen.getByText("Proveedor de prueba")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /perfil del proveedor/i })).not.toBeInTheDocument();
  });
});
