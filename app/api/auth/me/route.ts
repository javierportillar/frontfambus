import { NextRequest, NextResponse } from "next/server";
import { fetchWithFailover } from "@/lib/api/backendFailover";

function decodeToken(token: string): Record<string, unknown> {
  try {
    const b64 = token.split(".")[1] ?? "";
    return JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("motoshop_token")?.value;

  if (!token) {
    return NextResponse.json({ detail: "No autenticado" }, { status: 401 });
  }

  try {
    // This endpoint is session- and tenant-specific, so it must never be
    // reused from Next's data cache across requests.
    const payload = decodeToken(token);
    const allowedTenants = Array.isArray(payload.tenants_allowed)
      ? (payload.tenants_allowed as string[])
      : [];

    const headers = new Headers({ Authorization: `Bearer ${token}` });
    const rawTenant = req.headers.get("x-tenant") ?? req.cookies.get("motoshop_tenant")?.value;

    let effectiveTenant: string | null = null;
    if (allowedTenants.length > 0) {
      if (rawTenant && allowedTenants.includes(rawTenant)) {
        effectiveTenant = rawTenant;
      } else if (allowedTenants.length === 1) {
        effectiveTenant = allowedTenants[0] ?? null;
      }
    } else {
      effectiveTenant = rawTenant ?? null;
    }
    if (effectiveTenant) {
      headers.set("X-Tenant", effectiveTenant);
    }

    const { resp, isFallback } = await fetchWithFailover(`/api/auth/me`, {
      headers,
      cache: "no-store",
    });

    if (!resp.ok) {
      const error = await resp.json().catch(() => ({ detail: "Error de autenticación" }));
      return NextResponse.json(error, { status: resp.status });
    }

    const data = await resp.json();
    const res = NextResponse.json(data);
    if (isFallback) {
      res.headers.set("x-backend-source", "fallback");
    }
    return res;
  } catch {
    return NextResponse.json(
      { detail: "No se pudo conectar con el servidor" },
      { status: 502 },
    );
  }
}
