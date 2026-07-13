import { afterEach, describe, expect, it, vi } from "vitest";

const idb = vi.hoisted(() => {
  const entries = new Map<string, unknown>();

  return {
    entries,
    get: vi.fn(async (key: string) => entries.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      entries.set(key, value);
    }),
    del: vi.fn(async (key: string) => {
      entries.delete(key);
    }),
    clear: vi.fn(async () => {
      entries.clear();
    }),
  };
});

vi.mock("idb-keyval", () => idb);

import { getCached, setCache } from "./cache";

describe("offline cache", () => {
  afterEach(() => {
    idb.entries.clear();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("keeps entries from MotoShop and MasVital isolated even when the URL is identical", async () => {
    const url = "/api/products?q=aceite&limit=20&offset=0";

    await setCache("motoshop", url, { items: ["moto"] });
    await setCache("masvital", url, { items: ["vital"] });

    await expect(getCached("motoshop", url)).resolves.toEqual({ items: ["moto"] });
    await expect(getCached("masvital", url)).resolves.toEqual({ items: ["vital"] });
  });

  it("expires an entry using its configured TTL without affecting another tenant", async () => {
    vi.useFakeTimers();
    const url = "/api/products/ABC/stock";

    await setCache("motoshop", url, { total: 4 }, 100);
    await setCache("masvital", url, { total: 9 }, 1_000);
    await vi.advanceTimersByTimeAsync(101);

    await expect(getCached("motoshop", url)).resolves.toBeNull();
    await expect(getCached("masvital", url)).resolves.toEqual({ total: 9 });
    expect(idb.del).toHaveBeenCalledWith("motoshop:motoshop:/api/products/ABC/stock");
  });
});
