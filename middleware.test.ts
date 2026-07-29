import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function request(pathname: string, cookie: string): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: { cookie },
  });
}

describe("catalog middleware", () => {
  it("redirects an active MotoShop session away from the catalog", () => {
    const response = middleware(
      request(
        "/catalogo",
        "motoshop_token=valid-token; motoshop_tenant=motoshop",
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  it("only treats a MasVital cookie as a preliminary check", () => {
    const response = middleware(
      request(
        "/catalogo",
        "motoshop_token=motoshop-only-token; motoshop_tenant=masvital",
      ),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
