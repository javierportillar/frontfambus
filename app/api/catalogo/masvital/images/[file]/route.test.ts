import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { resetCatalogAuthorizationCacheForTests } from "@/lib/catalog/access";
import { GET } from "./route";

const file = "kar0028.jpg";

function request({
  tenant = "masvital",
  accessToken = "access-token",
  requestedFile = file,
}: {
  tenant?: string;
  accessToken?: string;
  requestedFile?: string;
} = {}): NextRequest {
  return new NextRequest(
    `http://localhost/api/catalogo/masvital/images/${encodeURIComponent(requestedFile)}`,
    {
      headers: {
        cookie: `motoshop_token=${accessToken}; motoshop_tenant=${tenant}`,
      },
    },
  );
}

function allowMasVitalAdmin(): ReturnType<typeof vi.fn> {
  const fetcher = vi.fn().mockImplementation(async () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          role: "admin",
          tenants_allowed: ["motoshop", "masvital"],
          current_tenant: "masvital",
        }),
      ),
    ),
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => {
  resetCatalogAuthorizationCacheForTests();
  vi.unstubAllGlobals();
});

describe("GET /api/catalogo/masvital/images/[file]", () => {
  it("rejects arbitrary cookies when the trusted backend rejects the token", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(
      request({ accessToken: "attacker-chosen-value", tenant: "masvital" }),
      { params: { file } },
    );

    expect(response.status).toBe(401);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("rejects a MotoShop-only identity behind a forged MasVital cookie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            role: "admin",
            tenants_allowed: ["motoshop"],
            current_tenant: "masvital",
          }),
        ),
      ),
    );

    const response = await GET(request(), { params: { file } });

    expect(response.status).toBe(403);
  });

  it("rejects an admin while MotoShop is the active tenant", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const response = await GET(request({ tenant: "motoshop" }), {
      params: { file },
    });

    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed when the trusted backend is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const response = await GET(request(), { params: { file } });

    expect(response.status).toBe(502);
  });

  it("rejects path traversal before touching authorization or disk", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const requestedFile = "../kar0028.jpg";

    const response = await GET(request({ requestedFile }), {
      params: { file: requestedFile },
    });

    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("serves a short-lived private image after trusted MasVital authorization", async () => {
    const fetcher = allowMasVitalAdmin();

    const response = await GET(request(), { params: { file } });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=300, must-revalidate",
    );
    expect(response.headers.get("vary")).toBe("Cookie");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    const [, init] = fetcher.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer access-token");
    expect(headers.get("X-Tenant")).toBe("masvital");
  });

  it("coalesces concurrent image authorization for the same session", async () => {
    const fetcher = allowMasVitalAdmin();

    const [jpeg, avif] = await Promise.all([
      GET(request(), { params: { file } }),
      GET(request({ requestedFile: "7503008669079.avif" }), {
        params: { file: "7503008669079.avif" },
      }),
    ]);

    expect(jpeg.status).toBe(200);
    expect(avif.status).toBe(200);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("does not cache denied image authorization", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetcher);

    const first = await GET(request({ accessToken: "denied-token" }), {
      params: { file },
    });
    const second = await GET(request({ accessToken: "denied-token" }), {
      params: { file },
    });

    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("keeps authorization caches isolated by access token", async () => {
    const fetcher = allowMasVitalAdmin();

    const first = await GET(request({ accessToken: "session-a" }), {
      params: { file },
    });
    const second = await GET(request({ accessToken: "session-b" }), {
      params: { file },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("serves the AVIF catalog asset with its real media type", async () => {
    allowMasVitalAdmin();
    const requestedFile = "7503008669079.avif";

    const response = await GET(request({ requestedFile }), {
      params: { file: requestedFile },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/avif");
  });
});
