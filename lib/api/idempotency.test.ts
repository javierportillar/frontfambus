import { describe, expect, it } from "vitest";
import { retainIdempotencyKey } from "./idempotency";

describe("retainIdempotencyKey", () => {
  it("reuses the same key after an ambiguous failure for the same operation", () => {
    const pending = retainIdempotencyKey(null, "receipt:payload-a", () => "key-1");
    const retry = retainIdempotencyKey(pending, "receipt:payload-a", () => "key-2");

    expect(retry).toEqual({ fingerprint: "receipt:payload-a", key: "key-1" });
  });

  it("rotates the key when the user changes the payload", () => {
    const pending = { fingerprint: "adjustment:lot-1:-2:damaged", key: "key-1" };

    expect(retainIdempotencyKey(pending, "adjustment:lot-1:-3:damaged", () => "key-2"))
      .toEqual({ fingerprint: "adjustment:lot-1:-3:damaged", key: "key-2" });
  });

  it("creates a fresh key only after confirmed success clears pending state", () => {
    expect(retainIdempotencyKey(null, "receipt:payload-a", () => "key-2"))
      .toEqual({ fingerprint: "receipt:payload-a", key: "key-2" });
  });
});
