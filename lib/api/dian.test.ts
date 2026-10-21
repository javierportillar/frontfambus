import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchDianQueueStatus,
  fetchDianDocument,
  retryDianTransmission,
  type DianDoc,
  type DianQueueResponse,
} from "./dian";
import * as failover from "./backendFailover";
import { useAuthStore } from "@/lib/auth/store";

vi.mock("./backendFailover", () => ({
  fetchWithFailover: vi.fn(),
}));

describe("DIAN API Client (lib/api/dian.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ currentTenant: "motoshop", role: "admin" });
  });

  describe("fetchDianQueueStatus", () => {
    it("calls /api/erp/dian/status with X-Tenant header and returns queue response", async () => {
      const mockResponse: DianQueueResponse = {
        total: 2,
        accepted: 1,
        pending: 1,
        failed: 0,
        rejected: 0,
        documents: [
          {
            sale_id: "sale-1",
            doc_number: "POS-001",
            cufe: "abc123cufe",
            qr_url: "https://dian.gov.co/qr",
            status: "ACCEPTED",
            sent_at: "2026-10-21T09:00:00Z",
            accepted_at: "2026-10-21T09:00:01Z",
            error_message: null,
            retry_count: 0,
            track_id: "track-1",
            estfele: 1,
          },
        ],
      };

      vi.mocked(failover.fetchWithFailover).mockResolvedValueOnce({
        resp: new Response(JSON.stringify(mockResponse), { status: 200 }),
        isFallback: false,
        activeNode: { id: "render", name: "Render", url: "https://api.test", isPrimary: true },
      });

      const result = await fetchDianQueueStatus(undefined, "motoshop");

      expect(failover.fetchWithFailover).toHaveBeenCalledWith(
        "/api/erp/dian/status",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "X-Tenant": "motoshop",
          }),
        }),
      );
      expect(result.total).toBe(2);
      expect(result.documents[0]?.status).toBe("ACCEPTED");
    });

    it("appends status filter query parameter when provided", async () => {
      vi.mocked(failover.fetchWithFailover).mockResolvedValueOnce({
        resp: new Response(
          JSON.stringify({ total: 1, accepted: 0, pending: 0, failed: 1, rejected: 0, documents: [] }),
          { status: 200 },
        ),
        isFallback: false,
        activeNode: { id: "render", name: "Render", url: "https://api.test", isPrimary: true },
      });

      await fetchDianQueueStatus("FAILED", "masvital");

      expect(failover.fetchWithFailover).toHaveBeenCalledWith(
        "/api/erp/dian/status?status=FAILED",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Tenant": "masvital",
          }),
        }),
      );
    });

    it("throws detailed error when backend responds with error", async () => {
      vi.mocked(failover.fetchWithFailover).mockResolvedValueOnce({
        resp: new Response(JSON.stringify({ detail: "Gateway timeout en DIAN" }), {
          status: 504,
        }),
        isFallback: false,
        activeNode: { id: "render", name: "Render", url: "https://api.test", isPrimary: true },
      });

      await expect(fetchDianQueueStatus()).rejects.toThrow("Gateway timeout en DIAN");
    });
  });

  describe("fetchDianDocument", () => {
    it("returns null on 404 Not Found", async () => {
      vi.mocked(failover.fetchWithFailover).mockResolvedValueOnce({
        resp: new Response("Not found", { status: 404 }),
        isFallback: false,
        activeNode: { id: "render", name: "Render", url: "https://api.test", isPrimary: true },
      });

      const doc = await fetchDianDocument("non-existent-sale");
      expect(doc).toBeNull();
    });

    it("returns document when found", async () => {
      const mockDoc: DianDoc = {
        sale_id: "sale-100",
        doc_number: "POS-100",
        cufe: "cufe-100",
        qr_url: "https://dian.gov.co/qr/100",
        status: "ACCEPTED",
        sent_at: "2026-10-21T09:00:00Z",
        accepted_at: "2026-10-21T09:00:02Z",
        error_message: null,
        retry_count: 0,
        track_id: "track-100",
        estfele: 1,
      };

      vi.mocked(failover.fetchWithFailover).mockResolvedValueOnce({
        resp: new Response(JSON.stringify(mockDoc), { status: 200 }),
        isFallback: false,
        activeNode: { id: "render", name: "Render", url: "https://api.test", isPrimary: true },
      });

      const doc = await fetchDianDocument("sale-100", "motoshop");
      expect(doc).not.toBeNull();
      expect(doc?.doc_number).toBe("POS-100");
      expect(doc?.cufe).toBe("cufe-100");
    });
  });

  describe("retryDianTransmission", () => {
    it("posts retry payload and returns updated doc", async () => {
      const updatedDoc: DianDoc = {
        sale_id: "sale-error-1",
        doc_number: "POS-050",
        cufe: "new-cufe",
        qr_url: "https://dian.gov.co/qr/new",
        status: "ACCEPTED",
        sent_at: "2026-10-21T09:10:00Z",
        accepted_at: "2026-10-21T09:10:01Z",
        error_message: null,
        retry_count: 1,
        track_id: "track-retried",
        estfele: 1,
      };

      vi.mocked(failover.fetchWithFailover).mockResolvedValueOnce({
        resp: new Response(JSON.stringify(updatedDoc), { status: 200 }),
        isFallback: false,
        activeNode: { id: "render", name: "Render", url: "https://api.test", isPrimary: true },
      });

      const result = await retryDianTransmission("sale-error-1", true, "motoshop");

      expect(failover.fetchWithFailover).toHaveBeenCalledWith(
        "/api/erp/dian/retry/sale-error-1",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ sale_id: "sale-error-1", force: true }),
          headers: expect.objectContaining({
            "X-Tenant": "motoshop",
          }),
        }),
      );
      expect(result.status).toBe("ACCEPTED");
      expect(result.retry_count).toBe(1);
    });

    it("throws permission error when 403 Forbidden is returned", async () => {
      vi.mocked(failover.fetchWithFailover).mockResolvedValueOnce({
        resp: new Response("Forbidden", { status: 403 }),
        isFallback: false,
        activeNode: { id: "render", name: "Render", url: "https://api.test", isPrimary: true },
      });

      await expect(retryDianTransmission("sale-x")).rejects.toThrow(
        "No tiene permisos de Administrador o Gerente para reintentar transmisiones DIAN.",
      );
    });
  });
});
