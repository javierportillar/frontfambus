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
  /** Número de candidatos encontrados por el nodo. */
  candidatos?: number;
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
  return {
    id: typeof data.id === "string" ? data.id : "",
    valor: typeof data.valor === "string" ? data.valor : String(data.valor ?? ""),
    pagadorNombre,
    referencia: typeof data.referencia === "string" ? data.referencia : "",
    fecha: typeof data.fecha === "string" ? data.fecha : "",
  };
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
  if (typeof raw.candidatos === "number") resultado.candidatos = raw.candidatos;
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
  /** Documento que se está cobrando (la factura de la captura). */
  facturaId: string;
  /** Importe a verificar (se envía como texto con dos decimales). */
  valor: string | number;
}

/**
 * `POST /api/erp/bank/verificaciones` — pide la verificación al nodo local.
 *
 * Devuelve el job recién creado (estado `en_cola`): el front lo sondea con
 * `useBankVerification` hasta que llega a un estado final.
 */
export async function createBankVerification(
  input: CreateBankVerificationInput,
): Promise<BankJob> {
  const body = JSON.stringify({
    factura_id: input.facturaId,
    valor: formatBankValor(input.valor),
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

/** Estados del ciclo de conciliación de un movimiento (espejo del backend). */
export const BANK_MOVIMIENTO_ESTADOS = [
  "PENDIENTE",
  "APLICADO",
  "AMBIGUA",
  "SIN_MATCH",
  "SOBREPAGO",
  "IGNORADO",
] as const;

export type BankMovimientoEstado = (typeof BANK_MOVIMIENTO_ESTADOS)[number];

/** Un movimiento raspado del portal, ya conciliado contra las facturas. */
export interface BankMovimiento {
  /** Identificador de dominio (`uuid5` del tenant + id externo). */
  id: string;
  /** Fecha del movimiento (`YYYY-MM-DD`); es la fecha del documento. */
  fecha: string;
  /** Importe como texto con dos decimales (`"100000.00"`): nunca `float`. */
  valor: string;
  descripcion: string;
  /** Referencia saneada que publicó el banco (puede venir vacía). */
  referencia: string;
  pagadorNombre: string;
  estado: BankMovimientoEstado;
  /** Documento generado al aplicar (recibo o consignación), si ya se aplicó. */
  reciboNumero: string | null;
  /** Puntaje de la mejor candidata (0-100), si ya se concilió. */
  confianza: number | null;
  /** Señales que explican el puntaje, en una línea legible. */
  razones: string | null;
}

/** Estados en los que el operador todavía puede resolver a mano. */
export const BANK_ESTADOS_RESOLUBLES: readonly BankMovimientoEstado[] = [
  "AMBIGUA",
  "SOBREPAGO",
  "SIN_MATCH",
];

function parseMovimiento(raw: unknown): BankMovimiento {
  const data = isRecord(raw) ? raw : {};
  const estado = BANK_MOVIMIENTO_ESTADOS.includes(
    data.estado as BankMovimientoEstado,
  )
    ? (data.estado as BankMovimientoEstado)
    : "PENDIENTE";
  return {
    id: typeof data.id === "string" ? data.id : "",
    fecha: typeof data.fecha === "string" ? data.fecha : "",
    valor: typeof data.valor === "string" ? data.valor : String(data.valor ?? ""),
    descripcion: typeof data.descripcion === "string" ? data.descripcion : "",
    referencia: typeof data.referencia === "string" ? data.referencia : "",
    pagadorNombre:
      typeof data.pagadorNombre === "string" ? data.pagadorNombre : "",
    estado,
    reciboNumero:
      typeof data.reciboNumero === "string" ? data.reciboNumero : null,
    confianza: typeof data.confianza === "number" ? data.confianza : null,
    razones: typeof data.razones === "string" ? data.razones : null,
  };
}

/** Parámetros de `GET /api/erp/bank/movements`. */
export interface ListBankMovementsParams {
  estado?: BankMovimientoEstado | "";
  /** Inicio del rango (`YYYY-MM-DD`), inclusivo. */
  desde?: string;
  /** Fin del rango (`YYYY-MM-DD`), inclusivo. */
  hasta?: string;
}

/**
 * `GET /api/erp/bank/movements` — movimientos del tenant activo.
 *
 * El tenant sale del request (header `X-Tenant`), nunca de un parámetro: la
 * lista no puede pedir movimientos ajenos.
 */
export async function listBankMovements(
  params: ListBankMovementsParams = {},
): Promise<BankMovimiento[]> {
  const query = new URLSearchParams();
  if (params.estado) query.set("estado", params.estado);
  if (params.desde) query.set("desde", params.desde);
  if (params.hasta) query.set("hasta", params.hasta);
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const raw = await bankRequest<unknown>(`/movements${suffix}`, {
    method: "GET",
    headers: { "X-Request-Id": generateRequestId() },
  });

  const data = isRecord(raw) ? raw : {};
  return Array.isArray(data.movimientos)
    ? data.movimientos.map(parseMovimiento)
    : [];
}

/** Estado de sincronización del nodo local para el tenant activo. */
export interface BankSyncStatus {
  ultimaIngestaAt: string | null;
  nodo: string | null;
  scraperHabilitado: boolean;
  ventana: BankVentana | null;
}

/** `GET /api/erp/bank/sync-status` — última ingesta, nodo y ventana. */
export async function getBankSyncStatus(): Promise<BankSyncStatus> {
  const raw = await bankRequest<unknown>("/sync-status", {
    method: "GET",
    headers: { "X-Request-Id": generateRequestId() },
  });

  const data = isRecord(raw) ? raw : {};
  const ventana = isRecord(data.ventana) ? data.ventana : null;
  return {
    ultimaIngestaAt:
      typeof data.ultimaIngestaAt === "string" ? data.ultimaIngestaAt : null,
    nodo: typeof data.nodo === "string" ? data.nodo : null,
    scraperHabilitado: data.scraperHabilitado === true,
    ventana: ventana
      ? { desde: String(ventana.desde ?? ""), hasta: String(ventana.hasta ?? "") }
      : null,
  };
}

/** Resultado de aplicar un movimiento. */
export interface BankApplyResult {
  movimientoId: string;
  /** Número del documento generado (recibo o consignación). */
  documento: string;
  prefijo: string;
  /** `true` cuando el backend devolvió el documento ya existente. */
  replay: boolean;
}

export interface ApplyBankMovementInput {
  /** Factura a cobrar. `null` ⇒ consignación bancaria. */
  facturaId?: string | null;
  /** Clave de idempotencia: la misma en cada reintento de la misma acción. */
  idempotencyKey: string;
}

/**
 * `POST /api/erp/bank/reconciliation/{id}/apply` — confirma la aplicación.
 *
 * Es una escritura contable: la decide el operador, nunca la página sola. Con
 * la misma `idempotencyKey` el backend no duplica el documento.
 */
export async function applyBankMovement(
  movimientoId: string,
  input: ApplyBankMovementInput,
): Promise<BankApplyResult> {
  const query = new URLSearchParams();
  if (input.facturaId) query.set("factura_id", input.facturaId);
  const suffix = query.toString() ? `?${query.toString()}` : "";

  const raw = await bankRequest<unknown>(
    `/reconciliation/${encodeURIComponent(movimientoId)}/apply${suffix}`,
    {
      method: "POST",
      headers: {
        "Idempotency-Key": input.idempotencyKey,
        "X-Request-Id": generateRequestId(),
      },
    },
  );

  const data = isRecord(raw) ? raw : {};
  return {
    movimientoId: String(data.movimiento_id ?? movimientoId),
    documento: String(data.documento ?? ""),
    prefijo: String(data.prefijo ?? ""),
    replay: data.replay === true,
  };
}
