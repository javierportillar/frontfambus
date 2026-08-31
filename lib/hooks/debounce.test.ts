import { afterEach, describe, expect, it, vi } from "vitest";
import { createDebouncedAction } from "./debounce";

describe("createDebouncedAction", () => {
  afterEach(() => vi.useRealTimers());

  it("publishes only the latest value after the delay", () => {
    vi.useFakeTimers();
    const published: string[] = [];
    const action = createDebouncedAction((value: string) => published.push(value), 300);

    action.schedule("BASE");
    vi.advanceTimersByTime(200);
    action.schedule("BASE MANIGUE");
    vi.advanceTimersByTime(299);
    expect(published).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(published).toEqual(["BASE MANIGUE"]);
  });

  it("cancels pending work on cleanup", () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const action = createDebouncedAction(publish, 300);
    action.schedule("query");
    action.cancel();
    vi.runAllTimers();
    expect(publish).not.toHaveBeenCalled();
  });
});
