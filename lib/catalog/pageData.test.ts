import { describe, expect, it, vi } from "vitest";
import { loadMasVitalCatalogPageData } from "./pageData";

describe("MasVital catalog page data", () => {
  it("does not serialize catalog data for a forged MasVital cookie", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 403 }));

    const data = await loadMasVitalCatalogPageData(
      {
        accessToken: "motoshop-only-token",
        requestedTenant: "masvital",
      },
      { fetcher },
    );

    expect(data).toBeNull();
  });

  it("does not serialize catalog data while MotoShop is the active tenant", async () => {
    const fetcher = vi.fn();

    const data = await loadMasVitalCatalogPageData(
      {
        accessToken: "valid-token",
        requestedTenant: "motoshop",
      },
      { fetcher },
    );

    expect(data).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns catalog data for an authenticated MasVital admin", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          role: "admin",
          tenants_allowed: ["motoshop", "masvital"],
          current_tenant: "masvital",
        }),
      ),
    );

    const data = await loadMasVitalCatalogPageData(
      {
        accessToken: "valid-token",
        requestedTenant: "masvital",
      },
      { fetcher },
    );

    expect(data?.products).toHaveLength(584);
    expect(data?.products.find((product) => product.image)?.image).toMatch(
      /^\/api\/catalogo\/masvital\/images\/.+$/,
    );
    expect(data?.products.find((product) => product.image)?.image).not.toContain(
      "sig=",
    );
  });
});
