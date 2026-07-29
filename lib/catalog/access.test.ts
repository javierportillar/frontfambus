import { describe, expect, it, vi } from "vitest";
import { authorizeMasVitalCatalog } from "./access";

describe("MasVital catalog server authorization", () => {
  it("rejects a forged MasVital tenant cookie when the authenticated backend denies it", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 403 }));

    const result = await authorizeMasVitalCatalog({
      accessToken: "motoshop-only-token",
      requestedTenant: "masvital",
      fetcher,
    });

    expect(result).toEqual({ allowed: false, status: 403 });
    const [, init] = fetcher.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get("Authorization")).toBe("Bearer motoshop-only-token");
    expect(headers.get("X-Tenant")).toBe("masvital");
  });

  it("rejects a MotoShop-only identity even if an upstream response is malformed", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          role: "admin",
          tenants_allowed: ["motoshop"],
          current_tenant: "masvital",
        }),
      ),
    );

    await expect(
      authorizeMasVitalCatalog({
        accessToken: "valid-token",
        requestedTenant: "masvital",
        fetcher,
      }),
    ).resolves.toEqual({ allowed: false, status: 403 });
  });

  it("allows an admin whose authenticated current tenant is MasVital", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          role: "admin",
          tenants_allowed: ["motoshop", "masvital"],
          current_tenant: "masvital",
        }),
      ),
    );

    await expect(
      authorizeMasVitalCatalog({
        accessToken: "valid-token",
        requestedTenant: "masvital",
        fetcher,
      }),
    ).resolves.toEqual({ allowed: true, status: 200 });
  });

  it("rejects an admin whose active tenant is MotoShop without contacting the backend", async () => {
    const fetcher = vi.fn();

    await expect(
      authorizeMasVitalCatalog({
        accessToken: "valid-token",
        requestedTenant: "motoshop",
        fetcher,
      }),
    ).resolves.toEqual({ allowed: false, status: 403 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
