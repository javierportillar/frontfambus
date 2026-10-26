import { NextRequest, NextResponse } from "next/server";
import {
  bankNodeBaseForLabel,
  bankNodeLabelForBase,
  fetchFromBase,
  fetchWithFailoverDetailed,
  resolveDistinctFailoverBase,
} from "@/lib/api/backendFailover";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BANK_VERIFICACIONES_PATH = "/api/erp/bank/verificaciones";
const BANK_JOB_PATH = /^\/api\/erp\/bank\/verificaciones\/[^/]+$/;
/**
 * Internal header used by the bank client for its single unpinned fallback: the
 * proxy must pick a base distinct from the pinned node that just failed.
 */
const BANK_SKIP_NODE_HEADER = "x-bank-skip-node";

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function proxyRequest(req: NextRequest, path: string): Promise<NextResponse> {
  const url = new URL(req.url);
  const pathAndQuery = `/api/${path}${url.search}`;

  const headers = new Headers();
  const cookieHeader = req.headers.get("cookie");
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    headers.set("Authorization", authHeader);
  } else if (cookieHeader) {
    const tokenMatch = cookieHeader.match(/(?:^|;\s*)motoshop_token=([^;]*)/);
    if (tokenMatch?.[1]) {
      headers.set("Authorization", `Bearer ${decodeURIComponent(tokenMatch[1])}`);
    }
  }

  // Multi-tenant (M2 fix 2026-06-15): el proxy NO reenviaba X-Tenant al backend.
  // El cliente lo seteaba via lib/api/client.ts pero aca se descartaba al crear
  // un Headers() nuevo. Resultado: el backend nunca veia el tenant y defaulteaba
  // a motoshop, asi MasVital y MotoShop mostraban los mismos datos.
  // Fallback: cookie motoshop_tenant para SSR y edge cases.
  let tenant = req.headers.get("x-tenant");
  if (!tenant && cookieHeader) {
    const tenantMatch = cookieHeader.match(/(?:^|;\s*)motoshop_tenant=([^;]*)/);
    if (tenantMatch?.[1]) {
      tenant = decodeURIComponent(tenantMatch[1]);
    }
  }
  if (tenant) {
    headers.set("X-Tenant", tenant);
  }

  // BUG-FIX 2026-06-18: el proxy no reenviaba Content-Type/Accept del cliente.
  // El backend FastAPI/Pydantic recibia el body sin tipo declarado y lo trataba
  // como string crudo → 422 "Input should be a valid dictionary" en POST/PATCH
  // con JSON body. Fix: copiar headers relevantes del request original.
  const contentType = req.headers.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  const accept = req.headers.get("accept");
  if (accept) {
    headers.set("Accept", accept);
  }

  // BUG-FIX 2026-07-11: el proxy no reenviaba Idempotency-Key. Los endpoints de
  // caducidad (POST /api/expiry/receipts y /lots/{id}/adjustments) lo requieren
  // como header (Header(alias="Idempotency-Key")); sin él FastAPI devolvía 422
  // "field required" y la recepción/ajuste fallaba desde el navegador (directo
  // al backend sí funcionaba). Fix: reenviar el header tal cual.
  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }

  // Forward conditional request headers for cache validation (304 Not Modified)
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch) {
    headers.set("If-None-Match", ifNoneMatch);
  }
  const ifModifiedSince = req.headers.get("if-modified-since");
  if (ifModifiedSince) {
    headers.set("If-Modified-Since", ifModifiedSince);
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    signal: req.signal,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  try {
    const pathname = pathAndQuery.split("?")[0] ?? pathAndQuery;
    const isBankCreate =
      req.method === "POST" && pathname === BANK_VERIFICACIONES_PATH;
    const isBankJobPoll = req.method === "GET" && BANK_JOB_PATH.test(pathname);
    const pinnedBase = isBankJobPoll
      ? bankNodeBaseForLabel(req.headers.get("x-bank-node"))
      : null;
    const skipBase = isBankJobPoll
      ? bankNodeBaseForLabel(req.headers.get(BANK_SKIP_NODE_HEADER))
      : null;

    let resp: Response;
    let isFallback: boolean;
    let base: string;

    if (pinnedBase) {
      resp = await fetchFromBase(pinnedBase, pathAndQuery, init);
      isFallback = false;
      base = pinnedBase;
    } else if (skipBase) {
      const distinctBase = resolveDistinctFailoverBase(tenant, skipBase);
      if (!distinctBase) {
        // No node other than the failed pin: the client surfaces its original
        // error, so a generic 502 is the honest answer here.
        return NextResponse.json(
          { detail: "API no disponible" },
          { status: 502 },
        );
      }
      resp = await fetchFromBase(distinctBase, pathAndQuery, init);
      isFallback = true;
      base = distinctBase;
    } else {
      const detailed = await fetchWithFailoverDetailed(pathAndQuery, init);
      resp = detailed.response;
      isFallback = detailed.isFallback;
      base = detailed.base;
    }

    const nodeLabel = bankNodeLabelForBase(base);
    const respHeaders: Record<string, string> = {
      "access-control-allow-origin": "*",
      // Report the real answering node: a pinned local node must never claim
      // to be "primary".
      "x-backend-source": nodeLabel ?? (isFallback ? "fallback" : "primary"),
    };

    if (nodeLabel && (isBankCreate || isBankJobPoll)) {
      respHeaders["x-bank-node"] = nodeLabel;
    }

    const contentType = resp.headers.get("content-type");
    if (contentType) {
      respHeaders["content-type"] = contentType;
    } else if (resp.status !== 304 && resp.status !== 204) {
      respHeaders["content-type"] = "application/json";
    }

    const contentDisposition = resp.headers.get("content-disposition");
    if (contentDisposition) {
      respHeaders["content-disposition"] = contentDisposition;
    }

    const etag = resp.headers.get("etag");
    if (etag) {
      respHeaders["etag"] = etag;
    }

    const cacheControl = resp.headers.get("cache-control");
    if (cacheControl) {
      respHeaders["cache-control"] = cacheControl;
    }

    const vary = resp.headers.get("vary");
    if (vary) {
      respHeaders["vary"] = vary;
    }

    if (resp.status === 304) {
      return new NextResponse(null, {
        status: 304,
        statusText: resp.statusText,
        headers: respHeaders,
      });
    }

    // Bank job creation: keep the existing JSON fields and add `nodo` so the
    // browser can pin every later poll to the node that accepted the job.
    if (isBankCreate && resp.status === 202 && nodeLabel) {
      const parsed = await resp
        .clone()
        .json()
        .catch(() => null);
      if (isJsonObject(parsed)) {
        respHeaders["content-type"] = "application/json";
        return new NextResponse(JSON.stringify({ ...parsed, nodo: nodeLabel }), {
          status: resp.status,
          statusText: resp.statusText,
          headers: respHeaders,
        });
      }
    }

    return new NextResponse(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    return NextResponse.json(
      { detail: "API no disponible" },
      { status: 502 },
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(req, params.path.join("/"));
}

export async function POST(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(req, params.path.join("/"));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(req, params.path.join("/"));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(req, params.path.join("/"));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { path: string[] } },
) {
  return proxyRequest(req, params.path.join("/"));
}
