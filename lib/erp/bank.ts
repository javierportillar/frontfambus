/**
 * Cliente del API de verificación bancaria (`/api/erp/bank/*`).
 *
 * Contrato con el backend (spec `erp-bank-transfer-reconciliation-ui`):
 *
 * - `POST /api/erp/bank/verificaciones` → **202** `{job_id, estado, expira_en}`.
 *   El scrape del portal no cabe en un request: el nodo local del tenant lo
 *   corre en segundo plano y el front sondea el job.
 * - `GET /api/erp/bank/verificaciones/{job_id}` → **200**
 *   `{job_id, estado, resultado?, error?, expira_en}`.
 * - `GET /api/erp/bank/candidates?valor=&desde=&hasta=` → **200**
 *   `{ambiguo, ventana, candidatos, ultimaIngestaAt}`.
 *
 * Errores del nodo (**503**): el body es `{"detail": {error_codigo, message}}`
 * con `error_codigo` ∈ `scraper_no_habilitado` | `tenant_no_servido`. No son
 * fallos genéricos: significan "este nodo no puede verificar" y la UI conserva
 * el pegado manual del POS. Se traducen a `BankNodeError`.
 *
 * El importe **siempre viaja como texto con dos decimales** (`"458200.00"`):
 * nunca como `float` (el backend lo parsesa como `DECIMAL(18,2)`).
 */

import { apiFetch } from "@/lib/api/client";
import { ErpApiError, parseErpErrorPayload, toErpApiError } from "./errors";
import { generateRequestId } from "./idempotency";

const BANK_BASE = "/api/erp/bank";

/** Header used by the proxy to pin bank job polls to the node that owns the job. */
export const BANK_NODE_HEADER = "X-Bank-Node";

/**
 * Internal header for the single unpinned fallback: the proxy must choose a
 * base distinct from the pinned node that just failed.
 */
export const BANK_SKIP_NODE_HEADER = "X-Bank-Skip-Node";

/** Stable labels the proxy understands (see `lib/api/backendFailover.ts`). */
const KNOWN_BANK_NODE_LABELS: ReadonlySet<string> = new Set([
  "primary",
  "motoshop-local",
  "masvital-local",
  "fallback",
]);

/** Trusted nodes per job: written when the POST response names the node. */
const bankJobNodes = new Map<string, string>();

/** Clears the node affinity registry (tests or tenant/session changes). */
export function clearBankNodeAffinity(): void {
  bankJobNodes.clear();
}

const BANK_NODE_RETRY_DELAYS_MS = [150, 300] as const;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nodeFromBody(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.nodo !== "string") return null;
  const rawNode = raw.nodo.trim().toLowerCase();
  return KNOWN_BANK_NODE_LABELS.has(rawNode) ? rawNode : null;
}

function nodeFromResponse(resp: Response): string | null {
  const value = resp.headers.get(BANK_NODE_HEADER);
  return value && value.trim().length > 0 ? value.trim() : null;
}

function captureNode(jobId: string, resp: Response): string | null {
  const node = nodeFromResponse(resp);
  if (node) bankJobNodes.set(jobId, node);
  return node;
}

function esJobNoEncontrado(status: number, body: unknown): boolean {
  if (status !== 404) return false;
  // Body ausente o ilegible: un 404 en el poll de un job se trata como miss.
  // Sin JSON no hay `error_codigo` que consultar y descartar el miss rompería
  // el reintento del race inicial (el job puede estar apareciendo en el nodo).
  if (body === null || body === undefined) return true;
  // Con body presente el único discriminador estable es `detail.error_codigo`.
  // Nada de matchear mensajes: "Ruta no encontrada" también es un 404.
  if (!isRecord(body) || !isRecord(body.detail)) return false;
  return body.detail.error_codigo === "job_no_encontrado";
}

/** Estados del job de verificación (contrato congelado del backend). */
export type BankJobEstado =
  | "en_cola"
  | "ejecutando"
  | "esperando_otp"
  | "resuelto"
  | "sin_coincidencia"
  | "ambiguo"
  | "fallido"
  | "expirado";

