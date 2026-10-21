/**
 * Cliente del API de escrituras de maestros (`/api/erp/{terceros,productos}`).
 *
 * Contrato con el backend (spec erp-masters-write):
 * - `POST /api/erp/terceros`  → requiere header `Idempotency-Key` (UUID v4).
 * - `PATCH /api/erp/terceros/{id}` → sin idempotencia (el backend ignora el
 *   cache de replay en las ediciones: "edits never read the replay cache").
 * - `GET` → lecturas abiertas a cualquier rol del tenant habilitado.
 *
 * Todas las respuestas de error se normalizan a `ErpApiError` con los errores
 * por campo listos para pintarse (ver `lib/erp/errors.ts`).
 */

import { apiFetch } from "@/lib/api/client";
import { toErpApiError } from "./errors";
import { generateIdempotencyKey, generateRequestId } from "./idempotency";
import type {
  ProductCreatePayload,
  ProductUpdatePayload,
  Producto,
  Tercero,
  TerceroCreatePayload,
  TerceroUpdatePayload,
} from "./types";

const ERP_BASE = "/api/erp";

interface ErpRequestOptions {
  method: "GET" | "POST" | "PATCH";
  body?: unknown;
  /** Solo en altas: el backend exige UUID v4 y lo usa como clave de replay. */
  idempotencyKey?: string;
}

async function erpRequest<T>(
  path: string,
  options: ErpRequestOptions,
): Promise<T> {
  const headers: Record<string, string> = {
    "X-Request-Id": generateRequestId(),
  };
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const init: RequestInit = {
    method: options.method,
    headers,
    credentials: "include",
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const resp = await apiFetch(`${ERP_BASE}${path}`, init);

  if (!resp.ok) {
    const body = await resp.json().catch(() => null);
    throw toErpApiError(resp.status, body);
  }

  if (resp.status === 204) {
    return undefined as T;
  }
  return (await resp.json()) as T;
}

/** Parámetros de paginación/búsqueda de las listas de maestros. */
export interface MastersListParams {
  search?: string;
  limit?: number;
  offset?: number;
}

function buildListQuery(params: MastersListParams): string {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  query.set("limit", String(params.limit ?? 50));
  query.set("offset", String(params.offset ?? 0));
  return query.toString();
}

// ── Terceros ─────────────────────────────────────────────────────────────

/** `GET /api/erp/terceros` */
export async function listTerceros(
  params: MastersListParams = {},
): Promise<Tercero[]> {
  return erpRequest<Tercero[]>(
    `/terceros?${buildListQuery(params)}`,
    { method: "GET" },
  );
}

/** `GET /api/erp/terceros/{id}` */
export async function getTercero(nitter: string): Promise<Tercero> {
  return erpRequest<Tercero>(
    `/terceros/${encodeURIComponent(nitter)}`,
    { method: "GET" },
  );
}

/**
 * `POST /api/erp/terceros`
 *
 * @param payload Body `TerceroCreate`.
 * @param idempotencyKey Clave de replay; si se omite se genera una nueva.
 */
export async function createTercero(
  payload: TerceroCreatePayload,
  idempotencyKey: string = generateIdempotencyKey(),
): Promise<Tercero> {
  return erpRequest<Tercero>("/terceros", {
    method: "POST",
    body: payload,
    idempotencyKey,
  });
}

/** `PATCH /api/erp/terceros/{id}` */
export async function updateTercero(
  nitter: string,
  payload: TerceroUpdatePayload,
): Promise<Tercero> {
  return erpRequest<Tercero>(
    `/terceros/${encodeURIComponent(nitter)}`,
    { method: "PATCH", body: payload },
  );
}

// ── Productos ────────────────────────────────────────────────────────────

/** `GET /api/erp/productos` */
export async function listProductos(
  params: MastersListParams = {},
): Promise<Producto[]> {
  return erpRequest<Producto[]>(
    `/productos?${buildListQuery(params)}`,
    { method: "GET" },
  );
}

/** `GET /api/erp/productos/{id}` */
export async function getProducto(codprod: string): Promise<Producto> {
  return erpRequest<Producto>(
    `/productos/${encodeURIComponent(codprod)}`,
    { method: "GET" },
  );
}

/**
 * `POST /api/erp/productos`
 *
 * @param payload Body `ProductCreate`.
 * @param idempotencyKey Clave de replay; si se omite se genera una nueva.
 */
export async function createProducto(
  payload: ProductCreatePayload,
  idempotencyKey: string = generateIdempotencyKey(),
): Promise<Producto> {
  return erpRequest<Producto>("/productos", {
    method: "POST",
    body: payload,
    idempotencyKey,
  });
}

/** `PATCH /api/erp/productos/{id}` */
export async function updateProducto(
  codprod: string,
  payload: ProductUpdatePayload,
): Promise<Producto> {
  return erpRequest<Producto>(
    `/productos/${encodeURIComponent(codprod)}`,
    { method: "PATCH", body: payload },
  );
}
