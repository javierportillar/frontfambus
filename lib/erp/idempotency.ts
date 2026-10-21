/**
 * Generación de identificadores para las escrituras ERP.
 *
 * El backend exige `Idempotency-Key` con un UUID v4 válido
 * (`motoshop_api/erp/masters/router.py::_validate_idempotency_key`):
 *
 *   ^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$
 *
 * La misma clave debe reusarse en los reintentos de una misma acción para
 * que el backend devuelva la respuesta cacheada en vez de duplicar la fila
 * (el cache de idempotencia se consulta ANTES de validar, ver
 * `FakeTercerosRepo.create`).
 */

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Genera un UUID v4. Usa `crypto.randomUUID` cuando existe y cae a
 * `crypto.getRandomValues` (o `Math.random`) en runtimes sin WebCrypto.
 */
export function generateUuidV4(): string {
  const cryptoObj: Crypto | undefined = globalThis.crypto;

  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  // RFC 4122 §4.4: version 4 + variante 10xx.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

/**
 * Clave de idempotencia para una escritura (alta de maestro).
 *
 * Se genera UNA vez por acción del usuario y se reusa en cada reintento:
 * es la que evita duplicados cuando el primer request llegó al backend pero
 * la respuesta se perdió.
 */
export function generateIdempotencyKey(): string {
  return generateUuidV4();
}

/** Identificador de correlación opcional que acepta el backend (`X-Request-Id`). */
export function generateRequestId(): string {
  return generateUuidV4();
}

/** Valida el formato UUID v4 con la misma regex del backend. */
export function isValidIdempotencyKey(value: string): boolean {
  return UUID_V4_RE.test(value);
}
