import { describe, expect, it } from "vitest";
import {
  formatBankWindow,
  formatSpanishDayMonth,
  formatSpanishLongDate,
  reviewedMovementsNote,
} from "./bankPresentation";

describe("presentación de la verificación bancaria", () => {
  it("formatea el día y el mes en español", () => {
    expect(formatSpanishDayMonth("2026-10-22")).toBe("22 de octubre");
    expect(formatSpanishLongDate("2026-10-21")).toBe("21 de octubre de 2026");
  });

  it("usa los valores del resultado para la nota, sin hardcodear", () => {
    expect(
      reviewedMovementsNote(6, { desde: "2026-10-22", hasta: "2026-10-22" }),
    ).toBe("6 movimientos revisados del 22 de octubre");
    expect(
      reviewedMovementsNote(9, { desde: "2026-10-21", hasta: "2026-10-22" }),
    ).toBe("9 movimientos revisados del 21 de octubre al 22 de octubre");
  });

  it("tolera ventanas ausentes o incompletas", () => {
    expect(formatBankWindow(null)).toBe("");
    expect(reviewedMovementsNote(3, null)).toBe("3 movimientos revisados");
    expect(reviewedMovementsNote(undefined, null)).toBeNull();
  });
});
