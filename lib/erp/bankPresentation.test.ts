import { describe, expect, it } from "vitest";
import {
  formatBankWindow,
  formatSpanishDayMonth,
  formatSpanishLongDate,
  reviewedMovementsNote,
  etiquetaPasoProgreso,
  LABELS_POR_PASO,
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

  it("devuelve etiquetas claras para los pasos granulares del scraper", () => {
    expect(etiquetaPasoProgreso("credencial_lista")).toBe("Preparando credencial…");
    expect(etiquetaPasoProgreso("navegador_abierto")).toBe("Abriendo navegador…");
    expect(etiquetaPasoProgreso("escribiendo_credenciales")).toBe("Ingresando credenciales…");
    expect(etiquetaPasoProgreso("validando_acceso")).toBe("Validando acceso en el banco…");
    expect(etiquetaPasoProgreso("sesion_iniciada")).toBe("Sesión del banco iniciada");
    expect(etiquetaPasoProgreso("buscando_cuenta")).toBe("Localizando cuenta…");
    expect(etiquetaPasoProgreso("cuenta_abierta")).toBe("Cuenta seleccionada");
    expect(etiquetaPasoProgreso("cargando_movimientos")).toBe("Cargando movimientos…");
    expect(etiquetaPasoProgreso("movimientos_leidos")).toBe("Movimientos bancarios leídos");
    expect(etiquetaPasoProgreso("buscando_el_pago")).toBe("Buscando coincidencia del pago…");
    expect(etiquetaPasoProgreso(null)).toBe("Consultando el banco…");
    expect(etiquetaPasoProgreso(undefined)).toBe("Consultando el banco…");
    expect(etiquetaPasoProgreso("paso_desconocido")).toBe("Consultando el banco…");
  });
});
