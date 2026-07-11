import { describe, expect, it, vi } from "vitest";
import { IdempotentMutation } from "./idempotentMutation";

describe("IdempotentMutation request orchestration", () => {
  it("sends the identical key when a failed POST is retried unchanged", async () => {
    const mutation = new IdempotentMutation(vi.fn().mockReturnValueOnce("key-1").mockReturnValue("key-2"));
    const sentKeys: string[] = [];
    const failedPost = vi.fn(async (key: string) => {
      sentKeys.push(key);
      throw new Error("response lost");
    });

    await expect(mutation.submit({ fingerprint: "receipt:unchanged", post: failedPost })).rejects.toThrow("response lost");
    await mutation.submit({
      fingerprint: "receipt:unchanged",
      post: async (key) => { sentKeys.push(key); return { ok: true }; },
    });

    expect(sentKeys).toEqual(["key-1", "key-1"]);
  });

  it("rotates after a confirmed POST even when the subsequent SWR refresh fails", async () => {
    const makeKey = vi.fn().mockReturnValueOnce("key-1").mockReturnValueOnce("key-2");
    const mutation = new IdempotentMutation(makeKey);
    const sentKeys: string[] = [];

    await expect(mutation.submit({
      fingerprint: "receipt:payload",
      post: async (key) => { sentKeys.push(key); return { ok: true }; },
      refresh: async () => { throw new Error("SWR unavailable"); },
    })).resolves.toEqual({ ok: true });

    // Same payload is a new user submission because the first POST succeeded.
    await mutation.submit({
      fingerprint: "receipt:payload",
      post: async (key) => { sentKeys.push(key); return { ok: true }; },
    });

    expect(sentKeys).toEqual(["key-1", "key-2"]);
    expect(makeKey).toHaveBeenCalledTimes(2);
  });
});
