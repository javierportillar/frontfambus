import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { displayContent, getStatusDescription, isAttachmentExpired } from "@/lib/api/chatView";
import { canAccessAssistantDomain, isSafeServerHref } from "@/lib/auth/access";

const { authState } = vi.hoisted(() => ({
  authState: {
    currentTenant: "motoshop",
    user: "admin",
    role: "admin",
    enabledFeatures: ["chat-ia"],
    allowedModules: null,
  },
}));

vi.mock("@/lib/auth/store", () => ({
  useAuthStore: Object.assign((selector: (state: typeof authState) => unknown) => selector(authState), { getState: () => authState }),
}));

vi.mock("@/lib/api/chat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/chat")>("@/lib/api/chat");
  return {
    ...actual,
    listConversations: vi.fn().mockResolvedValue([{
      id: "conv-1",
      tenant_id: "motoshop",
      user_id: "admin",
      title: "Ventas de septiembre",
      status: "active",
      created_at: "2026-09-15T10:00:00Z",
      updated_at: "2026-09-15T10:00:00Z",
      last_message_at: "2026-09-15T10:00:00Z",
      message_count: 2,
    }]),
    listMessages: vi.fn().mockResolvedValue([]),
    createConversation: vi.fn(),
    sendChatMessage: vi.fn(),
    archiveConversation: vi.fn(),
  };
});

import { ChatDrawer } from "./ChatDrawer";

beforeEach(() => {
  window.localStorage.removeItem("chat-desktop-conversations-open");
});

describe("chat drawer contract states", () => {
  it.each([["complete", "Respuesta disponible"], ["partial", "Respuesta parcial"], ["empty", "Sin resultados"], ["needs_clarification", "Necesita aclaración"], ["unavailable", "No disponible"]] as const)("labels %s distinctly", (status, label) => { expect(getStatusDescription(status).label).toBe(label); });
  it("expires reports and removes raw URL fallbacks", () => { expect(isAttachmentExpired("2026-01-01T00:00:00Z", Date.parse("2026-01-02T00:00:00Z"))).toBe(true); expect(isAttachmentExpired("2026-01-03T00:00:00Z", Date.parse("2026-01-02T00:00:00Z"))).toBe(false); expect(displayContent("Ver [reporte](https://example.test/report) y https://example.test/raw")).toBe("Ver reporte y"); });
  it("accepts only authorized server-relative links", () => { expect(isSafeServerHref("/inventario/productos/SKU-1")).toBe(true); expect(isSafeServerHref("https://evil.test/tenant-b")).toBe(false); expect(isSafeServerHref("javascript:alert(1)")).toBe(false); expect(canAccessAssistantDomain("sales", { role: "gerente", enabledFeatures: ["ventas-summary"], allowedModules: null })).toBe(true); expect(canAccessAssistantDomain("sales", { role: "gerente", enabledFeatures: ["ventas-summary"], allowedModules: ["inventario"] })).toBe(false); });

  it("lets the desktop conversation sidebar collapse and expand without losing its controls", async () => {
    const user = userEvent.setup();
    render(<ChatDrawer open onClose={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Minimizar conversaciones" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva conversación" })).toHaveTextContent("Nueva conversación");

    await user.click(screen.getByRole("button", { name: "Minimizar conversaciones" }));
    expect(screen.getByRole("button", { name: "Mostrar conversaciones" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva conversación" })).toHaveTextContent("+");

    await user.click(screen.getByRole("button", { name: "Mostrar conversaciones" }));
    expect(screen.getByRole("button", { name: "Minimizar conversaciones" })).toBeInTheDocument();
    expect(screen.getByText("Ventas de septiembre")).toBeInTheDocument();
  });
});
