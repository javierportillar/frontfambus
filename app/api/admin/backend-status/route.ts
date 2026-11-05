import { NextRequest, NextResponse } from "next/server";
import { checkClusterStatus } from "@/lib/api/backendFailover";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token =
    req.cookies.get("motoshop_token")?.value ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return NextResponse.json({ detail: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tenant =
    searchParams.get("tenant") ??
    req.headers.get("x-tenant") ??
    req.cookies.get("motoshop_tenant")?.value ??
    null;

  // `?skipCache=1` (botón "Actualizar") fuerza un sondeo real, sin la cache
  // corta en memoria de la función.
  const skipCache = ["1", "true", "yes"].includes(
    (searchParams.get("skipCache") ?? searchParams.get("refresh") ?? "").toLowerCase(),
  );
  const status = await checkClusterStatus(tenant, 3000, skipCache);

  return NextResponse.json(status, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
