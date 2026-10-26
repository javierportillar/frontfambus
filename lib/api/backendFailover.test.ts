import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWithFailover,
  fetchWithFailoverDetailed,
  bankNodeBaseForLabel,
  bankNodeLabelForBase,
  fetchFromBase,
  identifyNode,
  checkClusterStatus,
  clearClusterStatusCache,
  PRIMARY_API_BASE,
  MOTOSHOP_LOCAL_BASE,
  MASVITAL_LOCAL_BASE,
  FALLBACK_API_BASE,
  resolveFallbackUrls,
  resolveDistinctFailoverBase,
} from "./backendFailover";

describe("identifyNode", () => {
  it("identifies Render primary node", () => {
    const node = identifyNode(PRIMARY_API_BASE);
    expect(node.id).toBe("render");
    expect(node.name).toBe("Render (Nube)");
    expect(node.isPrimary).toBe(true);
  });

  it("identifies MotoShop local node", () => {
    const node = identifyNode(MOTOSHOP_LOCAL_BASE);
    expect(node.id).toBe("motoshop");
    expect(node.name).toBe("PC MotoShop (Local)");
    expect(node.isPrimary).toBe(false);
  });

  it("identifies MasVital local node", () => {
    const node = identifyNode(MASVITAL_LOCAL_BASE);
    expect(node.id).toBe("masvital");
    expect(node.name).toBe("PC MasVital (Local)");
    expect(node.isPrimary).toBe(false);
  });

  it("identifies arbitrary URLs containing host keywords", () => {
    expect(identifyNode("https://motoshop-local.fragloesja.uk/health").id).toBe("motoshop");
    expect(identifyNode("https://masvital-local.fragloesja.uk/health").id).toBe("masvital");
    expect(identifyNode("https://api.fragloesja.uk/health").id).toBe("render");
  });

  it("identifies unknown URLs as custom", () => {
    const node = identifyNode("https://custom-backend.internal:8000");
    expect(node.id).toBe("custom");
    expect(node.name).toBe("Servidor Personalizado");
    expect(node.isPrimary).toBe(false);
  });
});

describe("resolveFallbackUrls", () => {
  it("prioritizes motoshop node when tenant is motoshop or unspecified", () => {
    const urls = resolveFallbackUrls("motoshop");
    expect(urls[0]).toBe(MOTOSHOP_LOCAL_BASE);
    expect(urls).toContain(MASVITAL_LOCAL_BASE);
  });

  it("prioritizes masvital node when tenant is masvital", () => {
    const urls = resolveFallbackUrls("masvital");
    expect(urls[0]).toBe(MASVITAL_LOCAL_BASE);
    expect(urls).toContain(MOTOSHOP_LOCAL_BASE);
  });
});

describe("fetchWithFailover", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearClusterStatusCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns primary response when primary succeeds with 200", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    global.fetch = mockFetch;

    const result = await fetchWithFailover("/api/health", { method: "GET" });

    expect(result.isFallback).toBe(false);
    expect(result.activeNode.id).toBe("render");
    expect(result.resp.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(`${PRIMARY_API_BASE}/api/health`);
  });

  it("fails over to MotoShop node when primary responds with 503", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Service Suspended", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok", from: "motoshop" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    global.fetch = mockFetch;

    const result = await fetchWithFailover("/api/health", {
      method: "GET",
      headers: { "X-Tenant": "motoshop" },
    });

    expect(result.isFallback).toBe(true);
    expect(result.activeNode.id).toBe("motoshop");
    expect(result.resp.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(`${PRIMARY_API_BASE}/api/health`);
    expect(mockFetch.mock.calls[1]?.[0]).toBe(`${MOTOSHOP_LOCAL_BASE}/api/health`);
  });

  it("cascades to MasVital node if MotoShop PC is offline (network error)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Service Suspended", { status: 503 }))
      .mockRejectedValueOnce(new Error("Connection refused (MotoShop PC offline)"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok", from: "masvital" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    global.fetch = mockFetch;

    const result = await fetchWithFailover("/api/health", {
      method: "GET",
      headers: { "X-Tenant": "motoshop" },
    });

    expect(result.isFallback).toBe(true);
    expect(result.activeNode.id).toBe("masvital");
    expect(result.resp.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(`${PRIMARY_API_BASE}/api/health`);
    expect(mockFetch.mock.calls[1]?.[0]).toBe(`${MOTOSHOP_LOCAL_BASE}/api/health`);
    expect(mockFetch.mock.calls[2]?.[0]).toBe(`${MASVITAL_LOCAL_BASE}/api/health`);
  });

  it("prioritizes MasVital node when X-Tenant is masvital", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Service Suspended", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok", from: "masvital" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    global.fetch = mockFetch;

    const result = await fetchWithFailover("/api/health", {
      method: "GET",
      headers: { "X-Tenant": "masvital" },
    });

    expect(result.isFallback).toBe(true);
    expect(result.activeNode.id).toBe("masvital");
    expect(result.resp.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]?.[0]).toBe(`${MASVITAL_LOCAL_BASE}/api/health`);
  });
});