/** Estados en los que el job ya no se mueve: el front deja de sondearlo. */
export const BANK_ESTADOS_FINALES: readonly BankJobEstado[] = [
  "resuelto",
  "sin_coincidencia",
  "ambiguo",
  "fallido",
  "expirado",
];

/** `true` cuando el job ya terminó (no se vuelve a sondear). */
export function esEstadoFinal(estado: BankJobEstado): boolean {
  return BANK_ESTADOS_FINALES.includes(estado);
}

/** Ventana de consulta del banco (`YYYY-MM-DD`). */
export interface BankVentana {
  desde: string;
  hasta: string;
}

/** Un movimiento del banco que coincide con el importe buscado. */
export interface BankCandidato {
  /** Id de dominio del movimiento (el mismo que expone la API de candidatos). */
  id: string;
  /** Importe del movimiento como texto con dos decimales. */
  valor: string;
  /** Nombre del pagador tal como lo muestra el portal del banco. */
  pagadorNombre: string;
  /** Referencia ya saneada (sin el sufijo `" null"`). */
  referencia: string;
  /** Fecha del movimiento (`YYYY-MM-DD`). */
  fecha: string;
  /**
   * NIT del cliente de la factura. El nodo lo agrega de forma gradual: si no
   * viene, la UI simplemente omite la fila (nunca muestra `undefined`).
   */
  nitter?: string;
  /**
   * Nombre del cliente de la factura. Igual que `nitter`, es opcional hasta
   * que todos los nodos estén actualizados.
   */
  clienteNombre?: string;
}

/** Respuesta de `GET /api/erp/bank/candidates`. */
export interface BankCandidatos {
  /** `true` cuando hay dos o más candidatos: elige el operador, nunca el sistema. */
  ambiguo: boolean;
  ventana: BankVentana;
  candidatos: BankCandidato[];
  /** Última ingesta del tenant (`null` si el tenant nunca ingirió). */
  ultimaIngestaAt: string | null;
}

/** `resultado` del job: la foto de lo que encontró el nodo. */
export interface BankJobResultado {
  ventana?: BankVentana;
  nodo?: string;
  ingesta_at?: string;
  cuenta?: string;
  paginas?: number;
  movimientos?: number;
  /**
   * Candidatos encontrados por el nodo cuando el job terminó `ambiguo`.
   * El contrato nuevo trae la lista completa; el nodo viejo sólo mandaba el
   * conteo, por eso también aceptamos el número y lo exponemos aparte.
   */
  candidatos?: BankCandidato[];
  /** Conteo de candidatos que mandan los nodos viejos (`candidatos: 2`). */
  candidatosTotal?: number;
  /** El candidato único (sólo cuando `estado === "resuelto"`). */
  candidato: BankCandidato | null;
}

/** Campos comunes a cualquier job. */
export interface BankJobBase {
  job_id: string;
  /** Instante de caducidad del job (ISO 8601). */
  expira_en: string;
  /** Código de error del job (sólo en `fallido`). */
  error: string | null;
}

/**
 * Job de verificación, discriminado por `estado`.
 *
 * - `en_cola` / `ejecutando` / `esperando_otp`: el job sigue vivo.
 * - `resuelto` / `sin_coincidencia` / `ambiguo`: terminó con un resultado.
 * - `fallido` / `expirado`: terminó sin resultado utilizable.
 */
export type BankJob =
  | (BankJobBase & {
      estado: "en_cola" | "ejecutando" | "esperando_otp";
    })
  | (BankJobBase & {
      estado: "resuelto" | "sin_coincidencia" | "ambiguo";
      resultado?: BankJobResultado | null;
    })
  | (BankJobBase & {
      estado: "fallido" | "expirado";
    });

/**
 * Error del nodo local (503).
 *
 * No es un fallo genérico: dice que **este** nodo no puede verificar (el
 * scraper no está habilitado o el nodo sirve a otro tenant). La UI lo muestra
 * como "verificación no disponible" y conserva el pegado manual.
 */
export class BankNodeError extends Error {
  readonly status: number;
  /** Código estable del backend (`scraper_no_habilitado`, `tenant_no_servido`). */
  readonly error_codigo: string;

