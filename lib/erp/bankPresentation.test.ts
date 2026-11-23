import { describe, expect, it } from "vitest";
import {
  formatBankWindow,
  formatSpanishDayMonth,
  formatSpanishLongDate,
  reviewedMovementsNote,
  etiquetaPasoProgreso,
  LABELS_POR_PASO,
  diasAtras,
  valorVerificacionFactura,
  puedeVerificarPago,
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

  it("calcula el valor a verificar en facturas simples y con pagos mixtos", () => {
    // Factura 100% transferencia
    expect(
      valorVerificacionFactura({
        total: 118000,
        cod_formapago: "F07",
        nombre_formapago: "Transferencia Banco",
        valor_transferencia: 118000,
        pagos: [
          {
            cod_formapago: "F07",
            nombre_formapago: "Transferencia Banco",
            valor: 118000,
            es_transferencia: true,
          },
        ],
      })
    ).toBe(118000);

    // Factura con pago mixto ($157.300 total = $39.300 efectivo + $118.000 transferencia)
    expect(
      valorVerificacionFactura({
        total: 157300,
        cod_formapago: "F01",
        nombre_formapago: "Efectivo",
        valor_transferencia: 118000,
        pagos: [
          {
            cod_formapago: "F01",
            nombre_formapago: "Efectivo",
            valor: 39300,
            es_transferencia: false,
          },
          {
            cod_formapago: "F07",
            nombre_formapago: "Transferencia Banco",
            valor: 118000,
            es_transferencia: true,
          },
        ],
      })
    ).toBe(118000);

    // Factura con pagos mixtos pero sin valor_transferencia precargado (lo encuentra en pagos)
    expect(
      valorVerificacionFactura({
        total: 200000,
        cod_formapago: "F01",
        nombre_formapago: "Efectivo",
        pagos: [
          {
            cod_formapago: "F01",
            nombre_formapago: "Efectivo",
            valor: 50000,
            es_transferencia: false,
          },
          {
            cod_formapago: "F07",
            nombre_formapago: "Transferencia Banco",
            valor: 150000,
            es_transferencia: true,
          },
        ],
      })
    ).toBe(150000);

    // Factura sin pagos identificados como transferencia retorna total
    expect(
      valorVerificacionFactura({
        total: 50000,
        cod_formapago: "F01",
        nombre_formapago: "Efectivo",
        pagos: [
          {
            cod_formapago: "F01",
            nombre_formapago: "Efectivo",
            valor: 50000,
            es_transferencia: false,
          },
        ],
      })
    ).toBe(50000);
  });

  it("determina si puede verificarse una factura según fecha y métodos de pago", () => {
    const hoyIso = new Date().toISOString().slice(0, 10);

    // Factura 100% efectivo de hoy -> NO se puede verificar
    expect(
      puedeVerificarPago(
        {
          total: 50000,
          cod_formapago: "F01",
          nombre_formapago: "Efectivo",
          pagos: [
            {
              cod_formapago: "F01",
              nombre_formapago: "Efectivo",
              valor: 50000,
              es_transferencia: false,
            },
          ],
        },
        hoyIso
      )
    ).toBe(false);

    // Factura mixta con transferencia (cabecera Efectivo pero pago transferencia adentro) -> SÍ se puede verificar
    expect(
      puedeVerificarPago(
        {
          total: 157300,
          cod_formapago: "F01",
          nombre_formapago: "Efectivo",
          valor_transferencia: 118000,
          pagos: [
            {
              cod_formapago: "F01",
              nombre_formapago: "Efectivo",
              valor: 39300,
              es_transferencia: false,
            },
            {
              cod_formapago: "F07",
              nombre_formapago: "Transferencia Banco",
              valor: 118000,
              es_transferencia: true,
            },
          ],
        },
        hoyIso
      )
    ).toBe(true);

    // Factura de hace más de 3 días -> NO se puede verificar (banco no publica movimientos tan viejos en la vista rápida)
    const fechaVieja = "2020-01-01";
    expect(
      puedeVerificarPago(
        {
          total: 118000,
          cod_formapago: "F07",
          nombre_formapago: "Transferencia Banco",
          valor_transferencia: 118000,
          pagos: [
            {
              cod_formapago: "F07",
              nombre_formapago: "Transferencia Banco",
              valor: 118000,
              es_transferencia: true,
            },
          ],
        },
        fechaVieja
      )
    ).toBe(false);
  });
});
