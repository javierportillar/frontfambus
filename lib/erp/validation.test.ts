import { describe, expect, it } from "vitest";
import {
  deriveExclusivePrice,
  deriveInclusivePrice,
  expectedVerificationDigit,
  nitVerificationDigit,
  validatePriceRows,
  validateProductoValues,
  validateTerceroValues,
  validateUnitRows,
  type ProductoFormValues,
  type TerceroFormValues,
} from "./validation";

const TERCERO_OK: TerceroFormValues = {
  nitter: "900123456",
  tipnit: "N",
  digter: "8",
  perjur: "N",
  apeter: "",
  apeter2: "",
  nomter: "MotoShop",
  nomter2: "",
  razsoc: "",
  nomcom: "",
  dirter: "Calle 1 # 2-3",
  telter: "3001234567",
  movter: "",
  codciu: "",
  codzon: "",
  codlis: "",
  cupblo: "R",
  inater: "NO",
  emails: [],
};

const PRODUCTO_OK: ProductoFormValues = {
  codprod: "P001",
  nomprod: "Lubricante",
  codbar: "",
  codmed: "UND",
  valmed: "1",
  codlin1: "L01",
  actprod: "A",
  stockmin: "0",
  stockmax: "0",
  desprod: "",
};

describe("nitVerificationDigit", () => {
  it("replica el dígito de verificación del backend", () => {
    // Paridad con `nit_verification_digit` (900123456 → 8).
    expect(nitVerificationDigit("900123456")).toBe("8");
  });

  it("solo aplica a NIT", () => {
    expect(expectedVerificationDigit("900123456", "N")).toBe("8");
    expect(expectedVerificationDigit("900123456", "C")).toBeNull();
  });
});

describe("validateTerceroValues", () => {
  it("acepta un tercero válido", () => {
    expect(validateTerceroValues(TERCERO_OK)).toEqual({});
  });

  it("nombra TODOS los campos ofendidos (agregado, no first-fail)", () => {
    const errors = validateTerceroValues({
      ...TERCERO_OK,
      nomter: "",
      razsoc: "",
      dirter: "",
      telter: "",
      digter: "3",
    });

    expect(Object.keys(errors).sort()).toEqual([
      "digter",
      "dirter",
      "nomter",
      "telter",
    ]);
  });

  it("explica el dígito de verificación esperado", () => {
    const errors = validateTerceroValues({ ...TERCERO_OK, digter: "3" });
    expect(errors.digter).toContain("esperado 8");
  });

  it("no exige dígito de verificación cuando el tipo no es NIT", () => {
    const errors = validateTerceroValues({
      ...TERCERO_OK,
      tipnit: "C",
      digter: "",
    });
    expect(errors.digter).toBeUndefined();
  });
});

describe("validateProductoValues", () => {
  it("acepta un producto válido", () => {
    expect(validateProductoValues(PRODUCTO_OK)).toEqual({});
  });

  it("nombra código, nombre, línea y unidad base", () => {
    const errors = validateProductoValues({
      ...PRODUCTO_OK,
      codprod: "",
      nomprod: "",
      codlin1: "",
      codmed: "",
    });

    expect(Object.keys(errors).sort()).toEqual([
      "codlin1",
      "codmed",
      "codprod",
      "nomprod",
    ]);
  });
});

describe("split price (paridad con `split_price`)", () => {
  it("deriva el precio con IVA desde el exclusivo", () => {
    expect(deriveInclusivePrice(10000, 19)).toBe(11900);
    expect(deriveInclusivePrice(10000, 0)).toBe(10000);
  });

  it("deriva el precio exclusivo desde el incluido", () => {
    expect(deriveExclusivePrice(11900, 19)).toBe(10000);
  });

  it("es simétrico con la paridad de dos decimales", () => {
    expect(deriveExclusivePrice(deriveInclusivePrice(3333.33, 19), 19)).toBe(
      3333.33,
    );
  });
});

describe("validatePriceRows", () => {
  it("acepta una fila válida", () => {
    expect(
      validatePriceRows([{ codlis: "L1", modo: "1", precio: "10000", ivaRate: "19" }]),
    ).toEqual({});
  });

  it("nombra la fila de precio que falla", () => {
    const errors = validatePriceRows([
      { codlis: "", modo: "1", precio: "", ivaRate: "" },
      { codlis: "L2", modo: "2", precio: "abc", ivaRate: "0" },
    ]);

    expect(errors["prices[0].codlis"]).toBeTruthy();
    expect(errors["prices[0].pvsini"]).toBeTruthy();
    expect(errors["prices[0].iva_rate"]).toBeTruthy();
    expect(errors["prices[1].pvsini"]).toBe("El precio debe ser un número");
    expect(errors["prices[1].iva_rate"]).toBeTruthy();
  });
});

describe("validateUnitRows", () => {
  it("exige unidad y factor de conversión positivo", () => {
    const errors = validateUnitRows([
      { codmed: "", facumed: "" },
      { codmed: "UND", facumed: "0" },
    ]);

    expect(errors["units[0].codmed"]).toBeTruthy();
    expect(errors["units[0].facumed"]).toBeTruthy();
    expect(errors["units[1].facumed"]).toBeTruthy();
  });
});
