import { describe, expect, it } from "vitest";
import { getCatalogViewState, normalizeCatalogQuery } from "./catalogSearch";

describe("catalog search state", () => {
  it("trims and collapses whitespace without changing user casing", () => {
    expect(normalizeCatalogQuery("  BASE   MANIGUE  ")).toBe("BASE MANIGUE");
  });

  it.each([
    [{ hasData: false, isLoading: true, isQueryPending: false, hasError: false }, "loading"],
    [{ hasData: true, isLoading: true, isQueryPending: false, hasError: false }, "searching"],
    [{ hasData: true, isLoading: false, isQueryPending: true, hasError: false }, "searching"],
    [{ hasData: false, isLoading: false, isQueryPending: false, hasError: true }, "error"],
    [{ hasData: true, isLoading: false, isQueryPending: false, hasError: false }, "ready"],
  ] as const)("returns the deterministic state %#", (input, expected) => {
    expect(getCatalogViewState(input)).toBe(expected);
  });
});
