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
  const abortRef = useRef<AbortController>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
  }, [tenant, user]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const selectConversation = async (id: string) => {
    const requestedTenant = tenant;
    const requestedUser = user;
    setConversationId(id); setError(undefined);
    try {
      const rows = await listMessages(id);
      if (useAuthStore.getState().currentTenant === requestedTenant && useAuthStore.getState().user === requestedUser) setMessages(rows.map((row) => ({ ...row, tenant_id: requestedTenant ?? "" })));
    } catch { setError("No pudimos cargar este historial."); }
  };

  const newConversation = async () => {
    setError(undefined);
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

  if (!open) return null;
  const turnCount = messages.filter((message) => message.role === "user").length;
  const accessContext: AccessContext = { role, enabledFeatures, allowedModules, currentTenant: tenant };
  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Asistente de negocio">
    <button className="absolute inset-0 bg-black/30" aria-label="Cerrar asistente" onClick={onClose} />
    <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl">
      <header className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Asistente {tenant ?? ""}</p><h2 className="text-base font-bold text-text-primary">Consultá tu operación</h2></div><div className="flex items-center gap-1"><button onClick={() => void newConversation()} className="rounded-md px-2 py-1 text-xs font-semibold text-primary sm:hidden">Nueva</button><button onClick={onClose} className="rounded-md px-2 py-1 text-lg text-text-muted hover:bg-surface-alt" aria-label="Cerrar">×</button></div></header>
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-36 shrink-0 border-r border-border p-2 sm:block"><button onClick={() => void newConversation()} className="mb-2 w-full rounded-md bg-primary px-2 py-2 text-xs font-semibold text-primary-fg">+ Nueva</button>{conversations.map((conversation) => <button key={conversation.id} onClick={() => void selectConversation(conversation.id)} className={`mb-1 w-full truncate rounded-md px-2 py-2 text-left text-xs ${conversation.id === conversationId ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface-alt"}`}>{conversation.title}</button>)}</nav>
        <section className="flex min-w-0 flex-1 flex-col"><div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">{messages.length === 0 && <p className="py-12 text-center text-sm text-text-muted">Preguntá por ventas, stock, productos dormidos o inventario.</p>}{messages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "assistant" ? <AssistantMessage message={message} context={accessContext} /> : <div className="max-w-[90%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-fg"><p className="whitespace-pre-wrap leading-relaxed">{message.content}</p></div>}</div>)}{loading && <p role="status" className="text-xs text-text-muted">Pensando…</p>}{error && <p role="alert" className="rounded-md bg-warning/10 p-2 text-xs text-warning">{error}</p>}<div ref={messagesEndRef} /></div><form onSubmit={(event) => { event.preventDefault(); void send(); }} className="border-t border-border p-3"><div className="flex gap-2"><label htmlFor="drawer-chat-input" className="sr-only">Pregunta al asistente</label><input id="drawer-chat-input" value={input} onChange={(event) => setInput(event.target.value)} maxLength={500} disabled={loading || turnCount >= MAX_TURNS} placeholder={turnCount >= MAX_TURNS ? "Límite alcanzado" : "Escribí tu pregunta…"} className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none" /><button type="submit" disabled={!input.trim() || loading || turnCount >= MAX_TURNS} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-fg disabled:opacity-40">Enviar</button></div>{loading && <button type="button" onClick={() => abortRef.current?.abort()} className="mt-2 text-xs text-text-muted underline">Cancelar</button>}</form></section>
      </div>
      {conversationId && <button onClick={async () => { try { await archiveConversation(conversationId); setConversationId(undefined); setMessages([]); void refreshConversations(); } catch { setError("No pudimos archivar la conversación."); } }} className="border-t border-border px-4 py-2 text-left text-xs text-text-muted hover:text-warning">Archivar conversación</button>}
    </aside>
  </div>;
}
