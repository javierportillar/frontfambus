import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "https://api.fragloesja.uk";

const request = (headers?: HeadersInit) => new NextRequest("http://localhost/api/auth/me", {
  headers,
});

describe("GET /api/auth/me", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns 401 without a session and does not contact the backend", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(request());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ detail: "No autenticado" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the session and tenant without caching the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ username: "admin" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(request({
      cookie: "motoshop_token=valid-token; motoshop_tenant=masvital",
      "x-tenant": "motoshop",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ username: "admin" });
    expect(fetchMock).toHaveBeenCalledWith(
      `${apiBase}/api/auth/me`,
      expect.objectContaining({
        cache: "no-store",
        headers: expect.any(Headers),
      }),
    );

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect((init?.headers as Headers).get("Authorization")).toBe("Bearer valid-token");
    expect((init?.headers as Headers).get("X-Tenant")).toBe("motoshop");
  });

  it("uses the tenant cookie when the request does not provide X-Tenant", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await GET(request({ cookie: "motoshop_token=valid-token; motoshop_tenant=masvital" }));

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect((init?.headers as Headers).get("X-Tenant")).toBe("masvital");
  });

  it("preserves an upstream authentication failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Token expirado" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const response = await GET(request({ cookie: "motoshop_token=expired-token" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ detail: "Token expirado" });
  });

  it("returns 502 when the backend is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    const response = await GET(request({ cookie: "motoshop_token=valid-token" }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ detail: "No se pudo conectar con el servidor" });
  });
});
