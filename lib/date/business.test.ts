import { describe, expect, it } from "vitest";
import { businessDateISO, businessMonthISO, shiftDateISO } from "./business";

describe("business calendar", () => {
  it("uses America/Bogota instead of the UTC calendar day", () => {
    const beforeMidnightBogota = new Date("2026-07-18T04:30:00.000Z");
    const afterMidnightBogota = new Date("2026-07-18T05:30:00.000Z");

    expect(businessDateISO(beforeMidnightBogota)).toBe("2026-07-17");
    expect(businessDateISO(afterMidnightBogota)).toBe("2026-07-18");
    expect(businessMonthISO(afterMidnightBogota)).toBe("2026-07");
  });

  it("shifts date-only values without crossing through the browser timezone", () => {
    expect(shiftDateISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftDateISO("2026-12-31", 1)).toBe("2027-01-01");
  });
});
