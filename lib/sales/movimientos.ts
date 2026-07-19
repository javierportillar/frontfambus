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
