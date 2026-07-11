import { describe, expect, it } from "vitest";
import { daysUntilExpiry, getExpiryBand } from "./expiry";

describe("expiry policy", () => {
  it("uses calendar days instead of a local-time timestamp", () => {
    expect(daysUntilExpiry("2026-07-12", new Date(2026, 6, 11, 23, 59))).toBe(1);
  });

  it.each([
    [-1, "expired"],
    [0, "critical"],
    [30, "critical"],
    [31, "warning"],
    [90, "warning"],
    [91, "normal"],
  ] as const)("classifies %i days as %s", (days, expected) => {
    expect(getExpiryBand(days).band).toBe(expected);
  });
});
