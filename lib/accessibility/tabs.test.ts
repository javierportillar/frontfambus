import { describe, expect, it } from "vitest";
import { nextTabIndex } from "./tabs";

describe("ARIA tab keyboard navigation", () => {
  it("moves right and wraps from the last tab", () => {
    expect(nextTabIndex(1, 4, "ArrowRight")).toBe(2);
    expect(nextTabIndex(3, 4, "ArrowRight")).toBe(0);
  });

  it("moves left and wraps from the first tab", () => {
    expect(nextTabIndex(2, 4, "ArrowLeft")).toBe(1);
    expect(nextTabIndex(0, 4, "ArrowLeft")).toBe(3);
  });

  it("supports Home and End without consuming unrelated keys", () => {
    expect(nextTabIndex(2, 4, "Home")).toBe(0);
    expect(nextTabIndex(1, 4, "End")).toBe(3);
    expect(nextTabIndex(1, 4, "Tab")).toBeNull();
  });
});