describe("fetchWithFailoverDetailed", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns the base that answered on the primary", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await fetchWithFailoverDetailed("/api/health", {
      method: "GET",
    });

    expect(result.base).toBe(PRIMARY_API_BASE);
    expect(result.isFallback).toBe(false);
    expect(result.response.status).toBe(200);
  });

  it("returns the fallback base that answered", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Service Suspended", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
      );

    const result = await fetchWithFailoverDetailed("/api/health", {
      method: "GET",
      headers: { "X-Tenant": "motoshop" },
    });

    expect(result.base).toBe(MOTOSHOP_LOCAL_BASE);
    expect(result.isFallback).toBe(true);
  });

  it("keeps fetchWithFailover output compatible by delegating", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const result = await fetchWithFailover("/api/health", { method: "GET" });

    expect(result.resp.status).toBe(200);
    expect(result.activeNode.id).toBe("render");
    expect(result.isFallback).toBe(false);
  });
});

describe("bank node labels", () => {
  it("maps known base URLs to stable labels and back", () => {
    expect(bankNodeLabelForBase(PRIMARY_API_BASE)).toBe("primary");
    expect(bankNodeLabelForBase(MOTOSHOP_LOCAL_BASE)).toBe("motoshop-local");
    expect(bankNodeLabelForBase(MASVITAL_LOCAL_BASE)).toBe("masvital-local");
    expect(bankNodeLabelForBase(FALLBACK_API_BASE)).toBe("fallback");
    expect(bankNodeLabelForBase("https://unknown.example")).toBeNull();

    expect(bankNodeBaseForLabel("motoshop-local")).toBe(MOTOSHOP_LOCAL_BASE);
    expect(bankNodeBaseForLabel("PRIMARY")).toBe(PRIMARY_API_BASE);
    expect(bankNodeBaseForLabel("nope")).toBeNull();
    expect(bankNodeBaseForLabel(null)).toBeNull();
  });
});

describe("resolveDistinctFailoverBase", () => {
  it("skips the pinned base and returns the next candidate in tenant order", () => {
    expect(resolveDistinctFailoverBase("motoshop", MOTOSHOP_LOCAL_BASE)).toBe(
      PRIMARY_API_BASE,
    );
    expect(resolveDistinctFailoverBase("masvital", MASVITAL_LOCAL_BASE)).toBe(
      PRIMARY_API_BASE,
    );
    expect(resolveDistinctFailoverBase("motoshop", PRIMARY_API_BASE)).toBe(
      MOTOSHOP_LOCAL_BASE,
    );
    expect(resolveDistinctFailoverBase("masvital", PRIMARY_API_BASE)).toBe(
      MASVITAL_LOCAL_BASE,
    );
  });

  it("returns null when every configured candidate is the skipped base", () => {
    const original = process.env.FALLBACK_API_URLS;
    process.env.FALLBACK_API_URLS = PRIMARY_API_BASE;
    try {
      expect(resolveDistinctFailoverBase("motoshop", PRIMARY_API_BASE)).toBeNull();
    } finally {
      if (original === undefined) {
        delete process.env.FALLBACK_API_URLS;
      } else {
        process.env.FALLBACK_API_URLS = original;
      }
    }
  });
});

