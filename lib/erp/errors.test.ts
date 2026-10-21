import { describe, expect, it } from "vitest";
import {
  ERP_ERROR_CODES,
  ErpApiError,
  normalizeFieldKey,
  parseErpErrorPayload,
  toErpApiError,
  toFormFieldErrors,
} from "./errors";

/**
 * Contrato congelado (spec erp-masters-write, `erp/masters/validators.py`):
 * el backend responde `{"detail": {...}}` y el 422 aggregate nombra TODOS los
 * campos ofendidos (no first-fail).
 */
describe("parseErpErrorPayload — 422 aggregate", () => {
  it("conserva el mensaje y todos los errores por campo", () => {
    const payload = parseErpErrorPayload(422, {
      detail: {
        message: "Tercero con datos no válidos",
        fields: {
          nitter: "Identificación (nitter) requerida",
          digter: "Dígito de verificación inválido para 900123456: esperado 8, recibido '3'",
        },
      },
    });

    expect(payload.message).toBe("Tercero con datos no válidos");
    expect(payload.fields).toEqual({
      nitter: "Identificación (nitter) requerida",
      digter: "Dígito de verificación inválido para 900123456: esperado 8, recibido '3'",
    });
    expect(Object.keys(payload.fields)).toHaveLength(2);
    expect(payload.code).toBeUndefined();
    expect(payload.masterState).toBeUndefined();
  });

  it("normaliza los errores de pydantic (loc) al esquema campo → motivo", () => {
    const payload = parseErpErrorPayload(422, {
      detail: [
        { loc: ["body", "codprod"], msg: "String should match pattern '^[\\d]+$'" },
        { loc: ["body", "prices", 0, "pvconi"], msg: "Input should be a valid decimal" },
      ],
    });

    expect(payload.message).toBe("Datos no válidos");
    expect(payload.fields).toEqual({
      codprod: "String should match pattern '^[\\d]+$'",
      "prices[0].pvconi": "Input should be a valid decimal",
    });
  });

  it("acumula varios errores del mismo campo en un solo mensaje", () => {
    const payload = parseErpErrorPayload(422, {
      detail: [
        { loc: ["body", "nitter"], msg: "Too short" },
        { loc: ["body", "nitter"], msg: "Does not match pattern" },
      ],
    });

    expect(payload.fields.nitter).toBe("Too short Does not match pattern");
  });
});

describe("parseErpErrorPayload — 422 maestro inactivo (contrato congelado)", () => {
  const body = {
    detail: {
      message: "Tercero '900123456' inactivo (inater='SI')",
      code: "master_inactive",
      fields: { nitter: "master_inactive" },
      master_state: { nitter: "900123456", inater: "SI" },
    },
  };

  it("expone el código, el campo y el estado del maestro", () => {
    const payload = parseErpErrorPayload(422, body);

    expect(payload.code).toBe(ERP_ERROR_CODES.masterInactive);
    expect(payload.fields).toEqual({ nitter: "master_inactive" });
    expect(payload.masterState).toEqual({ nitter: "900123456", inater: "SI" });
    expect(payload.message).toBe("Tercero '900123456' inactivo (inater='SI')");
  });

  it("marca el error como maestro inactivo", () => {
    const error = toErpApiError(422, body);

    expect(error).toBeInstanceOf(ErpApiError);
    expect(error.status).toBe(422);
    expect(error.isMasterInactive).toBe(true);
    expect(error.fieldErrors).toEqual([
      { field: "nitter", message: "master_inactive" },
    ]);
  });

  it("distingue un maestro bloqueado por cartera (cupblo)", () => {
    const error = toErpApiError(422, {
      detail: {
        message: "Tercero '900123456' bloqueado por cartera (cupblo='B')",
        code: "master_inactive",
        fields: { nitter: "master_inactive" },
        master_state: { nitter: "900123456", cupblo: "B" },
      },
    });

    expect(error.isMasterInactive).toBe(true);
    expect(error.masterState?.cupblo).toBe("B");
  });
});

describe("parseErpErrorPayload — 409 duplicado", () => {
  it("expone el campo en conflicto y lo deja en `fields`", () => {
    const payload = parseErpErrorPayload(409, {
      detail: {
        message: "Ya existe un registro con nitter = '900123456'",
        field: "nitter",
      },
    });

    expect(payload.conflictField).toBe("nitter");
    expect(payload.fields.nitter).toBe(
      "Ya existe un registro con nitter = '900123456'",
    );
  });
});

describe("parseErpErrorPayload — errores sin detalle estructurado", () => {
  it("usa el detail plano como mensaje", () => {
    const payload = parseErpErrorPayload(404, {
      detail: "Tercero '900123456' no encontrado",
    });

    expect(payload.message).toBe("Tercero '900123456' no encontrado");
    expect(payload.fields).toEqual({});
  });

  it("cae en el mensaje por defecto cuando el body no es un objeto", () => {
    expect(parseErpErrorPayload(403, null).message).toMatch(/permisos/i);
    expect(parseErpErrorPayload(500, null).message).toMatch(/servidor/i);
    expect(parseErpErrorPayload(409, null).message).toMatch(/ya existe/i);
  });
});

describe("normalizeFieldKey", () => {
  it("convierte la notación de pydantic a la de corchetes", () => {
    expect(normalizeFieldKey("prices.0.pvconi")).toBe("prices[0].pvconi");
    expect(normalizeFieldKey("units.12.codmed")).toBe("units[12].codmed");
    expect(normalizeFieldKey("nitter")).toBe("nitter");
  });
});

describe("toFormFieldErrors", () => {
  it("normaliza las claves para el formulario", () => {
    const error = toErpApiError(422, {
      detail: [
        { loc: ["body", "prices", 0, "pvconi"], msg: "Inconsistente" },
        { loc: ["body", "codprod"], msg: "Requerido" },
      ],
    });

    expect(toFormFieldErrors(error)).toEqual({
      "prices[0].pvconi": "Inconsistente",
      codprod: "Requerido",
    });
  });
});
