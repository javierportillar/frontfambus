import { describe, expect, it } from "vitest";
import {
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
