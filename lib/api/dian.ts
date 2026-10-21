/**
 * API Client para la Facturación Electrónica DIAN y Cola de Transmisión.
 * Consume los endpoints bajo /api/erp/dian/* con soporte de failover cluster y multi-tenant.
 */

import { fetchWithFailover } from "./backendFailover";
import { useAuthStore } from "@/lib/auth/store";

export type DianStatus =
  | "PENDING"
  | "SENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "FAILED"
  | "CANCELLED";

export interface DianDoc {
  sale_id: string;
  doc_number: string;
  cufe: string | null;
  qr_url: string | null;
  status: DianStatus;
  sent_at: string | null;
  accepted_at: string | null;
  error_message: string | null;
  retry_count: number;
  track_id: string | null;
  estfele: number | null;
}

export interface DianQueueSummary {
  total: number;
  accepted: number;
  pending: number;
  failed: number;
  rejected: number;
}

export interface DianQueueResponse extends DianQueueSummary {
  documents: DianDoc[];
}

export interface DianRetryPayload {
  sale_id: string;
  force?: boolean;
}

function resolveTenant(tenant?: string): string {
  if (tenant && tenant.trim()) return tenant.trim();
  try {
    const current = useAuthStore.getState().currentTenant;
    if (current) return current;
  } catch {
    // Entorno no hidratado o sin Zustand
  }
  return "motoshop";
}

/**
 * Consulta la cola de documentos electrónicos DIAN con métricas consolidadas.
 *
 * @param statusFilter Filtro opcional por estado (PENDING, SENDING, ACCEPTED, REJECTED, FAILED, CANCELLED)
 * @param tenant Slug del negocio (default: tenant activo en sesión)
 */
export async function fetchDianQueueStatus(
  statusFilter?: string,
  tenant?: string,
): Promise<DianQueueResponse> {
  const activeTenant = resolveTenant(tenant);
  const queryParam = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
  const path = `/api/erp/dian/status${queryParam}`;

  const res = await fetchWithFailover(path, {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": activeTenant,
    },
  });

  if (!res.resp.ok) {
    let errorDetail = `Error consultando estado DIAN (${res.resp.status})`;
    try {
      const errJson = await res.resp.json();
      if (errJson?.detail) errorDetail = errJson.detail;
    } catch {
      // Ignorar fallo de parseo JSON
    }
    throw new Error(errorDetail);
  }

  return (await res.resp.json()) as DianQueueResponse;
}

/**
 * Obtiene el detalle, CUFE y URL de verificación QR de una venta específica.
 *
 * @param saleId ID de la venta en el ERP
 * @param tenant Slug del negocio
 */
export async function fetchDianDocument(
  saleId: string,
  tenant?: string,
): Promise<DianDoc | null> {
  const activeTenant = resolveTenant(tenant);
  const path = `/api/erp/dian/document/${encodeURIComponent(saleId)}`;

  const res = await fetchWithFailover(path, {
    method: "GET",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": activeTenant,
    },
  });

  if (res.resp.status === 404) {
    return null;
  }

  if (!res.resp.ok) {
    let errorDetail = `Error obteniendo documento DIAN (${res.resp.status})`;
    try {
      const errJson = await res.resp.json();
      if (errJson?.detail) errorDetail = errJson.detail;
    } catch {
      // Ignorar fallo de parseo
    }
    throw new Error(errorDetail);
  }

  return (await res.resp.json()) as DianDoc;
}

/**
 * Reintenta la transmisión electrónica ante la DIAN para una venta fallida o pendiente.
 * Requiere rol de Administrador o Gerente.
 *
 * @param saleId ID de la venta a reintentar
 * @param force Si es true, reinicia el contador de reintentos e ignora backoff
 * @param tenant Slug del negocio
 */
export async function retryDianTransmission(
  saleId: string,
  force = false,
  tenant?: string,
): Promise<DianDoc> {
  const activeTenant = resolveTenant(tenant);
  const path = `/api/erp/dian/retry/${encodeURIComponent(saleId)}`;

  const payload: DianRetryPayload = {
    sale_id: saleId,
    force,
  };

  const res = await fetchWithFailover(path, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Tenant": activeTenant,
    },
    body: JSON.stringify(payload),
  });

  if (res.resp.status === 403) {
    throw new Error(
      "No tiene permisos de Administrador o Gerente para reintentar transmisiones DIAN.",
    );
  }

  if (!res.resp.ok) {
    let errorDetail = `Error reintentando transmisión DIAN (${res.resp.status})`;
    try {
      const errJson = await res.resp.json();
      if (errJson?.detail) errorDetail = errJson.detail;
    } catch {
      // Ignorar fallo de parseo
    }
    throw new Error(errorDetail);
  }

  return (await res.resp.json()) as DianDoc;
}
