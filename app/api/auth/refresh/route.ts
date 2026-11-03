import { NextRequest, NextResponse } from "next/server";
import {
  fetchFromBase,
  fetchWithFailover,
  resolveTenantNodeBase,
} from "@/lib/api/backendFailover";

export async function POST(req: NextRequest) {
  const refreshToken = req.cookies.get("motoshop_refresh")?.value;

  if (!refreshToken) {
    return NextResponse.json({ detail: "No refresh token" }, { status: 401 });
  }

  // El refresh se valida con el `jwt_secret` del nodo que lo emitió. Si se
  // manda por el cascade genérico (sin tenant) puede caer en la PC del OTRO
  // negocio, que tiene otro secreto y lo rechaza: la sesión muere aunque el
  // refresh token siga siendo válido. Se va al nodo del tenant de la cookie.
  const tenant = req.cookies.get("motoshop_tenant")?.value ?? null;
  const nodoPropio = resolveTenantNodeBase(tenant);
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: refreshToken }),
  };
  try {
    let resp: Response;
    try {
      resp = nodoPropio
        ? await fetchFromBase(nodoPropio, "/api/auth/refresh", init)
        : (await fetchWithFailover("/api/auth/refresh", init)).resp;
    } catch {
      // Si el nodo propio no responde, recién ahí se intenta el cascade.
      resp = (await fetchWithFailover("/api/auth/refresh", init)).resp;
    }

    if (!resp.ok) {
      return NextResponse.json({ detail: "Refresh inválido" }, { status: 401 });
    }

    const data = await resp.json();
    const { access_token, refresh_token: newRefresh } = data;

    const res = NextResponse.json({ message: "Token refrescado" });

    res.cookies.set("motoshop_token", access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60,
    });

    if (newRefresh) {
      res.cookies.set("motoshop_refresh", newRefresh, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });
    }

    return res;
  } catch {
    return NextResponse.json(
      { detail: "No se pudo conectar con el servidor" },
      { status: 502 },
    );
  }
}
