import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchWithFailover,
  PRIMARY_API_BASE,
  MOTOSHOP_LOCAL_BASE,
  MASVITAL_LOCAL_BASE,
  resolveFallbackUrls,
} from "./backendFailover";

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
    expect(result.resp.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]?.[0]).toBe(`${MASVITAL_LOCAL_BASE}/api/health`);
  });
});
