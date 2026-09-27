import { describe, expect, it } from "vitest";
import {
  isValidBusinessDate,
  isValidSupplierNit,
  parsePurchaseDocumentEntityId,
  purchaseDocumentHrefFromEntityId,
} from "./routes";

describe("assistant purchase routes", () => {
  it("accepts real calendar dates and rejects impossible dates", () => {
    expect(isValidBusinessDate("2026-09-26")).toBe(true);
    expect(isValidBusinessDate("2026-02-29")).toBe(false);
    expect(isValidBusinessDate("2026/09/26")).toBe(false);
  });

  it("accepts numeric NITs with optional check digit formatting only", () => {
    expect(isValidSupplierNit("1143934745")).toBe(true);
    expect(isValidSupplierNit("900111111-1")).toBe(true);
    expect(isValidSupplierNit("900.123.456-7")).toBe(true);
    expect(isValidSupplierNit("bad-nit")).toBe(false);
    expect(isValidSupplierNit("900.123.-7")).toBe(false);
  });

  it("builds exact document destinations from date, class, and number", () => {
    const identity = "2026-09-26|FC/WEB|A/194";

    expect(parsePurchaseDocumentEntityId(identity)).toEqual({
      businessDate: "2026-09-26",
      classCode: "FC/WEB",
      documentNumber: "A/194",
    });
    expect(purchaseDocumentHrefFromEntityId(identity)).toBe(
      "/dashboards/compras/dia/2026-09-26/documento/A%2F194?cod_clase=FC%2FWEB",
    );
    expect(purchaseDocumentHrefFromEntityId("2026-02-30|FC|194")).toBeNull();
    expect(purchaseDocumentHrefFromEntityId("2026-09-26|FC|../194")).toBeNull();
  });
});
