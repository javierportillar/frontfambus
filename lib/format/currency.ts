/**
 * Formato monetario para Colombia (peso COP, separador de miles con punto).
 *
 * Tenemos DOS funciones a proposito:
 *
 * - `formatMoneyFull` → `$1.300.000` (valor exacto, sin abreviar).
 *   Es el formato que prefiere el usuario para KPIs, celdas del
 *   calendario, tablas de productos y cualquier cifra que la persona
 *   vaya a leer puntualmente. Default en toda la app.
 *
 * - `formatMoney` → `$1.3M` / `$24.7K` (abreviado por magnitud).
 *   Reservado para etiquetas de ejes de graficos donde el espacio es
 *   limitado y la magnitud comunica mejor que el digito exacto.
 *
 * Reglas (es-CO):
 *   - Separador de miles: `.`  (1.300.000)
 *   - Sin decimales para valores enteros (los productos en COP son
 *     siempre enteros, no centavos)
 *   - El signo "$" va pegado al primer digito
 */

const _formatterCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** Valor monetario exacto con separadores: `$1.300.000`. */
export function formatMoneyFull(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return _formatterCOP.format(value);
}

/**
 * Abreviado por magnitud: `$1.3M`, `$24.7K`, `$420`.
 * Usar SOLO en ejes de graficos y otros espacios muy limitados.
 * Para todo lo demas preferir `formatMoneyFull`.
 */
export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}
