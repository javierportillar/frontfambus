// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import * as failover from "@/lib/api/backendFailover";

describe("GET /api/admin/backend-status", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when request is not authenticated", async () => {
    const req = new NextRequest("http://localhost/api/admin/backend-status");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.detail).toBe("No autenticado");
  });

  it("extracts tenant from x-tenant header and returns cluster status with no-store cache header when authenticated", async () => {
    const mockStatus: failover.ClusterStatus = {
      activeNode: {
        id: "render",
        name: "Render (Nube)",
        url: failover.PRIMARY_API_BASE,
        isPrimary: true,
      },
      currentTenant: "motoshop",
      nodes: [
        {
          id: "render",
          name: "Render (Nube)",
          url: failover.PRIMARY_API_BASE,
          isPrimary: true,
          status: "online",
          statusCode: 200,
          latencyMs: 42,
          isActive: true,
        },
      ],
      checkedAt: new Date().toISOString(),
    };

    const spy = vi.spyOn(failover, "checkClusterStatus").mockResolvedValueOnce(mockStatus);

    const req = new NextRequest("http://localhost/api/admin/backend-status", {
      headers: {
        cookie: "motoshop_token=test-token",
        "x-tenant": "motoshop",
      },
    });

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(spy).toHaveBeenCalledWith("motoshop");
    const json = await res.json();
    expect(json.activeNode.id).toBe("render");
  });

  it("extracts tenant from query string param when authenticated via Authorization header", async () => {
    const mockStatus: failover.ClusterStatus = {
      activeNode: null,
      currentTenant: "masvital",
      nodes: [],
      checkedAt: new Date().toISOString(),
    };

    const spy = vi.spyOn(failover, "checkClusterStatus").mockResolvedValueOnce(mockStatus);

    const req = new NextRequest("http://localhost/api/admin/backend-status?tenant=masvital", {
      headers: {
        authorization: "Bearer test-jwt-token",
      },
    });

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith("masvital");
  });
});
