/**
 * Normalización de valores que llegan del API heredado.
 *
 * El backend serializa `Decimal` como `number` en los endpoints JSON y como
 * `str` en los snapshots de auditoría; la UI siempre trabaja con `number`.
 */

/**
 * Convierte un importe heredado (`number | string | null`) a número.
 *
 * Réplica de `from_legacy_num` del backend: acepta punto y coma decimales y
 * descarta los separadores de miles.
 */
export function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  let text = value.trim().replace(/\s/g, "");
  if (text === "") return 0;

  const hasComma = text.includes(",");
  const hasDot = text.includes(".");

  if (hasComma && hasDot) {
    // El último separador que aparece es el decimal.
    text =
      text.lastIndexOf(",") > text.lastIndexOf(".")
        ? text.replace(/\./g, "").replace(",", ".")
        : text.replace(/,/g, "");
  } else if ((text.match(/,/g)?.length ?? 0) > 1 || (text.match(/\./g)?.length ?? 0) > 1) {
    // Separadores de miles: se eliminan.
    text = text.replace(/,/g, "").replace(/\./g, "");
  } else if (hasComma) {
    text = text.replace(",", ".");
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Convierte un importe heredado a string decimal (sin notación científica). */
export function toDecimalString(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  const num = toNumber(value);
  if (!Number.isFinite(num)) return "";
  return String(num);
}

/**
 * Extrae los correos de un tercero.
 *
 * El repo fake devuelve `string[]` y el real `[{nitter, corele}]`:
 * se normalizan los dos shapes.
 */
export function terceroEmailList(
  emails: Array<string | { nitter?: string; corele?: string }> | null | undefined,
): string[] {
  if (!emails || emails.length === 0) return [];
  return emails
    .map((email) => (typeof email === "string" ? email : (email.corele ?? "")))
    .map((email) => email.trim())
    .filter((email) => email.length > 0);
}
