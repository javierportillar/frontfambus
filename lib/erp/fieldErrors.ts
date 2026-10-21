/**
 * Traducción de errores del API de maestros a errores por campo del formulario.
 *
 * Contrato congelado (spec erp-masters-write, `erp/masters/validators.py`):
 *
 *   422 aggregate → {message, fields: {campo: "motivo"}}
 *                   NUNCA first-fail: nombra TODOS los campos ofendidos.
 *   422 maestro   → {message, code: "master_inactive",
 *                    fields: {key_field: "master_inactive"},
 *                    master_state: {key_field, act_field}}
 *   409 duplicado → {message, field}
 *
 * El valor `"master_inactive"` no es legible para quien está cargando el
 * formulario: acá se traduce al motivo real (`bloqueado por cartera` para
 * `cupblo='B'`, `inactivo` para `inater='SI'` o `actprod != 'A'`).
 */

import { ERP_ERROR_CODES, normalizeFieldKey, type ErpApiError } from "./errors";

/** Motivo por el que un maestro no puede usarse en documentos nuevos. */
export type MasterNoticeKind = "inactive" | "blocked";

/** Aviso legible del estado de un maestro (contrato `master_inactive`). */
export interface MasterNotice {
  kind: MasterNoticeKind;
  /** Campo clave del maestro (`nitter` o `codprod`). */
  field: string;
  /** Etiqueta corta: "inactivo" | "bloqueado por cartera". */
  label: string;
  /** Mensaje completo para el formulario. */
  message: string;
}

/** Errores de la última escritura, listos para pintar. */
export interface FormErrorState {
  /** Mensaje global del backend. */
  message: string;
  /** Errores por campo (clave normalizada `prices[0].pvconi`). */
  fields: Record<string, string>;
  /** Aviso de maestro inactivo/bloqueado, si corresponde. */
  notice: MasterNotice | null;
  /** `true` cuando el backend respondió 403 (rol sin permiso de escritura). */
  forbidden: boolean;
}

/**
 * Traduce el `master_state` del 422 a un aviso legible.
 *
 * @param master_state Estado que devuelve el backend.
 * @param keyField Campo clave del maestro (`nitter` / `codprod`), si se conoce.
 */
export function masterNotice(
  masterState?: Record<string, string>,
  keyField?: string,
): MasterNotice | null {
  if (!masterState) return null;

  const cupblo = (masterState.cupblo ?? "").toUpperCase();
  if (cupblo === "B") {
    return {
      kind: "blocked",
      field: keyField ?? "nitter",
      label: "bloqueado por cartera",
      message: "El tercero está bloqueado por cartera (cupblo='B').",
    };
  }

  const inater = (masterState.inater ?? "").toUpperCase();
  if (inater === "SI") {
    return {
      kind: "inactive",
      field: keyField ?? "nitter",
      label: "inactivo",
      message: "El tercero está inactivo (inater='SI').",
    };
  }

  const actprod = (masterState.actprod ?? "").toUpperCase();
  if (actprod && actprod !== "A") {
    return {
      kind: "inactive",
      field: keyField ?? "codprod",
      label: "inactivo",
      message: `El producto está inactivo (actprod='${actprod}').`,
    };
  }

  return null;
}

/**
 * Convierte un `ErpApiError` en el estado de errores del formulario.
 *
 * Los errores de las sub-colecciones conservan el índice del body enviado
 * (`prices[0].pvconi`), así la UI puede pintarlos en la fila exacta.
 */
export function mapErpErrorToForm(error: ErpApiError): FormErrorState {
  const fields: Record<string, string> = {};
  for (const [field, message] of Object.entries(error.fields)) {
    fields[normalizeFieldKey(field)] = message;
  }

  const keyField = Object.keys(error.fields)[0];
  const notice =
    error.code === ERP_ERROR_CODES.masterInactive
      ? masterNotice(error.masterState, keyField)
      : null;

  if (notice) {
    // `"master_inactive"` no le dice nada a quien carga el formulario.
    fields[notice.field] = notice.message;
  }

  return {
    message: error.message,
    fields,
    notice,
    forbidden: error.status === 403,
  };
}

/**
 * Error de una fila de precio.
 *
 * El backend puede reportar el error con índice (`prices[0].pvconi`, cuando
 * lo genera pydantic) o sin índice (`pvconi`, cuando lo genera `split_price`
 * en el repo): en el segundo caso el motivo aplica a todo el conjunto de
 * precios y se muestra en cada fila.
 */
export function priceFieldError(
  fields: Record<string, string>,
  index: number,
  field: string,
): string | undefined {
  return fields[`prices[${index}].${field}`] ?? fields[field];
}

/** Error de una fila de unidad de venta. */
export function unitFieldError(
  fields: Record<string, string>,
  index: number,
  field: string,
): string | undefined {
  return fields[`units[${index}].${field}`] ?? fields[field];
}

/** Error de una fila de código de barras. */
export function barcodeFieldError(
  fields: Record<string, string>,
  index: number,
  field: string,
): string | undefined {
  return fields[`barcodes[${index}].${field}`] ?? fields[field];
}
