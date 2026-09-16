import { describe, expect, it } from "vitest";
import {
  clearPurchaseDayScroll,
  canRestorePurchaseDayScroll,
  getPurchaseDayStateKey,
  getPurchaseDocumentId,
  parsePurchaseDayState,
  readPurchaseDayState,
  saveExpandedPurchaseDocuments,
  savePurchaseDayNavigation,
} from "./dayDetailState";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("purchase day detail state", () => {
  it("defaults to every document being closed when there is no saved state", () => {
    expect(parsePurchaseDayState(null)).toEqual({ expandedDocumentIds: [] });
  });

  it("isolates state by tenant and date", () => {
    expect(getPurchaseDayStateKey("motoshop", "2026-08-31")).not.toBe(
      getPurchaseDayStateKey("masvital", "2026-08-31"),
    );
    expect(getPurchaseDayStateKey("motoshop", "2026-08-31")).not.toBe(
      getPurchaseDayStateKey("motoshop", "2026-08-30"),
    );
  });

  it("keeps document identity stable when the supplier name changes", () => {
    const document = {
      num_documento: "FC-100",
      cod_clase: "FC",
    };
    const renamed = { ...document, nombre_proveedor: "Nuevo nombre" };
    const supplierChanged = { ...document, nit_proveedor: "900456" };

    expect(getPurchaseDocumentId(document)).toBe(
      getPurchaseDocumentId(renamed),
    );
    expect(getPurchaseDocumentId(document)).toBe(
      getPurchaseDocumentId(supplierChanged),
    );
  });

  it("keeps composite identity stable across reordering and unrelated insertion", () => {
    const target = { num_documento: "FC-100", cod_clase: "FC" };
    const other = { num_documento: "FC-101", cod_clase: "FC" };
    const inserted = { num_documento: "FC-099", cod_clase: "NC" };

    const before = [target, other].map(getPurchaseDocumentId);
    const after = [inserted, other, target].map(getPurchaseDocumentId);

    expect(after[2]).toBe(before[0]);
    expect(getPurchaseDocumentId(target)).not.toBe(
      getPurchaseDocumentId({ ...target, cod_clase: "NC" }),
    );
  });

  it("falls back to closed documents for corrupt storage", () => {
    expect(parsePurchaseDayState("{not-json")).toEqual({
      expandedDocumentIds: [],
    });
    expect(
      parsePurchaseDayState(JSON.stringify({ expandedDocumentIds: [1, null] })),
    ).toEqual({
      expandedDocumentIds: [],
    });
  });

  it("persists expanded documents immediately and preserves a pending scroll", () => {
    const key = getPurchaseDayStateKey("motoshop", "2026-08-31");
    const storage = createStorage();
    savePurchaseDayNavigation(storage, key, ["doc-1"], 720);

    saveExpandedPurchaseDocuments(storage, key, ["doc-2"]);

    expect(readPurchaseDayState(storage, key)).toEqual({
      expandedDocumentIds: ["doc-2"],
      scrollY: 720,
    });
  });

  it("saves expanded state and scroll synchronously before product navigation", () => {
    const key = getPurchaseDayStateKey("motoshop", "2026-08-31");
    const writes: string[] = [];
    const storage = {
      getItem: () => null,
      setItem: (_key: string, value: string) => writes.push(value),
    };

    savePurchaseDayNavigation(storage, key, ["doc-1", "doc-2"], 360);

    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!)).toEqual({
      expandedDocumentIds: ["doc-1", "doc-2"],
      scrollY: 360,
    });
  });

  it("restores saved expanded state and sanitizes duplicate identifiers", () => {
    const key = getPurchaseDayStateKey("motoshop", "2026-08-31");
    const storage = createStorage({
      [key]: JSON.stringify({
        expandedDocumentIds: ["doc-1", "doc-1"],
        scrollY: 120,
      }),
    });

    expect(readPurchaseDayState(storage, key)).toEqual({
      expandedDocumentIds: ["doc-1"],
      scrollY: 120,
    });
  });

  it("consumes only the scroll position after it is restored", () => {
    const key = getPurchaseDayStateKey("motoshop", "2026-08-31");
    const storage = createStorage();
    savePurchaseDayNavigation(storage, key, ["doc-1"], 480);

    clearPurchaseDayScroll(storage, key);

    expect(readPurchaseDayState(storage, key)).toEqual({
      expandedDocumentIds: ["doc-1"],
    });
  });

  it("keeps scroll pending through validation and error, then allows current data", () => {
    const tenantBKey = getPurchaseDayStateKey("tenant-b", "2026-08-31");
    const storage = createStorage();
    savePurchaseDayNavigation(storage, tenantBKey, ["doc-b"], 640);

    const retainedDataReady = canRestorePurchaseDayScroll({
      dataDate: "2026-08-31",
      requestedDate: "2026-08-31",
      isValidating: true,
      hasError: false,
      storageKey: tenantBKey,
      loadedStorageKey: tenantBKey,
      scrollY: readPurchaseDayState(storage, tenantBKey).scrollY,
    });
    expect(retainedDataReady).toBe(false);
    expect(readPurchaseDayState(storage, tenantBKey).scrollY).toBe(640);

    const failedDataReady = canRestorePurchaseDayScroll({
      dataDate: "2026-08-31",
      requestedDate: "2026-08-31",
      isValidating: false,
      hasError: true,
      storageKey: tenantBKey,
      loadedStorageKey: tenantBKey,
      scrollY: readPurchaseDayState(storage, tenantBKey).scrollY,
    });
    expect(failedDataReady).toBe(false);
    expect(readPurchaseDayState(storage, tenantBKey).scrollY).toBe(640);

    const tenantBDataReady = canRestorePurchaseDayScroll({
      dataDate: "2026-08-31",
      requestedDate: "2026-08-31",
      isValidating: false,
      hasError: false,
      storageKey: tenantBKey,
      loadedStorageKey: tenantBKey,
      scrollY: readPurchaseDayState(storage, tenantBKey).scrollY,
    });
    expect(tenantBDataReady).toBe(true);
    clearPurchaseDayScroll(storage, tenantBKey);
    expect(readPurchaseDayState(storage, tenantBKey)).toEqual({
      expandedDocumentIds: ["doc-b"],
    });
  });

  it("rejects data from a different requested date", () => {
    expect(
      canRestorePurchaseDayScroll({
        dataDate: "2026-08-30",
        requestedDate: "2026-08-31",
        isValidating: false,
        hasError: false,
        storageKey: "key",
        loadedStorageKey: "key",
        scrollY: 100,
      }),
    ).toBe(false);
  });
});
