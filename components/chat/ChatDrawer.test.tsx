import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { displayContent, getStatusDescription, isAttachmentExpired } from "@/lib/api/chatView";
import { listConversations, listMessages, type ChatMessage, type Conversation } from "@/lib/api/chat";
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
  it("accepts only authorized server-relative links", () => { expect(isSafeServerHref("/dashboards/productos/SKU-1")).toBe(true); expect(isSafeServerHref("https://evil.test/tenant-b")).toBe(false); expect(isSafeServerHref("javascript:alert(1)")).toBe(false); expect(canAccessAssistantDomain("sales", { role: "gerente", enabledFeatures: ["ventas-summary"], allowedModules: null })).toBe(true); expect(canAccessAssistantDomain("sales", { role: "gerente", enabledFeatures: ["ventas-summary"], allowedModules: ["inventario"] })).toBe(false); });

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

  it("keeps the latest conversation refresh when an older request fails afterward", async () => {
    // The callback parameter is used by the Promise rejecter's type signature.
    // eslint-disable-next-line no-unused-vars
    let rejectFirstRefresh!: (error: Error) => void;
    const firstRefresh = new Promise<Conversation[]>((_resolve, reject) => {
      rejectFirstRefresh = reject;
    });
    const latestConversation: Conversation = {
      id: "latest-conversation",
      tenant_id: "motoshop",
      user_id: "admin",
      title: "Latest conversation",
      status: "active",
      created_at: "2026-09-15T10:00:00Z",
      updated_at: "2026-09-15T10:00:00Z",
      last_message_at: "2026-09-15T10:00:00Z",
      message_count: 2,
    };
    vi.mocked(listConversations)
      .mockImplementationOnce(() => firstRefresh)
      .mockResolvedValueOnce([latestConversation]);

    const view = render(<ChatDrawer open onClose={vi.fn()} />);
    view.rerender(<ChatDrawer open={false} onClose={vi.fn()} />);
    view.rerender(<ChatDrawer open onClose={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Latest conversation" })).toBeInTheDocument();

    rejectFirstRefresh(new Error("stale request failed"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Latest conversation" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("reloads conversations when the user changes within the same tenant", async () => {
    const conversationFor = (id: string, userId: string, title: string): Conversation => ({
      id,
      tenant_id: "motoshop",
      user_id: userId,
      title,
      status: "active",
      created_at: "2026-09-15T10:00:00Z",
      updated_at: "2026-09-15T10:00:00Z",
      last_message_at: "2026-09-15T10:00:00Z",
      message_count: 1,
    });
    vi.mocked(listConversations)
      .mockResolvedValueOnce([conversationFor("admin-conversation", "admin", "Admin history")])
      .mockResolvedValueOnce([conversationFor("buyer-conversation", "buyer", "Buyer history")]);
    const view = render(<ChatDrawer open onClose={vi.fn()} />);
    await screen.findByRole("button", { name: "Admin history" });

    authState.user = "buyer";
    view.rerender(<ChatDrawer open onClose={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Buyer history" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Admin history" })).not.toBeInTheDocument();
    authState.user = "admin";
  });

  it("keeps mobile history error accessible when there are no conversations", async () => {
    const user = userEvent.setup();
    vi.mocked(listConversations).mockRejectedValueOnce(new Error("network unavailable"));
    render(<ChatDrawer open onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Historial de conversaciones" }));
    const errorMessages = await screen.findAllByText("No pudimos cargar tus conversaciones.");
    expect(errorMessages.length).toBeGreaterThan(0);
  });

  it("ignores a late history response after another conversation is selected", async () => {
    const user = userEvent.setup();
    const conversations = ["conv-1", "conv-2"].map((id, index): Conversation => ({
      id,
      tenant_id: "motoshop",
      user_id: "admin",
      title: `Conversation ${index + 1}`,
      status: "active",
      created_at: "2026-09-15T10:00:00Z",
      updated_at: "2026-09-15T10:00:00Z",
      last_message_at: "2026-09-15T10:00:00Z",
      message_count: 1,
    }));
    vi.mocked(listConversations).mockResolvedValue(conversations);

    // The callback parameter is used by the Promise resolver's type signature.
    // eslint-disable-next-line no-unused-vars
    let resolveFirstHistory!: (messages: ChatMessage[]) => void;
    const firstHistory = new Promise<ChatMessage[]>((resolve) => {
      resolveFirstHistory = resolve;
    });
    const message = (id: string, conversationId: string, content: string): ChatMessage => ({
      id,
      conversation_id: conversationId,
      role: "user",
      content,
      created_at: "2026-09-15T10:00:00Z",
      tenant_id: "motoshop",
      status: "complete",
      tools_used: [],
      sources: [],
      freshness: [],
      entity_refs: [],
      attachments: [],
    });
    vi.mocked(listMessages).mockImplementation((id) => (
      id === "conv-1"
        ? firstHistory
        : Promise.resolve([message("latest-2", "conv-2", "Latest message in second thread")])
    ));

    render(<ChatDrawer open onClose={vi.fn()} />);
    await user.click(await screen.findByRole("button", { name: "Conversation 1" }));
    await user.click(screen.getByRole("button", { name: "Conversation 2" }));
    expect(await screen.findByText("Latest message in second thread")).toBeInTheDocument();

    resolveFirstHistory([message("late-1", "conv-1", "Late message from first thread")]);
    await waitFor(() => {
      expect(screen.getByText("Latest message in second thread")).toBeInTheDocument();
      expect(screen.queryByText("Late message from first thread")).not.toBeInTheDocument();
    });
  });
});
