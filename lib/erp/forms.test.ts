import { describe, expect, it } from "vitest";
import {
  DEFAULT_IVA_RATE,
  buildTerceroCreatePayload,
  buildTerceroUpdatePayload,
  buildProductoCreatePayload,
  buildProductoUpdatePayload,
  emptyProductoForm,
  emptyPriceRow,
  priceRowFromPrice,
  productoFormFromRecord,
  terceroValuesFromRecord,
} from "./forms";
import type { Producto, Tercero } from "./types";

/**
 * Contrato de escritura de maestros (spec erp-masters-write):
 * `extra="forbid"` y los importes viajan como texto decimal.
 */

const TERCERO: Tercero = {
  nitter: "900123456",
  tipnit: "N",
  digter: "8",
  perjur: "S",
  nomter: "Ana",
  apeter: "Restrepo",
  razsoc: "ACME S.A.",
  dirter: "Cra 1 # 2-3",
  telter: "3001234567",
  cupblo: "B",
  inater: "SI",
  codlis: "L1",
  emails: [{ nitter: "900123456", corele: "ana@acme.test" }],
};

describe("terceroValuesFromRecord", () => {
  it("mapea la fila de la API al formulario", () => {
    const values = terceroValuesFromRecord(TERCERO);

    expect(values.nitter).toBe("900123456");
    expect(values.nomter).toBe("Ana");
    expect(values.razsoc).toBe("ACME S.A.");
    expect(values.cupblo).toBe("B");
    expect(values.inater).toBe("SI");
    expect(values.emails).toEqual(["ana@acme.test"]);
  });

  it("normaliza los correos que llegan como string[] (repo fake)", () => {
    const values = terceroValuesFromRecord({
      ...TERCERO,
      emails: ["ana@acme.test", "  "],
    });

    expect(values.emails).toEqual(["ana@acme.test"]);
  });

  it("usa los defaults del backend cuando la fila viene incompleta", () => {
    const values = terceroValuesFromRecord({
      nitter: "123",
      tipnit: "C",
    } as Tercero);

    expect(values.cupblo).toBe("R");
    expect(values.inater).toBe("NO");
    expect(values.perjur).toBe("N");
    expect(values.emails).toEqual([]);
  });
});

describe("buildTerceroCreatePayload", () => {
  it("manda sólo los campos del schema y omite los vacíos", () => {
    const payload = buildTerceroCreatePayload({
      ...terceroValuesFromRecord(TERCERO),
      apeter2: "",
      nomter2: "",
      codzon: "",
    });

    expect(payload).toEqual({
      nitter: "900123456",
      tipnit: "N",
      digter: "8",
      perjur: "S",
      apeter: "Restrepo",
      nomter: "Ana",
      razsoc: "ACME S.A.",
      dirter: "Cra 1 # 2-3",
      telter: "3001234567",
      codlis: "L1",
      cupblo: "B",
      inater: "SI",
      emails: ["ana@acme.test"],
    });
    expect("apeter2" in payload).toBe(false);
    expect("nomter2" in payload).toBe(false);
    expect("codzon" in payload).toBe(false);
  });

  it("normaliza los flags de estado a los literales del schema", () => {
    const payload = buildTerceroCreatePayload({
      ...terceroValuesFromRecord(TERCERO),
      cupblo: "x",
      inater: "si",
      tipnit: "Z",
      perjur: "X",
    });

    expect(payload.cupblo).toBe("R");
    expect(payload.inater).toBe("NO");
    expect(payload.tipnit).toBe("N");
    expect(payload.perjur).toBe("N");
  });

  it("limpia los correos y limita a los 10 que acepta el schema", () => {
    const emails = Array.from({ length: 12 }, (_, i) => ` a${i}@acme.test `);
    const payload = buildTerceroCreatePayload({
      ...terceroValuesFromRecord(TERCERO),
      emails,
    });

    expect(payload.emails).toHaveLength(10);
    expect(payload.emails?.[0]).toBe("a0@acme.test");
  });
});

describe("buildTerceroUpdatePayload", () => {
  it("no manda la identidad ni los campos que el schema de edición no declara", () => {
    const payload = buildTerceroUpdatePayload(terceroValuesFromRecord(TERCERO));

    expect("nitter" in payload).toBe(false);
    expect("tipnit" in payload).toBe(false);
    expect("digter" in payload).toBe(false);
    expect("perjur" in payload).toBe(false);
    expect("apeter2" in payload).toBe(false);
    expect("nomter2" in payload).toBe(false);
    expect("codzon" in payload).toBe(false);
    expect(payload.dirter).toBe("Cra 1 # 2-3");
    expect(payload.emails).toEqual(["ana@acme.test"]);
  });
});

