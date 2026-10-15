// @vitest-environment node

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
import * as failover from "@/lib/api/backendFailover";

describe("GET /api/admin/backend-status", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts tenant from x-tenant header and returns cluster status with no-store cache header", async () => {
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

  it("extracts tenant from query string param", async () => {
    const mockStatus: failover.ClusterStatus = {
      activeNode: null,
      currentTenant: "masvital",
      nodes: [],
      checkedAt: new Date().toISOString(),
    };

    const spy = vi.spyOn(failover, "checkClusterStatus").mockResolvedValueOnce(mockStatus);

    const req = new NextRequest("http://localhost/api/admin/backend-status?tenant=masvital");

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith("masvital");
  });
});
