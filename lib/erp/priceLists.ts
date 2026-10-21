/**
 * Listas de precio (`listapre`) para la carga de precios por producto.
 *
 * El backend no expone todavía un endpoint de `listapre` (la matriz de rutas
 * lo tiene declarado en `erp.guards.ERP_ROUTE_MODULES` pero no está montado),
 * así que el selector de la UI combina:
 * - las listas conocidas del catálogo heredado (`L1` mayorista, `L2` distribuidor);
 * - las listas detectadas en los precios que devuelve la API.
 */

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