  constructor(status: number, errorCodigo: string, message: string) {
    super(message);
    this.name = "BankNodeError";
    this.status = status;
    this.error_codigo = errorCodigo;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Mensajes de la verificación, indexados sólo por código estable. */
const MENSAJES_ERROR_VERIFICACION: Record<string, string> = {
  scraper_no_habilitado: "Este nodo no verifica transferencias.",
  tenant_no_servido: "Este nodo no atiende este negocio.",
  job_no_encontrado: "La verificación se perdió en el nodo. Volvé a verificar.",
  expirado: "La verificación tardó demasiado. Volvé a intentar.",
  sin_nodo: "No hay nodo disponible para verificar.",
  fallido: "La verificación falló. Volvé a intentar.",
};

const MENSAJE_ERROR_VERIFICACION_GENERICO =
  "No se pudo verificar la transferencia.";

/**
 * Extrae el código estable de un error o de un job.
 *
 * Nunca lee `message`: el contrato sólo garantiza `error_codigo` / `estado`.
 */
function codigoDeErrorDeVerificacion(error: unknown): string | null {
  if (typeof error === "string") return error;
  if (!isRecord(error)) return null;
  if (typeof error.error_codigo === "string") return error.error_codigo;
  if (typeof error.code === "string") return error.code;
  if (typeof error.error === "string") return error.error;
  if (typeof error.estado === "string") return error.estado;
  return null;
}

/**
 * Traduce un error de verificación (o un job terminado) a copy de operador.
 *
 * @returns `null` cuando no hay error; mensaje genérico para códigos desconocidos.
 */
export function mensajeDeErrorDeVerificacion(error: unknown): string | null {
  if (error === null || error === undefined) return null;
  const codigo = codigoDeErrorDeVerificacion(error);
  if (codigo === null) return MENSAJE_ERROR_VERIFICACION_GENERICO;
  return (
    MENSAJES_ERROR_VERIFICACION[codigo] ?? MENSAJE_ERROR_VERIFICACION_GENERICO
  );
}

/**
 * Normaliza el importe a texto con dos decimales.
 *
 * El backend parsea el `valor` como `DECIMAL(18,2)`: mandarlo como `float`
 * perdería precisión y los céntimos.
 */
export function formatBankValor(valor: string | number): string {
  const numero = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(numero)) {
    throw new Error(`El importe a verificar no es un número válido: ${valor}`);
  }
  return numero.toFixed(2);
}

function parseCandidato(raw: unknown): BankCandidato {
  const data = isRecord(raw) ? raw : {};
  const pagadorNombre =
    typeof data.pagadorNombre === "string"
      ? data.pagadorNombre
      : typeof data.pagador_nombre === "string"
        ? data.pagador_nombre
        : "";
  const nitter = typeof data.nitter === "string" ? data.nitter.trim() : "";
  const clienteNombreRaw =
    typeof data.cliente_nombre === "string"
      ? data.cliente_nombre
      : typeof data.clienteNombre === "string"
        ? data.clienteNombre
        : "";
  const candidato: BankCandidato = {
    id: typeof data.id === "string" ? data.id : "",
    valor: typeof data.valor === "string" ? data.valor : String(data.valor ?? ""),
    pagadorNombre,
    referencia: typeof data.referencia === "string" ? data.referencia : "",
    fecha: typeof data.fecha === "string" ? data.fecha : "",
  };
  if (nitter) candidato.nitter = nitter;
  const clienteNombre = clienteNombreRaw.trim();
  if (clienteNombre) candidato.clienteNombre = clienteNombre;
  return candidato;
}

function parseResultado(raw: unknown): BankJobResultado | null {
  if (!isRecord(raw)) return null;
  const resultado: BankJobResultado = {
    candidato: raw.candidato ? parseCandidato(raw.candidato) : null,
  };
  if (isRecord(raw.ventana)) {
    resultado.ventana = {
      desde: String(raw.ventana.desde ?? ""),
      hasta: String(raw.ventana.hasta ?? ""),
    };
  }
  if (typeof raw.nodo === "string") resultado.nodo = raw.nodo;
  if (typeof raw.ingesta_at === "string") resultado.ingesta_at = raw.ingesta_at;
  if (typeof raw.cuenta === "string") resultado.cuenta = raw.cuenta;
  if (typeof raw.paginas === "number") resultado.paginas = raw.paginas;
  if (typeof raw.movimientos === "number") resultado.movimientos = raw.movimientos;
  if (Array.isArray(raw.candidatos)) {
    resultado.candidatos = raw.candidatos.map(parseCandidato);
  } else if (typeof raw.candidatos === "number") {
    resultado.candidatosTotal = raw.candidatos;
  }
  return resultado;
}

function esVencido(expiraEn: string): boolean {
  const instante = Date.parse(expiraEn);
  return Number.isFinite(instante) && instante < Date.now();
}

/**
 * Traduce el body del job a `BankJob`.
 *
 * Un job que ya venció pero sigue en curso se traduce a `expirado`: el
 * operador tiene que volver a verificar, no esperar un resultado que no va
 * a llegar.
 */
function parseJob(raw: unknown): BankJob {
  const data = isRecord(raw) ? raw : {};
  const estadoCrudo = typeof data.estado === "string" ? data.estado : "fallido";
  const base: BankJobBase = {
    job_id: typeof data.job_id === "string" ? data.job_id : "",
    expira_en: typeof data.expira_en === "string" ? data.expira_en : "",
    error: typeof data.error === "string" ? data.error : null,
  };

  const resultado = parseResultado(data.resultado);
  let estado = estadoCrudo as BankJobEstado;

  if (!esEstadoFinal(estado) && base.expira_en && esVencido(base.expira_en)) {
    estado = "expirado";
  }

  if (estado === "resuelto" || estado === "sin_coincidencia" || estado === "ambiguo") {
    return { ...base, estado, resultado };
  }
  if (estado === "en_cola" || estado === "ejecutando" || estado === "esperando_otp") {
    return { ...base, estado };
  }
  return { ...base, estado: estado === "expirado" ? "expirado" : "fallido" };
}

function bankHttpError(status: number, body: unknown): Error {
  if (status === 503) {
    const detail = isRecord(body) && isRecord(body.detail) ? body.detail : {};
    const codigo =
      typeof detail.error_codigo === "string"
        ? detail.error_codigo
        : "nodo_no_disponible";
    const mensaje =
      typeof detail.message === "string" && detail.message.trim().length > 0
        ? detail.message
        : "El nodo local no puede verificar esta transferencia.";
    return new BankNodeError(status, codigo, mensaje);
  }
  if (
    isRecord(body) &&
    isRecord(body.detail) &&
    typeof body.detail.error_codigo === "string"
  ) {
    // `ErpApiError` sólo mapea `detail.code`; la verificación usa
    // `detail.error_codigo`. Preservarlo permite que la UI discrimine por
    // código estable (nunca por el texto del mensaje).
    return new ErpApiError(status, {
      ...parseErpErrorPayload(status, body),
      code: body.detail.error_codigo,
    });
  }
  return toErpApiError(status, body);
}

function throwBankHttpError(status: number, body: unknown): never {
  throw bankHttpError(status, body);
}

async function bankRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const resp = await apiFetch(`${BANK_BASE}${path}`, init);

