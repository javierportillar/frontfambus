import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchWithFailover, PRIMARY_API_BASE, FALLBACK_API_BASE } from "./backendFailover";

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

  it("fails over to fallback when primary responds with 503 (Render suspended)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("Service Suspended", { status: 503 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok", from: "local" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    global.fetch = mockFetch;

    const result = await fetchWithFailover("/api/health", { method: "GET" });

    expect(result.isFallback).toBe(true);
    expect(result.resp.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[0]?.[0]).toBe(`${PRIMARY_API_BASE}/api/health`);
    expect(mockFetch.mock.calls[1]?.[0]).toBe(`${FALLBACK_API_BASE}/api/health`);
  });

  it("fails over to fallback when primary throws a network error", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection refused"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok", from: "local" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    global.fetch = mockFetch;

    const result = await fetchWithFailover("/api/health", { method: "GET" });

    expect(result.isFallback).toBe(true);
    expect(result.resp.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
