"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/auth/store";
import { archiveConversation, createConversation, listConversations, listMessages, sendChatMessage, type ChatMessage, type Conversation, type ReportAttachment } from "@/lib/api/chat";

const MAX_TURNS = 20;

function Sources({ sources }: { sources?: ChatMessage["sources"] }): JSX.Element | null {
  if (!sources?.length) return null;
  return <p className="mt-2 border-t border-border/60 pt-2 text-[11px] text-text-muted">Fuentes: {sources.map((source, i) => <span key={`${source.source}-${i}`}>{i ? " · " : ""}{source.source}{source.section ? ` / ${source.section}` : ""}</span>)}</p>;
}

const DOWNLOAD_LINK_REGEX = /\[([^\]]+)\]\((\/api\/reports\/download\/[^\)]+)\)/g;

function isExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const expires = Date.parse(expiresAt);
  return Number.isFinite(expires) && Date.now() > expires;
}

function formatPeriod(attachment: ReportAttachment): string | null {
  if (attachment.period_label) return `Período: ${attachment.period_label}`;
  if (attachment.date_from) {
    return `Período: ${attachment.date_from} a ${attachment.date_to ?? "última fecha"}`;
  }
  return null;
}

function ReportCard({ attachment }: { attachment: ReportAttachment }): JSX.Element {
  const isExcel = attachment.format === "excel" || attachment.filename.endsWith(".xlsx");
  const isPdf = attachment.format === "pdf" || attachment.filename.endsWith(".pdf");
  const isWord = attachment.format === "word" || attachment.filename.endsWith(".docx");

  const badgeStyle = isExcel
    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
    : isPdf
    ? "bg-rose-500/20 text-rose-400 border-rose-500/30"
    : "bg-blue-500/20 text-blue-400 border-blue-500/30";

  const label = isExcel ? "EXCEL" : isPdf ? "PDF" : isWord ? "WORD" : "REPORTE";
  const icon = isExcel ? "📊" : isPdf ? "📄" : "📝";
  const period = formatPeriod(attachment);
  const expired = isExpired(attachment.expires_at);

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border/80 bg-surface/90 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-bold tracking-wider ${badgeStyle}`}>
          <span>{icon}</span>
          <span>{label}</span>
        </span>
        {attachment.file_size_kb ? (
          <span className="text-[11px] text-text-muted">{attachment.file_size_kb} KB</span>
        ) : null}
      </div>
      <p className="truncate text-xs font-semibold text-text-primary" title={attachment.filename}>
        {attachment.filename}
      </p>
      {period ? <p className="text-[11px] text-text-muted">{period}</p> : null}
      {expired ? (
        <p className="rounded-md bg-warning/10 px-2 py-1.5 text-center text-[11px] font-medium text-warning">
          ⏱ Este reporte expiró (vigencia 24 h). Pedilo de nuevo en el chat.
        </p>
      ) : (
        <a
          href={attachment.download_url}
          download={attachment.filename}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg shadow transition hover:opacity-90 active:scale-95"
        >
          <span>📥</span>
          <span>Descargar {label}</span>
        </a>
      )}
    </div>
  );
}

function extractAttachments(message: ChatMessage): ReportAttachment[] {
  const list: ReportAttachment[] = [...(message.attachments || [])];
  let match: RegExpExecArray | null;
  DOWNLOAD_LINK_REGEX.lastIndex = 0;
  while ((match = DOWNLOAD_LINK_REGEX.exec(message.content)) !== null) {
    const filename = match[1];
    const url = match[2];
    if (!filename || !url) continue;
    if (!list.some((a) => a.download_url === url)) {
      const ext = filename.split(".").pop()?.toLowerCase();
      const format = ext === "xlsx" ? "excel" : ext === "pdf" ? "pdf" : ext === "docx" ? "word" : "file";
      list.push({ type: "report", format, filename, download_url: url });
    }
  }
  return list;
}

function displayContent(content: string): string {
  // El backend inserta el link como vehículo de persistencia del historial;
  // en la UI se muestra solo la card, nunca el markdown crudo.
  return content.replace(DOWNLOAD_LINK_REGEX, "").trim();
}

export function ChatDrawer({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const tenant = useAuthStore((state) => state.currentTenant);
  const user = useAuthStore((state) => state.user);
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
    try {
      const rows = await listConversations();
      if (useAuthStore.getState().currentTenant === requestedTenant) setConversations(rows);
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
    setConversationId(id); setError(undefined);
    try {
      const rows = await listMessages(id);
      if (useAuthStore.getState().currentTenant === requestedTenant) setMessages(rows);
    } catch { setError("No pudimos cargar este historial."); }
  };

  const newConversation = async () => {
    setError(undefined);
    try { const row = await createConversation(); setConversations((prev) => [row, ...prev]); setConversationId(row.id); setMessages([]); } catch { setError("No pudimos crear la conversación."); }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput(""); setError(undefined); setLoading(true);
    const requestId = crypto.randomUUID();
    const optimistic: ChatMessage = { id: requestId, conversation_id: conversationId ?? "", role: "user", content: text, created_at: new Date().toISOString() };
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
      optimistic.conversation_id = activeConversationId;
      const reply = await sendChatMessage(text, activeConversationId, requestId, abortRef.current.signal);
      setConversationId(reply.conversation_id);
      setMessages((prev) => [
        ...prev,
        {
          id: `${requestId}-assistant`,
          conversation_id: reply.conversation_id,
          role: "assistant",
          content: reply.text,
          created_at: new Date().toISOString(),
          tools_used: reply.tools_used,
          sources: reply.sources,
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
  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Asistente de negocio">
    <button className="absolute inset-0 bg-black/30" aria-label="Cerrar asistente" onClick={onClose} />
    <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl">
      <header className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Asistente {tenant ?? ""}</p><h2 className="text-base font-bold text-text-primary">Consultá tu operación</h2></div><div className="flex items-center gap-1"><button onClick={() => void newConversation()} className="rounded-md px-2 py-1 text-xs font-semibold text-primary sm:hidden">Nueva</button><button onClick={onClose} className="rounded-md px-2 py-1 text-lg text-text-muted hover:bg-surface-alt" aria-label="Cerrar">×</button></div></header>
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-36 shrink-0 border-r border-border p-2 sm:block"><button onClick={() => void newConversation()} className="mb-2 w-full rounded-md bg-primary px-2 py-2 text-xs font-semibold text-primary-fg">+ Nueva</button>{conversations.map((conversation) => <button key={conversation.id} onClick={() => void selectConversation(conversation.id)} className={`mb-1 w-full truncate rounded-md px-2 py-2 text-left text-xs ${conversation.id === conversationId ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-surface-alt"}`}>{conversation.title}</button>)}</nav>
        <section className="flex min-w-0 flex-1 flex-col"><div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.length === 0 && <p className="py-12 text-center text-sm text-text-muted">Preguntá por ventas, stock, productos dormidos o inventario.</p>}{messages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${message.role === "user" ? "bg-primary text-primary-fg" : "border border-border bg-surface-alt text-text-secondary"}`}><p className="whitespace-pre-wrap leading-relaxed">{displayContent(message.content)}</p>{message.role === "assistant" && (<><Sources sources={message.sources} />{extractAttachments(message).map((att, idx) => (<ReportCard key={`${att.download_url}-${idx}`} attachment={att} />))}</>)}</div></div>)}{loading && <p className="text-xs text-text-muted">Pensando…</p>}{error && <p role="alert" className="rounded-md bg-warning/10 p-2 text-xs text-warning">{error}</p>}<div ref={messagesEndRef} /></div><form onSubmit={(event) => { event.preventDefault(); void send(); }} className="border-t border-border p-3"><div className="flex gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} maxLength={500} disabled={loading || turnCount >= MAX_TURNS} placeholder={turnCount >= MAX_TURNS ? "Límite alcanzado" : "Escribí tu pregunta…"} className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none" /><button disabled={!input.trim() || loading || turnCount >= MAX_TURNS} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-fg disabled:opacity-40">Enviar</button></div>{loading && <button type="button" onClick={() => abortRef.current?.abort()} className="mt-2 text-xs text-text-muted underline">Cancelar</button>}</form></section>
      </div>
      {conversationId && <button onClick={async () => { try { await archiveConversation(conversationId); setConversationId(undefined); setMessages([]); void refreshConversations(); } catch { setError("No pudimos archivar la conversación."); } }} className="border-t border-border px-4 py-2 text-left text-xs text-text-muted hover:text-warning">Archivar conversación</button>}
    </aside>
  </div>;
}