  if (!resp.ok) {
    throwBankHttpError(resp.status, await resp.json().catch(() => null));
  }

  return (await resp.json()) as T;
}

interface BankRequestWithNode<T> {
  data: T;
  node: string | null;
}

async function bankRequestWithNode<T>(
  path: string,
  init: RequestInit,
): Promise<BankRequestWithNode<T>> {
  const resp = await apiFetch(`${BANK_BASE}${path}`, init);

  if (!resp.ok) {
    throwBankHttpError(resp.status, await resp.json().catch(() => null));
  }

  const data = (await resp.json()) as T;
  return {
    data,
    // The proxy header is trusted; the upstream body `nodo` is only a
    // fallback and must name a known label.
    node: nodeFromResponse(resp) ?? nodeFromBody(data),
  };
}

/** Body de `POST /api/erp/bank/verificaciones`. */
export interface CreateBankVerificationInput {
  /**
   * Documento que se está cobrando. Si viene, se usa el modo `factura`.
   * Sin él se usa el modo `pago` (el POS cobra antes de que exista factura).
   */
  facturaId?: string;
  /** Importe a verificar (se envía como texto con dos decimales). */
  valor: string | number;
  /**
   * NIT del cliente (señal opcional del modo `pago`). Nunca decide el
   * match: sólo agrega `coincide_nombre` al resultado.
   */
  nitter?: string;
  /** Nombre esperado del cliente (señal opcional del modo `pago`). */
  nombreEsperado?: string;
  /**
   * Día a consultar (`AAAA-MM-DD`). Sin esto el nodo mira el día en curso.
   * Sirve para verificar un pago que entró ayer cuando la venta se cierra hoy.
   */
  fecha?: string;
}

