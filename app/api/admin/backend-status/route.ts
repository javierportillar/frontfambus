import { NextRequest, NextResponse } from "next/server";
import { checkClusterStatus } from "@/lib/api/backendFailover";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const tenant =
    searchParams.get("tenant") ??
    req.headers.get("x-tenant") ??
    req.cookies.get("motoshop_tenant")?.value ??
    null;

  const status = await checkClusterStatus(tenant);

  return NextResponse.json(status, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
