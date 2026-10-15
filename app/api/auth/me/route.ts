import { NextRequest, NextResponse } from "next/server";
import { fetchWithFailover } from "@/lib/api/backendFailover";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("motoshop_token")?.value;

  if (!token) {
    return NextResponse.json({ detail: "No autenticado" }, { status: 401 });
  }

  try {
    // This endpoint is session- and tenant-specific, so it must never be
    // reused from Next's data cache across requests.
    const headers = new Headers({ Authorization: `Bearer ${token}` });
    const tenant = req.headers.get("x-tenant") ?? req.cookies.get("motoshop_tenant")?.value;
    if (tenant) {
      headers.set("X-Tenant", tenant);
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
