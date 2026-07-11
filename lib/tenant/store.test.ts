import { afterEach, describe, expect, it, vi } from "vitest";
import { clearTenantCookie, setTenantCookie } from "./store";

function withBrowser(protocol: "http:" | "https:") {
  const document = { cookie: "" };
  vi.stubGlobal("document", document);
  vi.stubGlobal("location", { protocol });
  return document;
}

describe("tenant cookie storage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not set Secure on HTTP so the tenant survives localhost development", () => {
    const document = withBrowser("http:");

    setTenantCookie("mas vital");

    expect(document.cookie).toContain("motoshop_tenant=mas%20vital");
    expect(document.cookie).not.toContain("secure");
  });

  it("sets Secure on HTTPS when creating and clearing the cookie", () => {
    const document = withBrowser("https:");

    setTenantCookie("masvital");
    expect(document.cookie).toContain("; secure");

    clearTenantCookie();
    expect(document.cookie).toContain("max-age=0");
    expect(document.cookie).toContain("; secure");
  });

  it("clears the cookie on HTTP without an invalid Secure attribute", () => {
    const document = withBrowser("http:");

    clearTenantCookie();

    expect(document.cookie).toContain("max-age=0");
    expect(document.cookie).not.toContain("secure");
  });
});