const PRODUCTO: Producto = {
  codprod: "P001",
  nomprod: "Grasa",
  codbar: "7701234012345",
  codmed: "UND",
  valmed: "1",
  codlin1: "L01",
  actprod: "I",
  stockmin: "0",
  stockmax: "10",
  desprod: "Grasa multipropósito",
  units: [
    { codprod: "P001", codmed: "CAJ", divmul: "M", facumed: "12", pventa: "0", tipovc: "0" },
  ],
  barcodes: [{ codprod: "P001", codbar: "7701234012345" }],
  prices: [
    { codprod: "P001", codlis: "L1", pvtipo: "1", pvsini: "10000", pvconi: "11900", iva_rate: "19" },
  ],
};

describe("productoFormFromRecord", () => {
  it("mapea maestro, unidades, códigos de barras y precios", () => {
    const state = productoFormFromRecord(PRODUCTO);

    expect(state.values.codprod).toBe("P001");
    expect(state.values.nomprod).toBe("Grasa");
    expect(state.values.actprod).toBe("I");
    expect(state.units).toEqual([
      { codmed: "CAJ", divmul: "M", facumed: "12", pventa: "0", tipovc: "0" },
    ]);
    expect(state.barcodes).toEqual([{ codbar: "7701234012345" }]);
    expect(state.prices).toEqual([
      { codlis: "L1", modo: "1", precio: "10000", ivaRate: "19", ivaRateKnown: true },
    ]);
  });

  it("deriva el precio incluido del repo real (venprod + veniva)", () => {
    const row = priceRowFromPrice({
      codprod: "P001",
      codlis: "L2",
      pvtipo: "2",
      venprod: "10000",
      veniva: "1900",
    });

    expect(row.modo).toBe("2");
    expect(row.precio).toBe("11900");
    expect(row.ivaRate).toBe(DEFAULT_IVA_RATE);
    expect(row.ivaRateKnown).toBe(false);
  });
});

describe("buildProductoCreatePayload", () => {
  it("arma maestro + unidades + barras + precios respetando el orden de las filas", () => {
    const state = productoFormFromRecord(PRODUCTO);
    state.prices.push(emptyPriceRow("L2"));
    state.prices[1]!.precio = "20000";
    state.prices[1]!.ivaRate = "19";
    state.prices[1]!.modo = "2";

    const payload = buildProductoCreatePayload(state);

    expect(payload.codprod).toBe("P001");
    expect(payload.codmed).toBe("UND");
    expect(payload.units).toHaveLength(1);
    expect(payload.barcodes).toEqual([{ codbar: "7701234012345" }]);
    expect(payload.prices).toEqual([
      { codlis: "L1", pvtipo: "1", pvsini: "10000", iva_rate: "19" },
      { codlis: "L2", pvtipo: "2", pvconi: "20000", iva_rate: "19" },
    ]);
  });

  it("no manda el precio en el lado que no corresponde al modo", () => {
    const state = productoFormFromRecord(PRODUCTO);
    state.prices[0]!.modo = "2";
    state.prices[0]!.precio = "11900";

    const [entry] = buildProductoCreatePayload(state).prices ?? [];

    expect(entry?.pvconi).toBe("11900");
    expect(entry?.pvsini).toBeUndefined();
  });
});

describe("buildProductoUpdatePayload", () => {
  it("no manda la identidad del producto (codprod/codmed/valmed)", () => {
    const payload = buildProductoUpdatePayload(productoFormFromRecord(PRODUCTO));

    expect("codprod" in payload).toBe(false);
    expect("codmed" in payload).toBe(false);
    expect("valmed" in payload).toBe(false);
    expect(payload.nomprod).toBe("Grasa");
    expect(payload.actprod).toBe("I");
    expect(payload.prices).toHaveLength(1);
  });
});

describe("emptyProductoForm", () => {
  it("arranca con los defaults del schema del backend", () => {
    const state = emptyProductoForm();

    expect(state.values.actprod).toBe("A");
    expect(state.values.valmed).toBe("1");
    expect(state.prices).toEqual([]);
    expect(state.units).toEqual([]);
    expect(state.barcodes).toEqual([]);
  });
});
