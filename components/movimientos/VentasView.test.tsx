import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useProductAbcMap,
  useSalesDailyMonth,
  useSalesForecastMonthly,
  useSalesHistorical,
  useSalesMonthDetail,
  useSalesMonthlyFor,
  useSalesSummaryV2,
  useSalesTrend,
  useSalesTrendByYear,
  useVendorDataFlag,
} from "@/lib/api/hooks";
import { businessMonthISO, shiftMonthISO } from "@/lib/date/business";
import { VentasView } from "./VentasView";

vi.mock("@/lib/api/hooks", () => ({
  useProductAbcMap: vi.fn(),
  useSalesDailyMonth: vi.fn(),
  useSalesForecastMonthly: vi.fn(),
  useSalesHistorical: vi.fn(),
  useSalesMonthDetail: vi.fn(),
  useSalesMonthlyFor: vi.fn(),
  useSalesSummaryV2: vi.fn(),
  useSalesTrend: vi.fn(),
  useSalesTrendByYear: vi.fn(),
  useVendorDataFlag: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({
  useAuthStore: (selector: (state: { currentTenant: string }) => unknown) =>
    selector({ currentTenant: "motoshop" }),
}));

vi.mock("recharts", () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const ForecastChart = ({ children, data }: { children?: ReactNode; data?: unknown[] }) => (
    <div data-testid="forecast-daily-chart" data-chart-data={JSON.stringify(data ?? [])}>
      {children}
    </div>
  );
  const Series = ({ dataKey }: { dataKey?: string }) => <span data-testid={`series-${dataKey}`} />;
  return {
    Bar: Series,
    BarChart: Container,
    CartesianGrid: Container,
    ComposedChart: ForecastChart,
    Line: Series,
    LineChart: Container,
    ResponsiveContainer: Container,
    Tooltip: Container,
    XAxis: Container,
    YAxis: Container,
  };
});

vi.mock("@/components/sales/CajaTab", () => ({ CajaTab: () => null }));
vi.mock("@/components/sales/DayDetailContent", () => ({ DayDetailContent: () => null }));
vi.mock("@/components/ventas/TopProductos", () => ({ MixAbc: () => null }));
vi.mock("@/components/ventas/HistoricaTab", () => ({ HistoricaTab: () => null }));
vi.mock("@/components/ventas/MargenMensualTable", () => ({ MargenMensualTable: () => null }));
vi.mock("@/components/ventas/ProductosVendidosTabla", () => ({ ProductosVendidosTabla: () => null }));

let forecastFixture: NonNullable<ReturnType<typeof useSalesForecastMonthly>["data"]>;

function swr<T>(data: T) {
  return {
    data,
    error: undefined,
    isLoading: false,
    isValidating: false,
    mutate: vi.fn(),
  };
}

describe("VentasView forecast chart", () => {
  beforeEach(() => {
    const currentMonth = businessMonthISO();
    const nextMonth = shiftMonthISO(currentMonth, 1);
    const previousMonth = shiftMonthISO(currentMonth, -1);
    const cutoff = `${previousMonth}-15`;

    vi.mocked(useSalesSummaryV2).mockReturnValue(swr({
      business_month: previousMonth,
      max_sales_date: cutoff,
      current_month_accumulated: 0,
      current_month_days_with_sales: 0,
      previous_month_same_window: { from: null, to: null, amount: 0, delta_pct: null },
      same_month_previous_years: [],
      ticket_promedio: 0,
      num_facturas: 0,
    }) as unknown as ReturnType<typeof useSalesSummaryV2>);

    const forecastData = {
      current_month: {
        month: currentMonth,
        observed_amount: 50,
        projected_amount: 3050,
        initial_forecast_amount: 3100,
        remaining_forecast_amount: 3000,
        forecast_origin_date: null,
        forecast_status: "issued",
        vintage_persisted: true,
        forecast_model_version: "weekday_week_of_month_v2",
        calibration_version: "daily-calibration-v1-calibrated-2026-09",
        daily_rate: 100,
        days_observed: 1,
        days_total: 31,
        confidence: "low",
      },
      next_month: {
        month: nextMonth,
        projected_amount: 3000,
        days_total: 30,
        last_year_same_month: 0,
        confidence: "low",
      },
      stock_adjusted: {
        current_month: { month: currentMonth, observed_amount: 50, projected_amount: 1404.8, days_total: 31 },
        next_month: { month: nextMonth, observed_amount: 0, projected_amount: 900, days_total: 30 },
        confidence: "low",
        confidence_note: "No stock history.",
        inventory_source: "purchase-sales estimate",
        no_future_replenishment: true,
        inventory_controlled_skus: 1,
        uncapped_service_skus: 0,
        insufficient_evidence_skus: 0,
      },
      daily_series: [
        {
          date: `${currentMonth}-01`,
          actual_amount: 50,
          base_projected_amount: 80,
          stock_adjusted_projected_amount: null,
        },
        {
          date: `${currentMonth}-02`,
          actual_amount: null,
          base_projected_amount: 100,
          stock_adjusted_projected_amount: 45.16,
        },
        {
          date: `${currentMonth}-03`,
          actual_amount: null,
          base_projected_amount: 75,
          stock_adjusted_projected_amount: 35,
        },
        {
          date: `${nextMonth}-01`,
          actual_amount: null,
          base_projected_amount: 100,
          stock_adjusted_projected_amount: 30,
        },
      ],
      daily_pattern: {
        method: "weekday_week_of_month",
        history_days: 90,
        days_with_sales: 60,
        seasonal_window_days: 365,
        note: "Distribución por día de semana y tramo del mes.",
      },
      calibration: {
        status: "calibrated",
        training_months: 6,
        holdout_months: 3,
        monthly_level_factor: 1.05,
        weekday_factors: [1, 1, 1, 1, 1, 1, 1],
        week_of_month_factors: [1, 1, 1, 1, 1],
        baseline_wape_pct: 18,
        calibrated_wape_pct: 15,
        last_training_month: "2026-09",
        note: "Evaluación cronológica.",
      },
      source_cutoffs: {
        sales_date: cutoff,
        inventory_date: cutoff,
        purchases_date: cutoff,
      },
      staleness: {
        as_of_date: `${currentMonth}-05`,
        sales_days_behind: 20,
        inventory_days_behind: 20,
        purchases_days_behind: 20,
        sales_is_stale: true,
        inventory_is_stale: true,
        purchases_are_stale: true,
      },
      business_timezone: "America/Bogota",
      model_version: "run_rate_v3_calendar_stock_scenario",
      drivers: [],
      rate_basis: "rolling_90d_complete",
      rate_window: { start: "2026-06-01", end: "2026-08-29", days_with_sales: 60 },
      backtest_accuracy: null,
      history: [],
    };
    forecastFixture = forecastData as NonNullable<ReturnType<typeof useSalesForecastMonthly>["data"]>;
    vi.mocked(useSalesForecastMonthly).mockReturnValue(swr(forecastData) as ReturnType<typeof useSalesForecastMonthly>);

    vi.mocked(useSalesDailyMonth).mockImplementation((month) => swr({
      month,
      days: month === previousMonth
        ? [{ date: `${previousMonth}-05`, day: 5, sales: 50, invoices: 1, avg_ticket: 50, accumulated: 50 }]
        : [],
      total_days_with_sales: month === previousMonth ? 1 : 0,
    }) as ReturnType<typeof useSalesDailyMonth>);
    vi.mocked(useSalesHistorical).mockReturnValue(swr({}) as unknown as ReturnType<typeof useSalesHistorical>);
    vi.mocked(useSalesTrend).mockReturnValue(swr({ items: [] }) as unknown as ReturnType<typeof useSalesTrend>);
    vi.mocked(useSalesTrendByYear).mockReturnValue(swr({ items: [] }) as unknown as ReturnType<typeof useSalesTrendByYear>);
    vi.mocked(useSalesMonthDetail).mockReturnValue(swr(undefined) as ReturnType<typeof useSalesMonthDetail>);
    vi.mocked(useSalesMonthlyFor).mockReturnValue(swr(undefined) as ReturnType<typeof useSalesMonthlyFor>);
    vi.mocked(useProductAbcMap).mockReturnValue(swr(undefined) as ReturnType<typeof useProductAbcMap>);
    vi.mocked(useVendorDataFlag).mockReturnValue(swr({ has_vendor_data: false, porcentaje_sin_vendedor: 0 }) as unknown as ReturnType<typeof useVendorDataFlag>);
  });

  it("shows the original forecast on elapsed and future days, but not for historical months", async () => {
    render(<VentasView />);
    fireEvent.click(screen.getByRole("button", { name: "Mensual" }));

    expect(await screen.findByTestId("series-baseForecast")).toBeInTheDocument();
    expect(screen.getByTestId("series-stockForecast")).toBeInTheDocument();
    expect(screen.getByText(/Ventas desactualizadas/)).toBeInTheDocument();
    expect(screen.getByText(/Pronóstico original del mes/)).toBeInTheDocument();
    expect(screen.getByText(/modelo weekday_week_of_month_v2/)).toBeInTheDocument();
    expect(screen.getByText(/Calibración diaria: ajustada con errores históricos/)).toBeInTheDocument();
    expect(screen.getByText(/WAPE 18.0% → 15.0%/)).toBeInTheDocument();
    expect(screen.getByText(/día de semana/)).toBeInTheDocument();

    const chart = screen.getByTestId("forecast-daily-chart");
    const chartData = JSON.parse(chart.getAttribute("data-chart-data") ?? "[]") as Array<{
      ventas: number | null;
      baseForecast: number | null;
      stockForecast: number | null;
    }>;
    expect(chartData[0]).toMatchObject({
      ventas: 50,
      baseForecast: 80,
      stockForecast: null,
    });
    expect(chartData[1]).toMatchObject({
      ventas: null,
      baseForecast: 100,
      stockForecast: 45.16,
    });
    expect(chartData[2]?.baseForecast).toBe(75);
    expect(chartData[2]?.baseForecast).not.toBe(chartData[1]?.baseForecast);
    expect(chartData[1]).not.toHaveProperty("acumulado");

    const monthPicker = screen.getByLabelText("Mes a analizar");
    fireEvent.change(monthPicker, { target: { value: shiftMonthISO(businessMonthISO(), 1) } });
    await waitFor(() => {
      expect(screen.getByTestId("series-baseForecast")).toBeInTheDocument();
      expect(screen.getByTestId("series-stockForecast")).toBeInTheDocument();
    });

    const historicalMonth = shiftMonthISO(businessMonthISO(), -1);
    fireEvent.change(monthPicker, { target: { value: historicalMonth } });

    await waitFor(() => {
      expect(screen.queryByTestId("series-baseForecast")).not.toBeInTheDocument();
      expect(screen.queryByTestId("series-stockForecast")).not.toBeInTheDocument();
      expect(screen.getByTestId("series-ventas")).toBeInTheDocument();
    });
  });

  it("warns when the current-month vintage could not be saved", async () => {
    forecastFixture.current_month.vintage_persisted = false;
    forecastFixture.current_month.forecast_status = "provisional";

    render(<VentasView />);
    fireEvent.click(screen.getByRole("button", { name: "Mensual" }));

    expect(await screen.findByText(/No se pudo guardar el vintage de forma permanente/)).toBeInTheDocument();
  });
});
