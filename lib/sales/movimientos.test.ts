import { describe, expect, it } from "vitest";
import {
  buildAnnualSalesSeries,
  selectSalesDate,
  selectSalesMonth,
  syncSalesSelection,
  type SalesSelectionState,
} from "./movimientos";

const initialSelection: SalesSelectionState = {
  scopeKey: null,
  selectedDate: "",
  selectedMonth: "2026-07",
  followLatest: true,
  followBusinessMonth: true,
};

describe("sales selection", () => {
  it("advances a latest-following date when a newer snapshot arrives", () => {
    const first = syncSalesSelection(initialSelection, {
      scopeKey: "motoshop:2026-07",
      maxDate: "2026-07-17",
      businessMonth: "2026-07",
    });
    const next = syncSalesSelection(first, {
      scopeKey: "motoshop:2026-07",
      maxDate: "2026-07-18",
      businessMonth: "2026-07",
    });

    expect(next.selectedDate).toBe("2026-07-18");
    expect(next.followLatest).toBe(true);
  });

  it("does not hijack a historical date or month selected by the user", () => {
    const synced = syncSalesSelection(initialSelection, {
      scopeKey: "motoshop:2026-07",
      maxDate: "2026-07-17",
      businessMonth: "2026-07",
    });
    const historical = selectSalesDate(synced, "2026-07-10", "2026-07-17");
    const olderMonth = selectSalesMonth(historical, "2026-06", "2026-07");
    const refreshed = syncSalesSelection(olderMonth, {
      scopeKey: "motoshop:2026-07",
      maxDate: "2026-07-18",
      businessMonth: "2026-07",
    });

    expect(refreshed.selectedDate).toBe("2026-07-10");
    expect(refreshed.selectedMonth).toBe("2026-06");
  });

  it("resets to the latest business snapshot when the tenant or business month changes", () => {
    const historical: SalesSelectionState = {
      scopeKey: "motoshop:2026-07",
      selectedDate: "2026-06-03",
      selectedMonth: "2026-06",
      followLatest: false,
      followBusinessMonth: false,
    };

    const next = syncSalesSelection(historical, {
      scopeKey: "masvital:2026-08",
      maxDate: "2026-08-02",
      businessMonth: "2026-08",
    });

    expect(next).toMatchObject({
      selectedDate: "2026-08-02",
      selectedMonth: "2026-08",
      followLatest: true,
      followBusinessMonth: true,
    });
  });
});

describe("annual forecast series", () => {
  const forecast = {
    current_month: { month: "2026-07", projected_amount: 27_000_000 },
    next_month: { month: "2026-08", projected_amount: 26_000_000 },
    history: [
      { month: "2026-06", projected_amount: 28_000_000 },
    ],
  };

  it("builds the June → July → August forecast line by YYYY-MM", () => {
    const rows = buildAnnualSalesSeries({
      selectedMonth: "2026-07",
      businessMonth: "2026-07",
      currentYearTotals: new Map([[6, 24_000_000]]),
      previousYearTotals: new Map(),
      currentMonthActual: 16_000_000,
      forecast,
    });

    expect(rows.filter((row) => row.proj !== null).map((row) => [row.monthKey, row.proj, row.forecastKind])).toEqual([
      ["2026-06", 28_000_000, "backtest"],
      ["2026-07", 27_000_000, "current"],
      ["2026-08", 26_000_000, "next"],
    ]);
  });

  it("prepends December for a January forecast without confusing the year", () => {
    const rows = buildAnnualSalesSeries({
      selectedMonth: "2026-01",
      businessMonth: "2026-01",
      currentYearTotals: new Map(),
      previousYearTotals: new Map(),
      currentMonthActual: 5,
      forecast: {
        current_month: { month: "2026-01", projected_amount: 10 },
        next_month: { month: "2026-02", projected_amount: 11 },
        history: [{ month: "2025-12", projected_amount: 9 }],
      },
    });

    expect(rows.slice(0, 3).map((row) => [row.monthKey, row.proj])).toEqual([
      ["2025-12", 9],
      ["2026-01", 10],
      ["2026-02", 11],
    ]);
  });

  it("appends January of the next year for a December forecast", () => {
    const rows = buildAnnualSalesSeries({
      selectedMonth: "2026-12",
      businessMonth: "2026-12",
      currentYearTotals: new Map(),
      previousYearTotals: new Map(),
      currentMonthActual: 5,
      forecast: {
        current_month: { month: "2026-12", projected_amount: 10 },
        next_month: { month: "2027-01", projected_amount: 11 },
        history: [{ month: "2026-11", projected_amount: 9 }],
      },
    });

    expect(rows.slice(-3).map((row) => [row.monthKey, row.proj])).toEqual([
      ["2026-11", 9],
      ["2026-12", 10],
      ["2027-01", 11],
    ]);
  });

  it("leaves the previous point null when history is absent", () => {
    const rows = buildAnnualSalesSeries({
      selectedMonth: "2026-07",
      businessMonth: "2026-07",
      currentYearTotals: new Map(),
      previousYearTotals: new Map(),
      currentMonthActual: 5,
      forecast: {
        current_month: { month: "2026-07", projected_amount: 10 },
        next_month: { month: "2026-08", projected_amount: 11 },
      },
    });

    expect(rows.find((row) => row.monthKey === "2026-06")?.proj).toBeNull();
    expect(rows.filter((row) => row.proj !== null).map((row) => row.monthKey)).toEqual(["2026-07", "2026-08"]);
  });
});
