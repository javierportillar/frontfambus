import { describe, expect, it } from "vitest";
import {
  MAX_CUSTOMER_ID_LENGTH,
  customerProfileHref,
  isValidCustomerId,
  productHref,
  salesDayHref,
} from "./routes";

describe("customer routes", () => {
  it("accepts opaque customer identifiers within the backend bound", () => {
    expect(isValidCustomerId("1085320887")).toBe(true);
    expect(isValidCustomerId("NIT-900.123")).toBe(true);
    expect(isValidCustomerId(` ${"a".repeat(MAX_CUSTOMER_ID_LENGTH)} `)).toBe(true);
  });

  it("rejects empty, oversized and traversal identifiers", () => {
    expect(isValidCustomerId("")).toBe(false);
    expect(isValidCustomerId("   ")).toBe(false);
    expect(isValidCustomerId(".")).toBe(false);
    expect(isValidCustomerId("..")).toBe(false);
    expect(isValidCustomerId("a".repeat(MAX_CUSTOMER_ID_LENGTH + 1))).toBe(false);
    expect(isValidCustomerId("bad\u0000id")).toBe(false);
  });

  it("encodes opaque identifiers and deep links", () => {
    expect(customerProfileHref("1085320887")).toBe("/dashboards/clientes/1085320887");
    expect(customerProfileHref("NIT/900")).toBe("/dashboards/clientes/NIT%2F900");
    expect(salesDayHref("2026-10-12")).toBe("/dashboards/ventas/dia/2026-10-12");
    expect(productHref("SKU 1")).toBe("/dashboards/productos/SKU%201");
  });
});