/**
 * `POST /api/erp/bank/verificaciones` — pide la verificación al nodo local.
 *
 * Dos modos excluyentes:
 * - `facturaId` presente → `{ factura_id, valor }`.
 * - `facturaId` ausente → `{ modo: "pago", valor, nitter?, nombre_esperado? }`.
 *   En este modo `factura_id` es prohibido (el backend responde 422).
 *
 * `fecha` (opcional, ambos modos) mueve la ventana de ese job a un día
 * concreto. Sin ella se consulta el día en curso.
 *
 * Devuelve el job recién creado (estado `en_cola`): el front lo sondea con
 * `useBankVerification` hasta que llega a un estado final.
 */
export async function createBankVerification(
  input: CreateBankVerificationInput,
): Promise<BankJob> {
  const valor = formatBankValor(input.valor);
  const fecha = input.fecha ? { fecha: input.fecha } : {};
  const body = input.facturaId
    ? JSON.stringify({ factura_id: input.facturaId, valor, ...fecha })
    : JSON.stringify({
        modo: "pago",
        valor,
        ...(input.nitter ? { nitter: input.nitter } : {}),
        ...(input.nombreEsperado
          ? { nombre_esperado: input.nombreEsperado }
          : {}),
        ...fecha,
      });
  const { data, node } = await bankRequestWithNode<unknown>(
    "/verificaciones",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": generateRequestId(),
      },
      body,
    },
  );
  const job = parseJob(data);
  if (node && job.job_id) {
    bankJobNodes.set(job.job_id, node);
  }
  return job;
}

/**
 * Parses a job and forgets its affinity once it reached a terminal state, so
 * `bankJobNodes` does not grow forever.
 */
function parseJobAndForget(jobId: string, raw: unknown): BankJob {
  const job = parseJob(raw);
  if (esEstadoFinal(job.estado)) {
    bankJobNodes.delete(jobId);
  }
  return job;
}

