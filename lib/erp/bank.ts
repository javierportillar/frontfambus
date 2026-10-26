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
import { toErpApiError } from "./errors";
import { generateRequestId } from "./idempotency";

const BANK_BASE = "/api/erp/bank";

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

async function bankRequest<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const resp = await apiFetch(`${BANK_BASE}${path}`, init);

  if (!resp.ok) {
    const body = await resp.json().catch(() => null);
    if (resp.status === 503) {
      const detail = isRecord(body) && isRecord(body.detail) ? body.detail : {};
      const codigo =
        typeof detail.error_codigo === "string"
          ? detail.error_codigo
          : "nodo_no_disponible";
      const mensaje =
        typeof detail.message === "string" && detail.message.trim().length > 0
          ? detail.message
          : "El nodo local no puede verificar esta transferencia.";
      throw new BankNodeError(resp.status, codigo, mensaje);
    }
    throw toErpApiError(resp.status, body);
  }

  return (await resp.json()) as T;
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
}

/**
 * `POST /api/erp/bank/verificaciones` — pide la verificación al nodo local.
 *
 * Dos modos excluyentes:
 * - `facturaId` presente → `{ factura_id, valor }`.
 * - `facturaId` ausente → `{ modo: "pago", valor, nitter?, nombre_esperado? }`.
 *   En este modo `factura_id` es prohibido (el backend responde 422).
 *
 * Devuelve el job recién creado (estado `en_cola`): el front lo sondea con
 * `useBankVerification` hasta que llega a un estado final.
 */
export async function createBankVerification(
  input: CreateBankVerificationInput,
): Promise<BankJob> {
  const valor = formatBankValor(input.valor);
  const body = input.facturaId
    ? JSON.stringify({ factura_id: input.facturaId, valor })
    : JSON.stringify({
        modo: "pago",
        valor,
        ...(input.nitter ? { nitter: input.nitter } : {}),
        ...(input.nombreEsperado
          ? { nombre_esperado: input.nombreEsperado }
          : {}),
      });
  const raw = await bankRequest<unknown>("/verificaciones", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": generateRequestId(),
    },
    body,
  });
  return parseJob(raw);
}

/** `GET /api/erp/bank/verificaciones/{job_id}` — estado del job. */
export async function getBankVerification(jobId: string): Promise<BankJob> {
  const raw = await bankRequest<unknown>(
    `/verificaciones/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      headers: { "X-Request-Id": generateRequestId() },
    },
  );
  return parseJob(raw);
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
