// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MOTOSHOP_LOCAL_BASE,
  PRIMARY_API_BASE,
} from "@/lib/api/backendFailover";
import { GET, POST } from "./route";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? PRIMARY_API_BASE;

describe("Proxy route [...path]", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards conditional request headers (If-None-Match, If-Modified-Since) to backend", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new NextRequest("http://localhost/api/metrics/sales-summary", {
      headers: {
        "if-none-match": '"v123"',
        "if-modified-since": "Wed, 21 Oct 2026 07:28:00 GMT",
        "x-tenant": "motoshop",
      },
    });

    const res = await GET(req, { params: { path: ["metrics", "sales-summary"] } });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, init] = fetchMock.mock.calls[0] ?? [];
    expect(calledUrl).toBe(`${API_BASE}/api/metrics/sales-summary`);
    const headers = init?.headers as Headers;
    expect(headers.get("If-None-Match")).toBe('"v123"');
    expect(headers.get("If-Modified-Since")).toBe("Wed, 21 Oct 2026 07:28:00 GMT");
    expect(headers.get("X-Tenant")).toBe("motoshop");
  });

  it("forwards caching response headers (etag, cache-control, vary) from backend and excludes content-encoding", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ cached: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          etag: 'W/"abc-123"',
          "cache-control": "public, max-age=300",
          "content-encoding": "gzip",
          vary: "Accept-Encoding, X-Tenant",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new NextRequest("http://localhost/api/metrics/inventory", {
      headers: { "x-tenant": "motoshop" },
    });

    const res = await GET(req, { params: { path: ["metrics", "inventory"] } });

    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe('W/"abc-123"');
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(res.headers.get("vary")).toBe("Accept-Encoding, X-Tenant");
    // Ensure content-encoding is NOT forwarded to prevent net::ERR_CONTENT_DECODING_FAILED
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("handles 304 Not Modified from backend with empty body and forwarded headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 304,
        statusText: "Not Modified",
        headers: {
          etag: '"same-hash"',
          "cache-control": "public, max-age=300",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new NextRequest("http://localhost/api/metrics/sales-summary", {
      headers: {
        "if-none-match": '"same-hash"',
        "x-tenant": "masvital",
      },
    });

    const res = await GET(req, { params: { path: ["metrics", "sales-summary"] } });

    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe('"same-hash"');
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");

    // Empty body
    const body = await res.text();
    expect(body).toBe("");
  });

  it("forwards Idempotency-Key on POST requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ created: true }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new NextRequest("http://localhost/api/expiry/receipts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "idem-key-999",
      },
      body: JSON.stringify({ item: "test" }),
    });

    const res = await POST(req, { params: { path: ["expiry", "receipts"] } });

    expect(res.status).toBe(201);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = init?.headers as Headers;
    expect(headers.get("Idempotency-Key")).toBe("idem-key-999");
  });

  it("returns 502 when backend fetch throws an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Connection refused")));

    const req = new NextRequest("http://localhost/api/test");
    const res = await GET(req, { params: { path: ["test"] } });

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toEqual({ detail: "API no disponible" });
  });

  it("adds nodo and X-Bank-Node to the 202 bank verification response", async () => {
    const expiraEn = new Date(Date.now() + 300_000).toISOString();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          job_id: "job-1",
          estado: "en_cola",
          expira_en: expiraEn,
        }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new NextRequest(
      "http://localhost/api/erp/bank/verificaciones",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ valor: "100000.00" }),
      },
    );

    const res = await POST(req, {
      params: { path: ["erp", "bank", "verificaciones"] },
    });

    expect(res.status).toBe(202);
    expect(res.headers.get("x-bank-node")).toBe("primary");
    await expect(res.json()).resolves.toEqual({
      job_id: "job-1",
      estado: "en_cola",
      expira_en: expiraEn,
      nodo: "primary",
    });
  });

  it("pins a GET with X-Bank-Node to that base and never uses failover", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          job_id: "job-1",
          estado: "ejecutando",
          expira_en: new Date(Date.now() + 300_000).toISOString(),
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new NextRequest(
      "http://localhost/api/erp/bank/verificaciones/job-1",
      { headers: { "x-bank-node": "motoshop-local", "x-tenant": "motoshop" } },
    );

    const res = await GET(req, {
      params: { path: ["erp", "bank", "verificaciones", "job-1"] },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("x-bank-node")).toBe("motoshop-local");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${MOTOSHOP_LOCAL_BASE}/api/erp/bank/verificaciones/job-1`,
    );
    expect(fetchMock.mock.calls[0]?.[0]).not.toBe(
      `${PRIMARY_API_BASE}/api/erp/bank/verificaciones/job-1`,
    );
  });

  it("keeps normal failover when X-Bank-Node is unknown", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ job_id: "job-1", estado: "ejecutando" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = new NextRequest(
      "http://localhost/api/erp/bank/verificaciones/job-1",
      { headers: { "x-bank-node": "nodo-desconocido" } },
    );

    await GET(req, {
      params: { path: ["erp", "bank", "verificaciones", "job-1"] },
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${PRIMARY_API_BASE}/api/erp/bank/verificaciones/job-1`,
    );
  });
});
