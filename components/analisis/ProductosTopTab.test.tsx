import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAnalisisProductos } from "@/lib/api/hooks";
import { ProductosTopTab } from "./ProductosTopTab";

vi.mock("@/lib/api/hooks", () => ({ useAnalisisProductos: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("ProductosTopTab unit totals", () => {
  beforeEach(() => {
    vi.mocked(useAnalisisProductos).mockReturnValue({
      data: {
        fecha_inicio: "2026-09-01",
        fecha_fin: "2026-09-26",
        total_skus_vendidos: 2,
        total_skus_comprados: 2,
        total_revenue: 100_000,
        total_margen: 30_000,
        total_unidades: 5,
        total_unidades_por_medida: { g: 2, u: 3 },
        total_compras_periodo: 40_000,
        margen_promedio_pct: 30,
        pareto: { skus_para_80_pct: 1, pct_skus: 50, total_skus: 2 },
        top_revenue: [{
          cod_producto: "SKU-1", nom_producto: "Product one", unidades: 2,
          revenue: 60_000, costo: 40_000, margen: 20_000, margen_pct: 33.3,
          num_facturas: 2, unidad_medida: "g", valor_comprado: 25_000,
          ratio_venta_compra: 2.4,
        }],
        top_margen: [],
        top_unidades: [],
        top_compras: [],
        top_ganadores: [],
        top_perdedores: [],
        periodo_comparado: null,
      },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as ReturnType<typeof useAnalisisProductos>);
  });

  it("shows totals grouped by unit instead of adding grams to pieces", () => {
    render(<ProductosTopTab ini="2026-09-01" fin="2026-09-26" />);

    expect(screen.getByText(/2 SKUs · 2 g · 3 u vendidas por medida \(no sumar entre medidas\)/)).toBeInTheDocument();
  });

  it("does not label a legacy aggregate as units when the measure breakdown is absent", () => {
    const implementation = vi.mocked(useAnalisisProductos).getMockImplementation();
    const currentResult = implementation?.("2026-09-01", "2026-09-26", 50);
    if (!currentResult?.data) throw new Error("Expected test fixture data");

    vi.mocked(useAnalisisProductos).mockReturnValue({
      ...currentResult,
      data: { ...currentResult.data, total_unidades_por_medida: undefined },
    });

    render(<ProductosTopTab ini="2026-09-01" fin="2026-09-26" />);

    expect(screen.getByText(/2 SKUs · desglose por medida no disponible/)).toBeInTheDocument();
  });
});
