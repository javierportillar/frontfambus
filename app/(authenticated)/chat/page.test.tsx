import { describe, expect, it } from "vitest";
import { createUserMessage, formatMessageTime, shouldAcceptChatResult } from "@/lib/api/chatView";

describe("full-page chat tenant isolation", () => {
  it("rejects a response for another tenant", () => { expect(shouldAcceptChatResult({ tenant_id: "motoshop" }, "masvital")).toBe(false); expect(shouldAcceptChatResult({ tenant_id: "motoshop" }, "motoshop")).toBe(true); });
  it("creates stable user message identity", () => { const message = createUserMessage("ventas", "r1", "motoshop"); expect(message).toMatchObject({ role: "user", content: "ventas", tenant_id: "motoshop", id: "r1" }); expect(message.created_at).toMatch(/T/); });
  it("formats valid message timestamps and handles malformed dates", () => { expect(formatMessageTime("2026-09-15T14:49:00-05:00", "en-US")).toMatch(/2:49/); expect(formatMessageTime("not-a-date")).toBe("—"); });
});
