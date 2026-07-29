import { NextRequest, NextResponse } from "next/server";
import { canTenantAccessPath } from "./lib/tenant/access";

const PUBLIC_PATHS = [
  "/login",
  "/select-tenant",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/logout",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const token = req.cookies.get("motoshop_token")?.value;
  const tenant = req.cookies.get("motoshop_tenant")?.value;

  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Multi-tenant (M2): autenticado pero sin tenant seleccionado → picker
  if (token && !tenant) {
    const selectUrl = new URL("/select-tenant", req.url);
    return NextResponse.redirect(selectUrl);
  }

  // Fast tenant-routing guard. Protected pages must still validate the
  // authenticated identity server-side before returning sensitive data.
  if (!canTenantAccessPath(pathname, tenant ?? null)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-|icons/).*)"],
};
