/**
 * Listas de precio (`listapre`) para la carga de precios por producto.
 *
 * El backend no expone todavía un endpoint de `listapre` (la matriz de rutas
 * lo tiene declarado en `erp.guards.ERP_ROUTE_MODULES` pero no está montado),
 * así que el selector de la UI combina:
 * - las listas conocidas del catálogo heredado (`L1` mayorista, `L2` distribuidor);
 * - las listas detectadas en los precios que devuelve la API.
 */

import type { Producto } from "./types";

export interface PriceListOption {
  /** Código de lista (`codlis`, 3 caracteres). */
  codlis: string;
  /** Etiqueta legible en la UI. */
  label: string;
}

/** Listas del catálogo heredado (`listapre` en la base legacy). */
export const LEGACY_PRICE_LISTS: PriceListOption[] = [
  { codlis: "L1", label: "L1 · Mayorista" },
  { codlis: "L2", label: "L2 · Distribuidor" },
];

/** Etiqueta legible para un código de lista. */
export function priceListLabel(codlis: string): string {
  const known = LEGACY_PRICE_LISTS.find((list) => list.codlis === codlis);
  if (known) return known.label;
  return codlis;
}

/**
 * Combina las listas heredadas con las detectadas en la API.
 *
 * @param detected Códigos `codlis` encontrados en los precios cargados.
 */
export function mergePriceLists(detected: string[]): PriceListOption[] {
  const options = new Map<string, PriceListOption>();
  for (const list of LEGACY_PRICE_LISTS) {
    options.set(list.codlis, list);
  }
  for (const codlis of detected) {
    const code = codlis.trim();
    if (!code || options.has(code)) continue;
    options.set(code, { codlis: code, label: priceListLabel(code) });
  }
  return Array.from(options.values());
}

/** Códigos de lista detectados en los precios de un conjunto de productos. */
export function detectedPriceLists(products: Producto[]): string[] {
  const codes: string[] = [];
  for (const product of products) {
    for (const price of product.prices ?? []) {
      const codlis = (price.codlis ?? "").trim();
      if (codlis && !codes.includes(codlis)) codes.push(codlis);
    }
  }
  return codes;
}

/** Resultado del filtrado por lista de precio. */
export interface PriceListFilterResult {
  /** Productos que quedan visibles. */
  rows: Producto[];
  /**
   * `true` cuando ningún producto trae precios: el listado no trae la
   * información por lista y filtrar sería mentir. En ese caso no se oculta
   * nada y la UI lo advierte.
   */
  pricesUnavailable: boolean;
}

/**
 * Filtra productos por lista de precio.
 *
 * `@param codlis Lista elegida; `"TODAS"` (o vacío) no filtra.
 */
export function filterProductsByPriceList(
  products: Producto[],
  codlis: string,
): PriceListFilterResult {
  const selected = codlis.trim().toUpperCase();
  if (!selected || selected === "TODAS") {
    return { rows: products, pricesUnavailable: false };
  }

  const anyPrices = products.some(
    (product) => (product.prices ?? []).length > 0,
  );
  if (!anyPrices) {
    return { rows: products, pricesUnavailable: true };
  }

  return {
    rows: products.filter((product) =>
      (product.prices ?? []).some(
        (price) => (price.codlis ?? "").trim().toUpperCase() === selected,
      ),
    ),
    pricesUnavailable: false,
  };
}