function pollBankVerification(
  jobId: string,
  node: string | null,
  skipNode: string | null = null,
): Promise<Response> {
  return apiFetch(`${BANK_BASE}/verificaciones/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: {
      "X-Request-Id": generateRequestId(),
      ...(node ? { [BANK_NODE_HEADER]: node } : {}),
      ...(skipNode ? { [BANK_SKIP_NODE_HEADER]: skipNode } : {}),
    },
  });
}

/**
 * `GET /api/erp/bank/verificaciones/{job_id}` — estado del job.
 *
 * Si el POST nos dijo qué nodo aceptó el job, todos los sondeos se fijan a ese
 * nodo. Un `job_no_encontrado` se reintenta ahí mismo hasta 3 veces (el job
 * puede estar apareciendo). Un nodo caído (5xx o error de red) no se reintenta:
 * se trata como miss y se pasa directo al fallback.
 *
 * En ambos casos el fallback es **un solo** intento sin pin, pidiéndole al
 * proxy que elija un nodo distinto al que acaba de fallar. Si ese intento
 * también falla se propaga el error original.
 */
export async function getBankVerification(jobId: string): Promise<BankJob> {
  const pinnedNode = bankJobNodes.get(jobId) ?? null;

  if (!pinnedNode) {
    const resp = await pollBankVerification(jobId, null);
    if (!resp.ok) {
      throwBankHttpError(resp.status, await resp.json().catch(() => null));
    }
    captureNode(jobId, resp);
    return parseJobAndForget(jobId, await resp.json());
  }

  let originalError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let resp: Response;
    try {
      resp = await pollBankVerification(jobId, pinnedNode);
    } catch (err) {
      // Network error before the pinned node answered: behave like a miss and
      // go straight to the single distinct fallback.
      originalError = err instanceof Error ? err : new Error(String(err));
      break;
    }

    if (resp.ok) {
      captureNode(jobId, resp);
      return parseJobAndForget(jobId, await resp.json());
    }

    const body: unknown = await resp.json().catch(() => null);

    if (esJobNoEncontrado(resp.status, body)) {
      originalError = bankHttpError(resp.status, body);
      if (attempt < 3) {
        await delay(BANK_NODE_RETRY_DELAYS_MS[attempt - 1] ?? 300);
        continue;
      }
      break;
    }

    if (resp.status >= 500) {
      // Dead/unhealthy pinned node: no retry loop, one fallback attempt.
      originalError = bankHttpError(resp.status, body);
      break;
    }

    // Any other client error is terminal: no retry, no failover.
    throwBankHttpError(resp.status, body);
  }

  // Single unpinned fallback, explicitly excluding the node that just failed.
  let fallbackResp: Response;
  try {
    fallbackResp = await pollBankVerification(jobId, null, pinnedNode);
  } catch (fallbackError) {
    throw originalError ?? fallbackError;
  }

  if (!fallbackResp.ok) {
    // Surface the original pinned failure; the fallback was only a best effort.
    await fallbackResp.json().catch(() => null);
    throw originalError ?? bankHttpError(fallbackResp.status, null);
  }

  const nextNode = captureNode(jobId, fallbackResp);
  if (!nextNode) bankJobNodes.delete(jobId);
  return parseJobAndForget(jobId, await fallbackResp.json());
}

/** Parámetros de `GET /api/erp/bank/candidates`. */
export interface ListBankCandidatesParams {
  /** Importe buscado (se envía como texto con dos decimales). */
  valor: string | number;
  /** Inicio de la ventana (`YYYY-MM-DD`). Por defecto: hoy. */
  desde?: string;
  /** Fin de la ventana (`YYYY-MM-DD`). Por defecto: hoy. */
  hasta?: string;
}

/**
 * `GET /api/erp/bank/candidates` — candidatos con el mismo importe.
 *
 * Sin coincidencia la respuesta es **200** con `candidatos: []`: no es un
 * error. Con dos o más candidatos `ambiguo` es `true` y **no** se elige
 * ninguno: la elección es del operador.
 */
export async function listBankCandidates(
  params: ListBankCandidatesParams,
): Promise<BankCandidatos> {
  const query = new URLSearchParams();
  query.set("valor", formatBankValor(params.valor));
  if (params.desde) query.set("desde", params.desde);
  if (params.hasta) query.set("hasta", params.hasta);

  const raw = await bankRequest<unknown>(`/candidates?${query.toString()}`, {
    method: "GET",
    headers: { "X-Request-Id": generateRequestId() },
  });

  const data = isRecord(raw) ? raw : {};
  const ventana = isRecord(data.ventana) ? data.ventana : {};
  const candidatos = Array.isArray(data.candidatos)
    ? data.candidatos.map(parseCandidato)
    : [];

  return {
    ambiguo: data.ambiguo === true,
    ventana: {
      desde: String(ventana.desde ?? ""),
      hasta: String(ventana.hasta ?? ""),
    },
    candidatos,
    ultimaIngestaAt:
      typeof data.ultimaIngestaAt === "string" ? data.ultimaIngestaAt : null,
  };
}

/**
 * `resultado` del job cuando el estado lo trae.
 *
 * `BankJob` es una union discriminada: el `resultado` solo existe en los
 * estados finales con datos (`resuelto`, `sin_coincidencia`, `ambiguo`). Este
 * helper evita repetir el estrechamiento en cada uso de la UI.
 */
export function resultadoDelJob(job: BankJob | null | undefined): BankJobResultado | null {
  if (!job || !("resultado" in job)) return null;
  return job.resultado ?? null;
}
