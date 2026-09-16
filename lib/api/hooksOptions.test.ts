import { describe, expect, it } from "vitest";
import {
  PURCHASES_DAY_METRICS_OPTIONS,
  resolveMetricsKeepPreviousData,
} from "./hooks";

describe("metrics previous-data policy", () => {
  it("keeps previous data by default for existing metrics views", () => {
    expect(resolveMetricsKeepPreviousData()).toBe(true);
  });

  it("opts the grouped purchases-day hook out of previous data", () => {
    expect(PURCHASES_DAY_METRICS_OPTIONS.keepPreviousData).toBe(false);
    expect(resolveMetricsKeepPreviousData(PURCHASES_DAY_METRICS_OPTIONS)).toBe(
      false,
    );
  });
});
