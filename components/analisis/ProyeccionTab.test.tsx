import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSalesForecastMonthly } from "@/lib/api/hooks";
import { ProyeccionTab } from "./ProyeccionTab";

vi.mock("@/lib/api/hooks", () => ({ useSalesForecastMonthly: vi.fn() }));

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

    expect(screen.getByRole("status")).toHaveTextContent("Confianza baja según backtest");
    expect(screen.getByRole("status")).toHaveTextContent("3 meses cerrados");
    expect(screen.getByRole("status")).toHaveTextContent("75.5%");
    expect(screen.getAllByText(/confianza baja/)).toHaveLength(2);
    expect(screen.getAllByRole("cell", { name: "baja" })).toHaveLength(2);
  });
});
