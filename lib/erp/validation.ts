/**
 * Validaciones de paridad con el maestro heredado (`BotGuarMa`).
 *
 * Réplica de `motoshop_api/erp/masters/validators.py`:
 * - `nit_verification_digit` → dígito de verificación del NIT (mod 11).
 * - `validate_tercero_create`  → agregado de campos obligatorios.
 * - `validate_product_create`  → código/nombre/línea/unidad obligatorios.
 *
 * El backend sigue siendo la autoridad: estas reglas acortan el ida y vuelta
 * y permiten mostrar el error antes de guardar, pero nunca reemplazan la
 * validación del servidor.
 */

/** Pesos del cálculo de verificación (mod 11), de derecha a izquierda. */
const DV_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71, 73];

/**
 * Dígito de verificación del NIT (paridad con `nit_verification_digit`).
 *
 * SUM = Σ dígito_i × peso_i (derecha a izquierda), rem = SUM mod 11.
 * DV = 0 (rem 0), 1 (rem 1), si no 11 − rem.
 *
 * @example nitVerificationDigit("900123456") === "8"
 */
export function nitVerificationDigit(nitter: string): string {
  const digits = Array.from(nitter)
    .filter((char) => char >= "0" && char <= "9")
    .reverse();
  let total = 0;
  for (let i = 0; i < digits.length; i += 1) {
    total += Number(digits[i]) * (DV_WEIGHTS[i] ?? 0);
  }
  const rem = total % 11;
  if (rem === 0) return "0";
  if (rem === 1) return "1";
  return String(11 - rem);
}

/** Dígito de verificación esperado (solo aplica a NIT: `tipnit === "N"`). */
export function expectedVerificationDigit(
  nitter: string,
  tipnit: string,
): string | null {
  if (tipnit !== "N") return null;
  const digits = nitter.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return nitVerificationDigit(digits);
}

/** Redondeo half-up a 2 decimales (paridad con `_half_up` del backend). */
function halfUp2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Precio con IVA derivado de un precio exclusivo.
 *
 * Réplica de `split_price`: `incluido = exclusive × (1 + tasa/100)`.
 */
export function deriveInclusivePrice(
  exclusive: number,
  ivaRate: number,
): number {
  const cents = Math.round(exclusive * 100);
  return halfUp2((cents * (100 + ivaRate)) / 100 / 100);
}

/**
 * Precio exclusivo derivado de un precio con IVA.
 *
 * Réplica de `split_price`: `exclusivo = incluido / (1 + tasa/100)`.
 */
export function deriveExclusivePrice(
  inclusive: number,
  ivaRate: number,
): number {
  const cents = Math.round(inclusive * 100);
  return halfUp2((cents * 100) / (100 + ivaRate) / 100);
}

/** Valores del formulario de tercero (todo string para controlar el input). */
export interface TerceroFormValues {
  nitter: string;
  tipnit: string;
  digter: string;
  perjur: string;
  apeter: string;
  apeter2: string;
  nomter: string;
  nomter2: string;
  razsoc: string;
  nomcom: string;
  dirter: string;
  telter: string;
  movter: string;
  codciu: string;
  codzon: string;
  codlis: string;
  cupblo: string;
  inater: string;
  emails: string[];
}

/** Errores por campo del formulario de tercero. */
export type FieldErrors = Record<string, string>;

/**
 * Validación agregada del alta de tercero (paridad con
 * `validate_tercero_create`): nombra TODOS los campos offendidos.
 */
export function validateTerceroValues(
  values: TerceroFormValues,
): FieldErrors {
  const errors: FieldErrors = {};

  const nitter = values.nitter.trim();
  if (!nitter) {
    errors.nitter = "Identificación (nitter) requerida";
  } else if (values.tipnit === "N") {
    const expected = nitVerificationDigit(nitter);
    const supplied = values.digter.trim();
    if (supplied !== expected) {
      errors.digter = `Dígito de verificación inválido para ${nitter}: esperado ${expected}, recibido '${supplied || "vacío"}'`;
    }
  }

  if (!values.nomter.trim() && !values.razsoc.trim()) {
    errors.nomter =
      "Nombre (o razón social) requerido por el maestro heredado";
  }
  if (!values.dirter.trim()) {
    errors.dirter = "Dirección requerida por el maestro heredado";
  }
  if (!values.telter.trim()) {
    errors.telter = "Teléfono requerido por el maestro heredado";
  }

  return errors;
}

/** Valores del formulario de producto (todo string para controlar el input). */
export interface ProductoFormValues {
  codprod: string;
  nomprod: string;
  codbar: string;
  codmed: string;
  valmed: string;
  codlin1: string;
  actprod: string;
  stockmin: string;
  stockmax: string;
  desprod: string;
}

/**
 * Validación agregada del alta de producto (paridad con
 * `validate_product_create`): nombra TODOS los campos offendidos.
 */
export function validateProductoValues(
  values: ProductoFormValues,
): FieldErrors {
  const errors: FieldErrors = {};

  if (!values.codprod.trim()) {
    errors.codprod = "Código de producto requerido";
  }
  if (!values.nomprod.trim()) {
    errors.nomprod = "Nombre de producto requerido";
  }
  if (!values.codlin1.trim()) {
    errors.codlin1 = "Línea de producto (codlin1) requerida";
  }
  if (!values.codmed.trim()) {
    errors.codmed = "Unidad base (codmed) requerida";
  }

  return errors;
}

/** Errores de una fila de precio por lista. */
export interface PriceRowValues {
  codlis: string;
  modo: "1" | "2";
  precio: string;
  ivaRate: string;
}

/** Validación de las filas de precio (lista + monto + tasa de IVA). */
export function validatePriceRows(rows: PriceRowValues[]): FieldErrors {
  const errors: FieldErrors = {};

  rows.forEach((row, index) => {
    if (!row.codlis.trim()) {
      errors[`prices[${index}].codlis`] = "Lista de precio requerida";
    }
    if (!row.precio.trim()) {
      errors[`prices[${index}].pvsini`] = "Se requiere pvsini (exclusivo) o pvconi (incluido)";
    } else if (!Number.isFinite(Number(row.precio))) {
      errors[`prices[${index}].pvsini`] = "El precio debe ser un número";
    }
    const rate = Number(row.ivaRate);
    if (!row.ivaRate.trim()) {
      errors[`prices[${index}].iva_rate`] = "Tasa de IVA requerida";
    } else if (!Number.isFinite(rate) || rate <= 0 || rate > 150) {
      errors[`prices[${index}].iva_rate`] = "La tasa de IVA debe estar entre 0 y 150";
    }
  });

  return errors;
}

/** Errores de las filas de unidad de venta. */
export function validateUnitRows(
  rows: Array<{ codmed: string; facumed: string }>,
): FieldErrors {
  const errors: FieldErrors = {};

  rows.forEach((row, index) => {
    if (!row.codmed.trim()) {
      errors[`units[${index}].codmed`] = "Unidad de medida requerida";
    }
    const factor = Number(row.facumed);
    if (!row.facumed.trim()) {
      errors[`units[${index}].facumed`] = "Factor de conversión requerido";
    } else if (!Number.isFinite(factor) || factor <= 0) {
      errors[`units[${index}].facumed`] =
        "El factor de conversión debe ser mayor que cero";
    }
  });

  return errors;
}
