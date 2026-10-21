import { describe, expect, it } from "vitest";
import { toErpApiError } from "./errors";
import {
  barcodeFieldError,
  mapErpErrorToForm,
  masterNotice,
  priceFieldError,
  unitFieldError,
} from "./fieldErrors";

/**
 * Contrato congelado (spec erp-masters-write): el 422 aggregate nombra TODOS
 * los campos ofendidos y el 422 de maestro inactivo trae `master_state`.
 */

describe("mapErpErrorToForm — 422 aggregate", () => {
  it("mapea cada campo ofendido a su mensaje", () => {
    const error = toErpApiError(422, {
      detail: {
        message: "Tercero con datos no válidos",
        fields: {
          nitter: "Identificación (nitter) requerida",
          dirter: "Dirección requerida por el maestro heredado",
          telter: "Teléfono requerido por el maestro heredado",
        },
      },
    });

    const state = mapErpErrorToForm(error);

    expect(state.message).toBe("Tercero con datos no válidos");
    expect(state.fields).toEqual({
      nitter: "Identificación (nitter) requerida",
      dirter: "Dirección requerida por el maestro heredado",
      telter: "Teléfono requerido por el maestro heredado",
    });
    expect(state.notice).toBeNull();
    expect(state.forbidden).toBe(false);
  });

  it("normaliza las claves de las sub-colecciones a la notación con corchetes", () => {
    const error = toErpApiError(422, {
      detail: [
        { loc: ["body", "prices", 0, "pvconi"], msg: "Input should be a valid decimal" },
        { loc: ["body", "units", 1, "facumed"], msg: "Input should be greater than 0" },
      ],
    });

    const state = mapErpErrorToForm(error);

    expect(state.fields["prices[0].pvconi"]).toBe("Input should be a valid decimal");
    expect(state.fields["units[1].facumed"]).toBe("Input should be greater than 0");
  });
});

describe("mapErpErrorToForm — 422 maestro inactivo (bloqueado por cartera)", () => {
  const error = toErpApiError(422, {
    detail: {
      message: "Tercero '900123456' bloqueado por cartera (cupblo='B')",
      code: "master_inactive",
      fields: { nitter: "master_inactive" },
      master_state: { nitter: "900123456", cupblo: "B" },
    },
  });

  it("traduce el código opaco al motivo real", () => {
    const state = mapErpErrorToForm(error);

    expect(state.notice?.kind).toBe("blocked");
    expect(state.notice?.label).toBe("bloqueado por cartera");
    expect(state.notice?.field).toBe("nitter");
    expect(state.fields.nitter).toBe("El tercero está bloqueado por cartera (cupblo='B').");
    expect(state.message).toBe("Tercero '900123456' bloqueado por cartera (cupblo='B')");
  });
});

describe("mapErpErrorToForm — 422 maestro inactivo (inactivo)", () => {
  it("traduce inater='SI' a inactivo", () => {
    const error = toErpApiError(422, {
      detail: {
        message: "Tercero '900123456' inactivo (inater='SI')",
        code: "master_inactive",
        fields: { nitter: "master_inactive" },
        master_state: { nitter: "900123456", inater: "SI" },
      },
    });

    const state = mapErpErrorToForm(error);

    expect(state.notice?.kind).toBe("inactive");
    expect(state.notice?.label).toBe("inactivo");
    expect(state.fields.nitter).toBe("El tercero está inactivo (inater='SI').");
  });

  it("traduce actprod != 'A' a producto inactivo", () => {
    const error = toErpApiError(422, {
      detail: {
        message: "Producto 'P001' inactivo (actprod='I')",
        code: "master_inactive",
        fields: { codprod: "master_inactive" },
        master_state: { codprod: "P001", actprod: "I" },
      },
    });

    const state = mapErpErrorToForm(error);

    expect(state.notice?.kind).toBe("inactive");
    expect(state.notice?.field).toBe("codprod");
    expect(state.fields.codprod).toBe("El producto está inactivo (actprod='I').");
  });
});

describe("mapErpErrorToForm — 409 duplicado y 403 sin permiso", () => {
  it("deja el campo en conflicto disponible para pintarlo", () => {
    const error = toErpApiError(409, {
      detail: { message: "Ya existe un registro con nitter = '900123456'", field: "nitter" },
    });

    const state = mapErpErrorToForm(error);

    expect(state.fields.nitter).toBe("Ya existe un registro con nitter = '900123456'");
    expect(state.forbidden).toBe(false);
  });

  it("marca el 403 como falta de permiso", () => {
    const error = toErpApiError(403, { detail: "No tenés permisos para esta operación." });

    expect(mapErpErrorToForm(error).forbidden).toBe(true);
  });
});

describe("masterNotice", () => {
  it("devuelve null cuando el maestro está vigente", () => {
    expect(masterNotice({ nitter: "1", inater: "NO", cupblo: "R" })).toBeNull();
    expect(masterNotice(undefined)).toBeNull();
  });

  it("prioriza el bloqueo por cartera sobre la inactividad", () => {
    const notice = masterNotice({ nitter: "1", inater: "SI", cupblo: "B" });

    expect(notice?.kind).toBe("blocked");
  });
});

describe("errores por fila de las sub-colecciones", () => {
  const fields = {
    "prices[1].pvconi": "Inconsistente con pvsini × (1+19%)",
    pvsini: "Se requiere pvsini (exclusivo) o pvconi (incluido)",
    "units[0].facumed": "Input should be greater than 0",
    "barcodes[2].codbar": "Too short",
  };

  it("usa la clave indexada cuando existe", () => {
    expect(priceFieldError(fields, 1, "pvconi")).toBe("Inconsistente con pvsini × (1+19%)");
    expect(unitFieldError(fields, 0, "facumed")).toBe("Input should be greater than 0");
    expect(barcodeFieldError(fields, 2, "codbar")).toBe("Too short");
  });

  it("cae en la clave global cuando el backend no indexa el error", () => {
    expect(priceFieldError(fields, 0, "pvsini")).toBe("Se requiere pvsini (exclusivo) o pvconi (incluido)");
    expect(priceFieldError(fields, 0, "pvconi")).toBeUndefined();
  });
});