describe("fetchFromBase", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("calls only the requested base with the path and query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    global.fetch = fetchMock;

    const resp = await fetchFromBase(MOTOSHOP_LOCAL_BASE, "/api/x?y=1", {
      method: "GET",
    });

    expect(resp.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${MOTOSHOP_LOCAL_BASE}/api/x?y=1`,
    );
  });
});

describe("checkClusterStatus", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearClusterStatusCache();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("detects primary as active when Render is online", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes(PRIMARY_API_BASE)) {
        return Promise.resolve(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    });

    const status = await checkClusterStatus("motoshop");

    expect(status.activeNode?.id).toBe("render");
    expect(status.nodes).toHaveLength(3);
    const renderNode = status.nodes.find((n) => n.id === "render");
    expect(renderNode?.status).toBe("online");
    expect(renderNode?.isActive).toBe(true);
    const motoshopNode = status.nodes.find((n) => n.id === "motoshop");
    expect(motoshopNode?.isActive).toBe(false);
  });

  it("falls back to MotoShop PC when Render is suspended and tenant is motoshop", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("api.fragloesja.uk")) {
        return Promise.resolve(new Response("Suspended", { status: 503 }));
      }
      if (url.includes("motoshop-local")) {
        return Promise.resolve(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
      }
      return Promise.reject(new Error("offline"));
    });

    const status = await checkClusterStatus("motoshop");

    expect(status.activeNode?.id).toBe("motoshop");
    const renderNode = status.nodes.find((n) => n.id === "render");
    expect(renderNode?.status).toBe("suspended");
    expect(renderNode?.isActive).toBe(false);

    const motoshopNode = status.nodes.find((n) => n.id === "motoshop");
    expect(motoshopNode?.status).toBe("online");
    expect(motoshopNode?.isActive).toBe(true);

    const masvitalNode = status.nodes.find((n) => n.id === "masvital");
    expect(masvitalNode?.status).toBe("offline");
    expect(masvitalNode?.isActive).toBe(false);
  });

  it("prioritizes MasVital PC when Render is suspended and tenant is masvital", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("api.fragloesja.uk")) {
        return Promise.resolve(new Response("Suspended", { status: 503 }));
      }
      // Both local PCs are online
      return Promise.resolve(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    });

    const status = await checkClusterStatus("masvital");

    expect(status.activeNode?.id).toBe("masvital");
    const masvitalNode = status.nodes.find((n) => n.id === "masvital");
    expect(masvitalNode?.isActive).toBe(true);
    const motoshopNode = status.nodes.find((n) => n.id === "motoshop");
    expect(motoshopNode?.isActive).toBe(false);
  });

  it("returns null activeNode when all nodes are offline", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network timeout"));

    const status = await checkClusterStatus("motoshop");

    expect(status.activeNode).toBeNull();
    status.nodes.forEach((n) => {
      expect(n.status).toBe("offline");
      expect(n.isActive).toBe(false);
    });
  });

  it("caches cluster status within TTL window to avoid redundant probes", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    );
    global.fetch = mockFetch;

    const first = await checkClusterStatus("motoshop");
    const second = await checkClusterStatus("motoshop");

    expect(first.checkedAt).toBe(second.checkedAt);
    // 3 candidate nodes probed once for health + once for data-freshness
    expect(mockFetch).toHaveBeenCalledTimes(6);
  });

  it("propagates client abort signal to fallback requests", async () => {
    const controller = new AbortController();
    controller.abort();

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Suspended", { status: 503 }))
      .mockImplementationOnce((_url, init: RequestInit) => {
        expect(init.signal?.aborted).toBe(true);
        return Promise.reject(new DOMException("The operation was aborted", "AbortError"));
      });

    global.fetch = mockFetch;

    await expect(
      fetchWithFailover("/api/health", { method: "GET", signal: controller.signal }),
    ).rejects.toThrow();
  });
});

