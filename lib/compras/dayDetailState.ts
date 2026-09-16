const PURCHASE_DAY_STATE_PREFIX = "motoshop:purchases-day-detail:v1";

export interface PurchaseDayState {
  expandedDocumentIds: string[];
  scrollY?: number;
}

interface PurchaseDocumentIdentity {
  num_documento: string;
  cod_clase: string;
}

type SessionStorageLike = Pick<Storage, "getItem" | "setItem">;

export function getPurchaseDaySessionStorage(): SessionStorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getPurchaseDayStateKey(tenant: string, date: string): string {
  return `${PURCHASE_DAY_STATE_PREFIX}:${encodeURIComponent(tenant)}:${encodeURIComponent(date)}`;
}

/**
 * The grouped endpoint guarantees one document per (num_documento, cod_clase).
 * A duplicate composite is an API contract violation, not a UI identity problem.
 */
export function getPurchaseDocumentId(doc: PurchaseDocumentIdentity): string {
  return JSON.stringify([doc.num_documento, doc.cod_clase]);
}

interface ScrollRestoreReadiness {
  dataDate?: string;
  requestedDate: string;
  isValidating: boolean;
  hasError: boolean;
  storageKey: string | null;
  loadedStorageKey: string | null;
  scrollY?: number;
}

export function canRestorePurchaseDayScroll({
  dataDate,
  requestedDate,
  isValidating,
  hasError,
  storageKey,
  loadedStorageKey,
  scrollY,
}: ScrollRestoreReadiness): boolean {
  return (
    dataDate === requestedDate &&
    !isValidating &&
    !hasError &&
    storageKey !== null &&
    loadedStorageKey === storageKey &&
    scrollY !== undefined
  );
}

export function parsePurchaseDayState(raw: string | null): PurchaseDayState {
  if (!raw) return { expandedDocumentIds: [] };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object")
      return { expandedDocumentIds: [] };

    const candidate = parsed as Partial<PurchaseDayState>;
    const expandedDocumentIds = Array.isArray(candidate.expandedDocumentIds)
      ? [
          ...new Set(
            candidate.expandedDocumentIds.filter(
              (id): id is string => typeof id === "string",
            ),
          ),
        ]
      : [];
    const scrollY =
      typeof candidate.scrollY === "number" &&
      Number.isFinite(candidate.scrollY) &&
      candidate.scrollY >= 0
        ? candidate.scrollY
        : undefined;

    return scrollY === undefined
      ? { expandedDocumentIds }
      : { expandedDocumentIds, scrollY };
  } catch {
    return { expandedDocumentIds: [] };
  }
}

export function readPurchaseDayState(
  storage: SessionStorageLike,
  key: string,
): PurchaseDayState {
  try {
    return parsePurchaseDayState(storage.getItem(key));
  } catch {
    return { expandedDocumentIds: [] };
  }
}

function writePurchaseDayState(
  storage: SessionStorageLike,
  key: string,
  state: PurchaseDayState,
): void {
  try {
    storage.setItem(key, JSON.stringify(state));
  } catch {
    // The page remains usable when storage is unavailable or full.
  }
}

export function saveExpandedPurchaseDocuments(
  storage: SessionStorageLike,
  key: string,
  expandedDocumentIds: Iterable<string>,
): void {
  const previous = readPurchaseDayState(storage, key);
  writePurchaseDayState(storage, key, {
    expandedDocumentIds: [...expandedDocumentIds],
    ...(previous.scrollY === undefined ? {} : { scrollY: previous.scrollY }),
  });
}

export function savePurchaseDayNavigation(
  storage: SessionStorageLike,
  key: string,
  expandedDocumentIds: Iterable<string>,
  scrollY: number,
): void {
  writePurchaseDayState(storage, key, {
    expandedDocumentIds: [...expandedDocumentIds],
    scrollY: Number.isFinite(scrollY) && scrollY >= 0 ? scrollY : 0,
  });
}

export function clearPurchaseDayScroll(
  storage: SessionStorageLike,
  key: string,
): void {
  const { expandedDocumentIds } = readPurchaseDayState(storage, key);
  writePurchaseDayState(storage, key, { expandedDocumentIds });
}
