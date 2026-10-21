import { describe, expect, it } from "vitest";
import {
  LEGACY_PRICE_LISTS,
  detectedPriceLists,
  filterProductsByPriceList,
  mergePriceLists,
  priceListLabel,
} from "./priceLists";
import type { Producto } from "./types";

function producto(codprod: string, codlis: string[]): Producto {
  return {
    codprod,
    nomprod: codprod,
    prices: codlis.map((lista) => ({
      codprod,
      codlis: lista,
      pvtipo: "1",
      venprod: "1000",
      veniva: "190",
    })),
  };
}

describe("mergePriceLists", () => {
  it("incluye las listas heredadas primero", () => {
    const options = mergePriceLists([]);

    expect(options.map((option) => option.codlis)).toEqual(
      LEGACY_PRICE_LISTS.map((list) => list.codlis),
    );
  });

  it("agrega las listas detectadas sin duplicar", () => {
    const options = mergePriceLists(["L3", "L1", " L3 ", ""]);

    expect(options.map((option) => option.codlis)).toEqual(["L1", "L2", "L3"]);
    expect(priceListLabel("L3")).toBe("L3");
  });
});

describe("detectedPriceLists", () => {
  it("reúne los códigos de lista de todos los productos", () => {
    const codes = detectedPriceLists([
      producto("A", ["L1"]),
      producto("B", ["L2", "L1"]),
    ]);

    expect(codes).toEqual(["L1", "L2"]);
  });

  it("devuelve una lista vacía cuando no hay precios", () => {
    expect(detectedPriceLists([{ codprod: "A" }])).toEqual([]);
  });
});

describe("filterProductsByPriceList", () => {
  const products = [producto("A", ["L1"]), producto("B", ["L2"]), producto("C", ["L1", "L2"])];

  it("deja pasar todo cuando no se elige lista", () => {
    const result = filterProductsByPriceList(products, "TODAS");

    expect(result.rows).toHaveLength(3);
    expect(result.pricesUnavailable).toBe(false);
  });

  it("filtra por la lista elegida", () => {
    const result = filterProductsByPriceList(products, "L2");

    expect(result.rows.map((row) => row.codprod)).toEqual(["B", "C"]);
    expect(result.pricesUnavailable).toBe(false);
  });

  it("no oculta filas cuando el listado no trae precios por lista", () => {
    const result = filterProductsByPriceList([{ codprod: "A" }, { codprod: "B" }], "L1");

    expect(result.rows).toHaveLength(2);
    expect(result.pricesUnavailable).toBe(true);
  });
});
