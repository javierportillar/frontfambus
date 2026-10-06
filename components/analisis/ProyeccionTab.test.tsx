import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePurchaseAssessments, useSalesForecastMonthly } from "@/lib/api/hooks";
import { ProyeccionTab } from "./ProyeccionTab";

vi.mock("@/lib/api/hooks", () => ({
  usePurchaseAssessments: vi.fn(),
  useSalesForecastMonthly: vi.fn(),
}));

vi.mock("recharts", () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Bar: Container,
    BarChart: Container,
    CartesianGrid: Container,
    ResponsiveContainer: Container,
    Tooltip: Container,
    XAxis: Container,
    YAxis: Container,
  };
});

describe("ProyeccionTab backtest confidence", () => {
  beforeEach(() => {
    vi.mocked(usePurchaseAssessments).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    });
    vi.mocked(useSalesForecastMonthly).mockReturnValue({
      data: {
        current_month: {
          month: "2026-09", observed_amount: 100, projected_amount: 200,
          daily_rate: 10, days_observed: 10, days_total: 30, confidence: "low",
        },
        next_month: {
          month: "2026-10", projected_amount: 310, days_total: 31,
          last_year_same_month: 0, confidence: "low",
        },
        stock_adjusted: {
          current_month: { month: "2026-09", observed_amount: 100, projected_amount: 180, days_total: 30 },
          next_month: { month: "2026-10", observed_amount: 0, projected_amount: 250, days_total: 31 },
          confidence: "low",
          confidence_note: "Sin snapshots históricos; no se calcula backtest.",
          inventory_source: "compras válidas menos ventas válidas (estimado)",
          no_future_replenishment: true,
          inventory_controlled_skus: 12,
          uncapped_service_skus: 2,
          insufficient_evidence_skus: 1,
        },
        daily_series: [],
        source_cutoffs: {
          sales_date: "2026-09-15",
          inventory_date: "2026-09-16",
          purchases_date: "2026-09-16",
        },
        staleness: {
          as_of_date: "2026-09-20",
          sales_days_behind: 5,
          inventory_days_behind: 4,
          purchases_days_behind: 4,
          sales_is_stale: true,
          inventory_is_stale: true,
          purchases_are_stale: true,
        },
        business_timezone: "America/Bogota",
        history: [],
        model_version: "run_rate_v2_rolling90_bt",
        drivers: ["rolling_90d_daily_rate"],
        rate_basis: "rolling_90d_complete",
        rate_window: { start: "2026-06-03", end: "2026-08-31", days_with_sales: 73 },
        backtest_accuracy: {
          confidence: "low",
          sample_months: 3,
          median_absolute_error_pct: 75.5,
          note: "Calibrado con 3 meses cerrados; error absoluto mediano 75.5%. Usa la proyección como orientación.",
        },
      },
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as ReturnType<typeof useSalesForecastMonthly>);
  });

  it("explains a low confidence forecast using actual backtest accuracy", () => {
    render(<ProyeccionTab />);

    expect(screen.getByText(/Confianza baja según backtest/)).toHaveTextContent("3 meses cerrados");
    expect(screen.getByText(/Confianza baja según backtest/)).toHaveTextContent("75.5%");
    expect(screen.getByText(/Escenario con stock: confianza baja y sin backtest/)).toBeInTheDocument();
    expect(screen.getByText(/Stock ajustado — Sep 2026/)).toBeInTheDocument();
    expect(screen.getAllByText(/confianza baja/).length).toBeGreaterThan(2);
    expect(screen.getAllByRole("cell", { name: "Base baja · stock baja" })).toHaveLength(2);
  });
});
