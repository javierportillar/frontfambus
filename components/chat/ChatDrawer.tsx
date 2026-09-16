"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/auth/store";
import { archiveConversation, createConversation, listConversations, listMessages, normalizeChatMessage, sendChatMessage, type ChatMessage, type Conversation } from "@/lib/api/chat";
import { AssistantMessage } from "./AssistantMessage";
import type { AccessContext } from "@/lib/auth/access";

const MAX_TURNS = 20;

export function ChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const tenant = useAuthStore((state) => state.currentTenant);
  const user = useAuthStore((state) => state.user);
  const role = useAuthStore((state) => state.role);
  const enabledFeatures = useAuthStore((state) => state.enabledFeatures);
  const allowedModules = useAuthStore((state) => state.allowedModules);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [closing, setClosing] = useState(false);
  const [mobileConvos, setMobileConvos] = useState(false);
  const abortRef = useRef<AbortController>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ y: number; time: number } | null>(null);
  const drawerRef = useRef<HTMLElement>(null);

  const refreshConversations = useCallback(async () => {
    const requestedTenant = useAuthStore.getState().currentTenant;
    const requestedUser = useAuthStore.getState().user;
    try {
      const rows = await listConversations();
      if (useAuthStore.getState().currentTenant === requestedTenant && useAuthStore.getState().user === requestedUser) setConversations(rows);
    } catch { setError("No pudimos cargar tus conversaciones."); }
  }, []);

  useEffect(() => { if (open && tenant) void refreshConversations(); }, [open, tenant, refreshConversations]);
  useEffect(() => {
    abortRef.current?.abort();
    setConversations([]);
    setConversationId(undefined);
    setMessages([]);
    setInput("");
    setError(undefined);
    setClosing(false);
    setMobileConvos(false);
  }, [tenant, user]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const handleClose = useCallback(() => {
    setClosing(true);
    setTimeout(() => {
      setClosing(false);
      onClose();
    }, 220);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") handleClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleClose]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) touchStartRef.current = { y: touch.clientY, time: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    if (!touch) { touchStartRef.current = null; return; }
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;
    if (dy > 80 && dt < 400) handleClose();
  }, [handleClose]);

  const selectConversation = async (id: string) => {
    const requestedTenant = tenant;
    const requestedUser = user;
    setConversationId(id); setError(undefined); setMobileConvos(false);
    try {
      const rows = await listMessages(id);
      if (useAuthStore.getState().currentTenant === requestedTenant && useAuthStore.getState().user === requestedUser) setMessages(rows.map((row) => ({ ...row, tenant_id: requestedTenant ?? "" })));
    } catch { setError("No pudimos cargar este historial."); }
  };

  const newConversation = async () => {
    setError(undefined); setMobileConvos(false);
    try { const row = await createConversation(); setConversations((prev) => [row, ...prev]); setConversationId(row.id); setMessages([]); } catch { setError("No pudimos crear la conversación."); }
  };

  const send = async () => {
    const text = input.trim();
    const requestedTenant = tenant;
    const requestedUser = user;
    if (!text || loading || !requestedTenant || !requestedUser) return;
    setInput(""); setError(undefined); setLoading(true);
    const requestId = crypto.randomUUID();
    const optimistic = normalizeChatMessage({ id: requestId, tenant_id: requestedTenant, conversation_id: conversationId ?? "", role: "user", content: text, created_at: new Date().toISOString() });
    setMessages((prev) => [...prev, optimistic]);
    abortRef.current = new AbortController();
    try {
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        const created = await createConversation(abortRef.current.signal);
        activeConversationId = created.id;
        setConversationId(created.id);
        setConversations((prev) => [created, ...prev]);
      }
      if (useAuthStore.getState().currentTenant !== requestedTenant || useAuthStore.getState().user !== requestedUser) return;
      optimistic.conversation_id = activeConversationId;
      const reply = await sendChatMessage(text, activeConversationId, requestId, abortRef.current.signal);
      if (reply.tenant_id !== requestedTenant || useAuthStore.getState().currentTenant !== requestedTenant || useAuthStore.getState().user !== requestedUser) return;
      setConversationId(reply.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: `${requestId}-assistant`,
          conversation_id: reply.conversation_id,
          role: "assistant",
          tenant_id: reply.tenant_id,
          status: reply.status,
          content: reply.text,
          created_at: new Date().toISOString(),
          tools_used: reply.tools_used,
          sources: reply.sources,
          freshness: reply.freshness,
          entity_refs: reply.entity_refs,
          attachments: reply.attachments,
        },
      ]);
      void refreshConversations();
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError("No pudimos procesar tu consulta. Intentá de nuevo.");
    } finally { setLoading(false); abortRef.current = undefined; }
  };

  if (!open && !closing) return null;
  const turnCount = messages.filter((message) => message.role === "user").length;
  const accessContext: AccessContext = { role, enabledFeatures, allowedModules, currentTenant: tenant };
  const animationClass = closing ? "chat-exit" : "chat-enter";

  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Asistente de negocio">
    <button className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${closing ? "opacity-0" : "opacity-100"}`} aria-label="Cerrar asistente" onClick={handleClose} />
    <aside
      ref={drawerRef}
      className={`absolute bottom-0 left-0 right-0 top-auto flex h-[100dvh] max-h-[100dvh] w-full flex-col border-t border-border bg-surface shadow-2xl sm:bottom-auto sm:left-auto sm:right-0 sm:top-0 sm:h-full sm:max-h-full sm:max-w-lg sm:rounded-none sm:rounded-l-2xl sm:border-t-0 sm:border-l ${animationClass}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Swipe hint on mobile */}
      <div className="flex justify-center py-1.5 sm:hidden" aria-hidden="true">
        <div className="h-1 w-10 rounded-full bg-border-strong" />
      </div>

      <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 sm:px-4 sm:py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Asistente {tenant ?? ""}</p>
          <h2 className="truncate text-sm font-bold text-text-primary sm:text-base">Consultá tu operación</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Mobile conversation toggle */}
          {conversations.length > 0 && (
            <button
              onClick={() => setMobileConvos((v) => !v)}
              className="flex h-11 w-11 items-center justify-center rounded-md text-xs font-semibold text-primary sm:hidden"
              aria-label="Historial de conversaciones"
              aria-expanded={mobileConvos}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          )}
          <button onClick={() => void newConversation()} className="flex h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 sm:hidden">+ Nueva</button>
          <button onClick={handleClose} className="flex h-11 w-11 items-center justify-center rounded-md text-lg text-text-muted hover:bg-surface-alt" aria-label="Cerrar">&times;</button>
        </div>
      </header>

      {/* Mobile conversation dropdown */}
      {mobileConvos && (
        <div className="shrink-0 border-b border-border bg-surface-alt p-3 sm:hidden">
          <button onClick={() => void newConversation()} className="mb-3 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-light">+ Nueva conversación</button>
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => void selectConversation(conversation.id)}
                className={`w-full truncate rounded-lg px-4 py-3 text-left text-sm transition-all ${conversation.id === conversationId ? "bg-primary/10 text-primary font-medium" : "text-text-muted hover:bg-surface hover:text-text-secondary"}`}
              >
                {conversation.title}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-48 shrink-0 border-r border-border p-3 sm:block">
          <button onClick={() => void newConversation()} className="mb-3 w-full rounded-lg bg-primary px-3 py-2.5 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-light">+ Nueva conversación</button>
          <div className="space-y-1 overflow-y-auto">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => void selectConversation(conversation.id)}
                className={`w-full truncate rounded-lg px-3 py-2.5 text-left text-xs transition-all ${conversation.id === conversationId ? "bg-primary/10 text-primary font-medium shadow-sm" : "text-text-muted hover:bg-surface-alt hover:text-text-secondary"}`}
              >
                {conversation.title}
              </button>
            ))}
          </div>
        </nav>
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5" aria-live="polite">
            {messages.length === 0 && <p className="py-12 text-center text-sm text-text-muted">Preguntá por ventas, stock, productos dormidos o inventario.</p>}
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" ? <AssistantMessage message={message} context={accessContext} /> : <div className="max-w-[90%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-fg"><p className="whitespace-pre-wrap leading-relaxed">{message.content}</p></div>}
              </div>
            ))}
            {loading && (
              <div role="status" className="flex items-center gap-1.5 px-1 py-2 text-text-muted">
                <span className="chat-dot" /><span className="chat-dot" /><span className="chat-dot" />
                <span className="sr-only">Pensando</span>
              </div>
            )}
            {error && <p role="alert" className="rounded-md bg-warning/10 p-2 text-xs text-warning">{error}</p>}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={(event) => { event.preventDefault(); void send(); }}
            className="shrink-0 border-t border-border px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 sm:px-5 sm:pb-4"
          >
            <div className="flex gap-2">
              <label htmlFor="drawer-chat-input" className="sr-only">Pregunta al asistente</label>
              <input
                id="drawer-chat-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                maxLength={500}
                disabled={loading || turnCount >= MAX_TURNS}
                placeholder={turnCount >= MAX_TURNS ? "Límite alcanzado" : "Escribí tu pregunta…"}
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 sm:py-2.5"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading || turnCount >= MAX_TURNS}
                className="flex h-11 items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-light disabled:opacity-40"
              >
                Enviar
              </button>
            </div>
            {loading && <button type="button" onClick={() => abortRef.current?.abort()} className="mt-2 text-xs text-text-muted underline">Cancelar</button>}
          </form>
        </section>
      </div>

      {conversationId && (
        <button
          onClick={async () => {
            try { await archiveConversation(conversationId); setConversationId(undefined); setMessages([]); void refreshConversations(); } catch { setError("No pudimos archivar la conversación."); }
          }}
          className="shrink-0 border-t border-border px-5 py-3 text-left text-xs text-text-muted hover:text-warning sm:py-2.5"
        >
          Archivar conversación
        </button>
      )}
    </aside>
  </div>;
}
