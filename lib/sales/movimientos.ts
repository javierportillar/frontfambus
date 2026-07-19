import { shiftMonthISO } from "../date/business";

export interface SalesSelectionState {
  scopeKey: string | null;
  selectedDate: string;
  selectedMonth: string;
  followLatest: boolean;
  followBusinessMonth: boolean;
}

interface SalesSnapshot {
  scopeKey: string;
  maxDate: string;
  businessMonth: string;
}

/**
 * Reconciles server freshness with explicit user intent. A tenant/month scope
 * change starts at the latest snapshot; ordinary refreshes only advance fields
 * that the user has not moved into historical mode.
 */
export function syncSalesSelection(
  state: SalesSelectionState,
  snapshot: SalesSnapshot,
): SalesSelectionState {
  if (state.scopeKey !== snapshot.scopeKey) {
    return {
      scopeKey: snapshot.scopeKey,
      selectedDate: snapshot.maxDate,
      selectedMonth: snapshot.businessMonth,
      followLatest: true,
      followBusinessMonth: true,
    };
  }

  return {
    ...state,
    selectedDate: state.followLatest ? snapshot.maxDate : state.selectedDate,
    selectedMonth: state.followBusinessMonth ? snapshot.businessMonth : state.selectedMonth,
  };
}

export function selectSalesDate(
  state: SalesSelectionState,
  date: string,
  maxDate: string,
): SalesSelectionState {
  return { ...state, selectedDate: date, followLatest: date === maxDate };
}

export function selectSalesMonth(
  state: SalesSelectionState,
  month: string,
  businessMonth: string,
): SalesSelectionState {
  return {
    ...state,
    selectedMonth: month,
    followBusinessMonth: month === businessMonth,
  };
}

export type ForecastPointKind = "backtest" | "current" | "next";

interface ForecastMonthValue {
  month: string;
  projected_amount: number;
}

interface AnnualForecastInput {
  current_month: ForecastMonthValue;
  next_month: ForecastMonthValue;
  history?: ForecastMonthValue[];
}

export interface AnnualSalesRow {
  monthKey: string;
  label: string;
  prev: number | null;
  curr: number | null;
  proj: number | null;
  forecastKind: ForecastPointKind | null;
}

interface AnnualSalesSeriesInput {
  selectedMonth: string;
  businessMonth?: string;
  currentYearTotals: ReadonlyMap<number, number>;
  previousYearTotals: ReadonlyMap<number, number>;
  currentMonthActual: number;
  forecast?: AnnualForecastInput;
}

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function monthNumber(month: string): number {
  return Number(month.slice(5, 7));
}

function monthYear(month: string): number {
  return Number(month.slice(0, 4));
}

function rowLabel(month: string, selectedYear: number): string {
  const label = MONTH_LABELS[monthNumber(month) - 1] ?? month;
  return monthYear(month) === selectedYear ? label : `${label} ${monthYear(month)}`;
}

export function forecastKindLabel(kind: ForecastPointKind | null): string {
  if (kind === "backtest") return "Backtest del mes cerrado";
  if (kind === "current") return "Proyección de cierre";
  if (kind === "next") return "Proyección futura";
  return "Proyección";
}

export function buildAnnualSalesSeries({
  selectedMonth,
  businessMonth,
  currentYearTotals,
  previousYearTotals,
  currentMonthActual,
  forecast,
}: AnnualSalesSeriesInput): AnnualSalesRow[] {
  const selectedYear = monthYear(selectedMonth);
  const selectedMonthNumber = monthNumber(selectedMonth);
  const forecastApplies = Boolean(forecast && selectedMonth === businessMonth);
  const previousForecastMonth = shiftMonthISO(selectedMonth, -1);
  const nextForecastMonth = shiftMonthISO(selectedMonth, 1);
  const backtest = forecastApplies
    ? forecast?.history?.find((item) => item.month === previousForecastMonth)
    : undefined;

  const monthKeys = Array.from({ length: 12 }, (_, index) => `${selectedYear}-${String(index + 1).padStart(2, "0")}`);
  if (backtest && monthYear(previousForecastMonth) !== selectedYear) {
    monthKeys.unshift(previousForecastMonth);
  }
  if (
    forecastApplies &&
    forecast?.next_month.month === nextForecastMonth &&
    monthYear(nextForecastMonth) !== selectedYear
  ) {
    monthKeys.push(nextForecastMonth);
  }

  return monthKeys.map((monthKey) => {
    const rowYear = monthYear(monthKey);
    const rowMonth = monthNumber(monthKey);
    let proj: number | null = null;
    let forecastKind: ForecastPointKind | null = null;

    if (forecastApplies && backtest?.month === monthKey) {
      proj = backtest.projected_amount;
      forecastKind = "backtest";
    } else if (forecastApplies && forecast?.current_month.month === monthKey) {
      proj = forecast.current_month.projected_amount;
      forecastKind = "current";
    } else if (forecastApplies && forecast?.next_month.month === monthKey) {
      proj = forecast.next_month.projected_amount;
      forecastKind = "next";
    }

    return {
      monthKey,
      label: rowLabel(monthKey, selectedYear),
      prev: rowYear === selectedYear ? previousYearTotals.get(rowMonth) ?? null : null,
      curr: rowYear !== selectedYear
        ? null
        : rowMonth < selectedMonthNumber
          ? currentYearTotals.get(rowMonth) ?? null
          : rowMonth === selectedMonthNumber
            ? currentMonthActual
            : null,
      proj,
      forecastKind,
    };
  });
}
