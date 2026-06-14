import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/select-tenant", "/api/auth/login", "/api/auth/refresh", "/api/auth/logout"];

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

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-|icons/).*)"],
};
