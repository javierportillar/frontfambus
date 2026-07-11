import { NextRequest, NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.fragloesja.uk";

async function proxyRequest(req: NextRequest, path: string): Promise<NextResponse> {
  const url = new URL(req.url);
  const targetUrl = `${API_BASE}/api/${path}${url.search}`;

  const headers = new Headers();
  const cookieHeader = req.headers.get("cookie");
  if (cookieHeader) {
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

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.arrayBuffer();
  }

  try {
    const resp = await fetch(targetUrl, init);
    const contentType = resp.headers.get("content-type") ?? "application/json";

    return new NextResponse(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: {
        "content-type": contentType,
        "access-control-allow-origin": "*",
      },
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
