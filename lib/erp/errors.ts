/**
 * Parsing de errores del API de maestros.
 *
 * Contrato congelado (spec erp-masters-write, `erp/masters/validators.py`):
 *
 *   422 aggregate  → detail = {message, fields: {campo: "motivo"}}
 *                    (NUNCA first-fail: nombra TODOS los campos offendidos)
 *   422 maestro    → detail = {message, code: "master_inactive",
 *                              fields: {key_field: "master_inactive"},
 *                              master_state: {key_field, act_field}}
 *   409 duplicado  → detail = {message, field}
 *   403/404        → detail = "texto plano"
 *
 * FastAPI envuelve todo en `{detail: ...}`; los errores de pydantic llegan
 * como lista de `{loc, msg}` y se normalizan al mismo esquema `campo → motivo`.
 */

/** Códigos de error del contrato de maestros. */
export const ERP_ERROR_CODES = {
  /** Maestro inactivo o bloqueado al armar un documento nuevo. */
  masterInactive: "master_inactive",
} as const;

/** Error de API ya parseado, listo para pintarse campo por campo. */
export interface ErpErrorPayload {
  /** Mensaje global del error. */
  message: string;
  /** Errores por campo: nombre del campo → motivo. */
  fields: Record<string, string>;
  /** Código de negocio (ej. `master_inactive`), si viene. */
  code?: string;
  /** Estado del maestro cuando el error es de estado (inactivo/bloqueado). */
  masterState?: Record<string, string>;
  /** Campo en conflicto cuando la respuesta es 409. */
  conflictField?: string;
}

/** Error de API de maestros con los errores por campo ya resueltos. */
export class ErpApiError extends Error {
  readonly status: number;
  readonly fields: Record<string, string>;
  readonly code?: string;
  readonly masterState?: Record<string, string>;
  readonly conflictField?: string;

  constructor(status: number, payload: ErpErrorPayload) {
    super(payload.message);
    this.name = "ErpApiError";
    this.status = status;
    this.fields = payload.fields;
    this.code = payload.code;
    this.masterState = payload.masterState;
    this.conflictField = payload.conflictField;
  }

  /** `true` cuando el maestro está inactivo/bloqueado (contrato congelado). */
  get isMasterInactive(): boolean {
    return this.code === ERP_ERROR_CODES.masterInactive;
  }

  /** Errores por campo como lista, para renderizar bajo cada input. */
  get fieldErrors(): Array<{ field: string; message: string }> {
    return Object.entries(this.fields).map(([field, message]) => ({
      field,
      message,
    }));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Convierte un objeto desconocido en `Record<string, string>`. */
function toStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      result[key] = entry;
    } else if (entry !== null && entry !== undefined) {
      result[key] = String(entry);
    }
  }
  return result;
}

/**
 * Normaliza la clave de un campo a la notación del backend.
 *
 * El backend usa `prices[0].pvconi`; pydantic usa `prices.0.pvconi`.
 * Se unifican en la forma con corchetes para que la UI mapee igual.
 */
export function normalizeFieldKey(key: string): string {
  return key.replace(/\.(\d+)(?=\.|$)/g, "[$1]");
}

function fieldKeyFromLoc(loc: unknown): string | null {
  if (!Array.isArray(loc)) return null;
  const parts = loc
    .filter((part) => part !== "body" && part !== "query" && part !== "path")
    .map((part) => String(part));
  if (parts.length === 0) return null;
  return normalizeFieldKey(parts.join("."));
}

function parsePydanticErrors(
  details: unknown[],
): { message: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  let firstMessage = "";

  for (const item of details) {
    if (!isRecord(item)) continue;
    const msg = typeof item.msg === "string" ? item.msg : "Valor inválido";
    if (!firstMessage) firstMessage = msg;
    const key = fieldKeyFromLoc(item.loc);
    if (key) {
      fields[key] = fields[key] ? `${fields[key]} ${msg}` : msg;
    }
  }

  return {
    message:
      Object.keys(fields).length > 0
        ? "Datos no válidos"
        : firstMessage || "Datos no válidos",
    fields,
  };
}

function fallbackMessage(status: number): string {
  if (status === 403) return "No tenés permisos para esta operación.";
  if (status === 404) return "No se encontró el registro.";
  if (status === 409) return "Ya existe un registro con esos datos.";
  if (status >= 500) return "El servidor no pudo completar la operación.";
  return `Error ${status} al guardar el maestro.`;
}

/**
 * Parsea el body de una respuesta de error del API de maestros.
 *
 * @param status Código HTTP de la respuesta.
 * @param body Body ya parseado (JSON) o `null` si no se pudo leer.
 */
export function parseErpErrorPayload(
  status: number,
  body: unknown,
): ErpErrorPayload {
  if (!isRecord(body)) {
    return { message: fallbackMessage(status), fields: {} };
  }

  const detail = body.detail;

  // detail plano: 403 / 404 / validaciones simples del backend.
  if (typeof detail === "string") {
    return { message: detail, fields: {} };
  }

  // Errores de pydantic: lista de {loc, msg}.
  if (Array.isArray(detail)) {
    const { message, fields } = parsePydanticErrors(detail);
    return { message, fields };
  }

  if (!isRecord(detail)) {
    return { message: fallbackMessage(status), fields: {} };
  }

  const message =
    typeof detail.message === "string" && detail.message.trim().length > 0
      ? detail.message
      : fallbackMessage(status);

  const payload: ErpErrorPayload = {
    message,
    fields: toStringRecord(detail.fields),
  };

  if (typeof detail.code === "string") {
    payload.code = detail.code;
  }

  const masterState = toStringRecord(detail.master_state);
  if (Object.keys(masterState).length > 0) {
    payload.masterState = masterState;
  }

  if (typeof detail.field === "string") {
    payload.conflictField = detail.field;
    // El 409 nombra un único campo: se expone igual en `fields` para que la
    // UI lo pinte bajo el input sin tratamento especial.
    payload.fields = { ...payload.fields, [detail.field]: message };
  }

  return payload;
}

/** Construye el `ErpApiError` a partir de un body de error. */
export function toErpApiError(status: number, body: unknown): ErpApiError {
  return new ErpApiError(status, parseErpErrorPayload(status, body));
}

/**
 * Traduce los errores por campo del backend a las claves del formulario.
 *
 * Los errores con prefijo `prices[...]` / `units[...]` / `barcodes[...]` se
 * dejan intactos: el formulario los resuelve con `priceFieldError` y amigos.
 */
export function toFormFieldErrors(
  error: ErpApiError,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [field, message] of Object.entries(error.fields)) {
    result[normalizeFieldKey(field)] = message;
  }
  return result;
}
