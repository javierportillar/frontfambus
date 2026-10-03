"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/lib/auth/store";
import { useVisualViewport } from "@/lib/hooks/useVisualViewport";
import { archiveConversation, createConversation, listConversations, listMessages, normalizeChatMessage, sendChatMessage, type ChatMessage, type Conversation } from "@/lib/api/chat";
import { AssistantMessage } from "./AssistantMessage";
import type { AccessContext } from "@/lib/auth/access";

const MAX_TURNS = 20;
const MIN_DRAWER_WIDTH = 340;
const MAX_DRAWER_WIDTH = 900;
const DEFAULT_DRAWER_WIDTH = 512; // sm:max-w-lg

function getStoredDrawerWidth(): number {
  if (typeof window === "undefined") return DEFAULT_DRAWER_WIDTH;
  const stored = localStorage.getItem("chat-drawer-width");
  const parsed = stored ? parseInt(stored, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= MIN_DRAWER_WIDTH && parsed <= MAX_DRAWER_WIDTH ? parsed : DEFAULT_DRAWER_WIDTH;
}

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
  const [conversationError, setConversationError] = useState<string>();
  const [closing, setClosing] = useState(false);
  const [mobileConvos, setMobileConvos] = useState(false);
  const [desktopConvosOpen, setDesktopConvosOpen] = useState(true);
  const [drawerWidth, setDrawerWidth] = useState(DEFAULT_DRAWER_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const abortRef = useRef<AbortController>();
  const conversationActionIdRef = useRef(0);
  const conversationsRefreshIdRef = useRef(0);
  const conversationsRefreshAbortRef = useRef<AbortController>();
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const keepMessagesAtBottomRef = useRef(true);
  const touchStartRef = useRef<{ y: number; time: number } | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const dragRef = useRef({ startX: 0, startWidth: 0 });
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewport = useVisualViewport();

  const refreshConversations = useCallback(async () => {
    const requestedTenant = useAuthStore.getState().currentTenant;
    const requestedUser = useAuthStore.getState().user;
    const refreshId = ++conversationsRefreshIdRef.current;
    conversationsRefreshAbortRef.current?.abort();
    const controller = new AbortController();
    conversationsRefreshAbortRef.current = controller;
    try {
      const rows = await listConversations(controller.signal);
      if (
        refreshId === conversationsRefreshIdRef.current
        && useAuthStore.getState().currentTenant === requestedTenant
        && useAuthStore.getState().user === requestedUser
      ) {
        setConversations(rows);
        setConversationError(undefined);
      }
    } catch {
      if (
        refreshId === conversationsRefreshIdRef.current
        && !controller.signal.aborted
        && useAuthStore.getState().currentTenant === requestedTenant
        && useAuthStore.getState().user === requestedUser
      ) {
        setConversationError("No pudimos cargar tus conversaciones.");
      }
    } finally {
      if (conversationsRefreshAbortRef.current === controller) {
        conversationsRefreshAbortRef.current = undefined;
      }
    }
  }, []);

  useEffect(() => {
    if (open && tenant && user) void refreshConversations();
  }, [open, tenant, user, refreshConversations]);
  useEffect(() => {
    const stored = window.localStorage.getItem("chat-desktop-conversations-open");
    if (stored !== null) setDesktopConvosOpen(stored === "true");
  }, []);
  useEffect(() => {
    conversationActionIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = undefined;
    setConversations([]);
    setConversationId(undefined);
    setMessages([]);
    setInput("");
    setError(undefined);
    setConversationError(undefined);
    setLoading(false);
    setClosing(false);
    setMobileConvos(false);
  }, [tenant, user]);
  useEffect(() => {
    const messagesRegion = messagesScrollRef.current;
    if (!messagesRegion || !keepMessagesAtBottomRef.current) return;
    messagesRegion.scrollTop = messagesRegion.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previous = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    const scrollY = window.scrollY;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    requestAnimationFrame(() => drawerRef.current?.focus());

    return () => {
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.width = previous.width;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  useEffect(() => {
    setDrawerWidth(getStoredDrawerWidth());
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    dragRef.current = { startX: e.clientX, startWidth: drawerRef.current?.offsetWidth ?? drawerWidth };

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = dragRef.current.startX - ev.clientX;
      const newWidth = Math.min(MAX_DRAWER_WIDTH, Math.max(MIN_DRAWER_WIDTH, dragRef.current.startWidth + delta));
      setDrawerWidth(newWidth);
      if (drawerRef.current) drawerRef.current.style.setProperty("--chat-drawer-width", `${newWidth}px`);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      if (drawerRef.current) {
        const w = drawerRef.current.offsetWidth;
        setDrawerWidth(w);
        localStorage.setItem("chat-drawer-width", String(w));
      }
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [drawerWidth]);

  const handleClose = useCallback(() => {
    setClosing(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setClosing(false);
      onClose();
    }, 220);
  }, [onClose]);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

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

  const handleMessagesScroll = useCallback(() => {
    const region = messagesScrollRef.current;
    if (!region) return;
    keepMessagesAtBottomRef.current =
      region.scrollHeight - region.scrollTop - region.clientHeight < 80;
  }, []);

  const trapDialogFocus = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter((element) => (
      element.getAttribute("aria-hidden") !== "true"
      && element.getClientRects().length > 0
      && getComputedStyle(element).visibility !== "hidden"
    ));
    if (focusable.length === 0) {
      event.preventDefault();
      drawer.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && activeIndex <= 0) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (activeIndex === focusable.length - 1 || activeIndex < 0)) {
      event.preventDefault();
      first?.focus();
    }
  }, []);

  const selectConversation = async (id: string) => {
    const requestedTenant = tenant;
    const requestedUser = user;
    const actionId = ++conversationActionIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    keepMessagesAtBottomRef.current = true;
    setLoading(false);
    setConversationId(id); setError(undefined); setMobileConvos(false);
    setMessages([]);
    try {
      const rows = await listMessages(id, controller.signal);
      if (
        actionId !== conversationActionIdRef.current
        || useAuthStore.getState().currentTenant !== requestedTenant
        || useAuthStore.getState().user !== requestedUser
      ) return;
      setMessages(rows.map((row) => ({ ...row, tenant_id: requestedTenant ?? "" })));
    } catch {
      if (actionId === conversationActionIdRef.current && !controller.signal.aborted) {
        setError("No pudimos cargar este historial.");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = undefined;
    }
  };

  const newConversation = async () => {
    const requestedTenant = tenant;
    const requestedUser = user;
    const actionId = ++conversationActionIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    keepMessagesAtBottomRef.current = true;
    setLoading(false);
    setError(undefined); setMobileConvos(false);
    setConversationId(undefined);
    setMessages([]);
    try {
      const row = await createConversation(controller.signal);
      if (
        actionId !== conversationActionIdRef.current
        || useAuthStore.getState().currentTenant !== requestedTenant
        || useAuthStore.getState().user !== requestedUser
      ) return;
      setConversations((prev) => [row, ...prev]);
      setConversationId(row.id);
      setMessages([]);
    } catch {
      if (actionId === conversationActionIdRef.current && !controller.signal.aborted) {
        setError("No pudimos crear la conversación.");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = undefined;
    }
  };

  const toggleDesktopConversations = () => {
    setDesktopConvosOpen((current) => {
      const next = !current;
      window.localStorage.setItem("chat-desktop-conversations-open", String(next));
      return next;
    });
  };

  const send = async () => {
    const text = input.trim();
    const requestedTenant = tenant;
    const requestedUser = user;
    if (!text || loading || !requestedTenant || !requestedUser) return;
    const actionId = ++conversationActionIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setInput(""); setError(undefined); setLoading(true);
    const requestId = crypto.randomUUID();
    const optimistic = normalizeChatMessage({ id: requestId, tenant_id: requestedTenant, conversation_id: conversationId ?? "", role: "user", content: text, created_at: new Date().toISOString() });
    setMessages((prev) => [...prev, optimistic]);
    try {
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        const created = await createConversation(controller.signal);
        if (
          actionId !== conversationActionIdRef.current
          || useAuthStore.getState().currentTenant !== requestedTenant
          || useAuthStore.getState().user !== requestedUser
        ) return;
        activeConversationId = created.id;
        setConversationId(created.id);
        setConversations((prev) => [created, ...prev]);
      }
      if (
        actionId !== conversationActionIdRef.current
        || useAuthStore.getState().currentTenant !== requestedTenant
        || useAuthStore.getState().user !== requestedUser
      ) return;
      setMessages((prev) => prev.map((message) => (
        message.id === requestId
          ? { ...message, conversation_id: activeConversationId }
          : message
      )));
      const reply = await sendChatMessage(text, activeConversationId, requestId, controller.signal);
      if (
        actionId !== conversationActionIdRef.current
        || reply.tenant_id !== requestedTenant
        || reply.conversation_id !== activeConversationId
        || useAuthStore.getState().currentTenant !== requestedTenant
        || useAuthStore.getState().user !== requestedUser
      ) return;
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
      if (
        actionId === conversationActionIdRef.current
        && !controller.signal.aborted
        && !(cause instanceof DOMException && cause.name === "AbortError")
      ) setError("No pudimos procesar tu consulta. Intentá de nuevo.");
    } finally {
      if (actionId === conversationActionIdRef.current) setLoading(false);
      if (abortRef.current === controller) abortRef.current = undefined;
    }
  };

  if (!open && !closing) return null;
  const turnCount = messages.filter((message) => message.role === "user").length;
  const accessContext: AccessContext = { role, enabledFeatures, allowedModules, currentTenant: tenant };
  const animationClass = closing ? "chat-exit" : "chat-enter";

  return <div
    className="fixed inset-x-0 z-50 overflow-hidden"
    style={viewport.height > 0 ? { top: `${viewport.offsetTop}px`, height: `${viewport.height}px` } : { top: 0, height: "100dvh" }}
    role="dialog"
    aria-modal="true"
    aria-label="Asistente de negocio"
    onKeyDown={trapDialogFocus}
  >
    <button className={`absolute inset-0 bg-black/30 transition-opacity duration-200 ${closing ? "opacity-0" : "opacity-100"}`} aria-label="Cerrar asistente" onClick={handleClose} />
    <aside
      ref={drawerRef}
      tabIndex={-1}
      className={`absolute inset-0 flex min-h-0 w-full flex-col overflow-hidden border-t border-border bg-surface shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[min(var(--chat-drawer-width),100vw)] sm:rounded-none sm:rounded-l-2xl sm:border-t-0 sm:border-l ${animationClass}`}
      style={{ "--chat-drawer-width": `${drawerWidth}px` } as React.CSSProperties}
    >
      {/* Resize handle — left edge on desktop */}
      <div
        onMouseDown={handleResizeStart}
        className="group absolute left-0 top-0 z-20 hidden h-full w-2.5 cursor-col-resize sm:flex items-center justify-center"
        title="Arrastrá para ajustar el ancho"
      >
        <div className={`h-12 w-0.5 rounded-full transition-colors ${isResizing ? "bg-primary" : "bg-border group-hover:bg-primary"}`} />
      </div>
      {/* Swipe hint on mobile */}
      <div
        className="flex shrink-0 justify-center pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] sm:hidden"
        aria-hidden="true"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="h-1 w-10 rounded-full bg-border-strong" />
      </div>

      <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2 sm:px-4 sm:py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Asistente {tenant ?? ""}</p>
          <h2 className="truncate text-sm font-bold text-text-primary sm:text-base">Consultá tu operación</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Mobile conversation toggle */}
          {(conversations.length > 0 || conversationError) && (
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
          {conversationError && <p role="alert" className="pb-2 text-xs text-warning">{conversationError}</p>}
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
        <nav aria-label="Conversaciones" className={`hidden min-h-0 shrink-0 flex-col overflow-hidden border-r border-border p-3 transition-[width] duration-200 sm:flex ${desktopConvosOpen ? "w-48" : "w-14"}`}>
          <div className={`mb-3 flex items-center ${desktopConvosOpen ? "justify-between gap-2" : "flex-col gap-2"}`}>
            <button onClick={() => void newConversation()} className={`flex items-center justify-center rounded-lg bg-primary text-primary-fg transition-colors hover:bg-primary-light ${desktopConvosOpen ? "min-w-0 flex-1 px-3 py-2.5 text-xs font-semibold" : "h-9 w-9 text-lg"}`} aria-label="Nueva conversación" title="Nueva conversación">
              {desktopConvosOpen ? "+ Nueva conversación" : "+"}
            </button>
            <button onClick={toggleDesktopConversations} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-alt hover:text-text-primary" aria-label={desktopConvosOpen ? "Minimizar conversaciones" : "Mostrar conversaciones"} aria-expanded={desktopConvosOpen} title={desktopConvosOpen ? "Minimizar conversaciones" : "Mostrar conversaciones"}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={desktopConvosOpen ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          {desktopConvosOpen && <div className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain">
            {conversationError && <p role="alert" className="px-2 py-1 text-xs text-warning">{conversationError}</p>}
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => void selectConversation(conversation.id)}
                className={`w-full truncate rounded-lg px-3 py-2.5 text-left text-xs transition-all ${conversation.id === conversationId ? "bg-primary/10 text-primary font-medium shadow-sm" : "text-text-muted hover:bg-surface-alt hover:text-text-secondary"}`}
                title={conversation.title}
              >
                {conversation.title}
              </button>
            ))}
          </div>}
        </nav>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={messagesScrollRef}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5"
            role="region"
            aria-label="Mensajes de la conversación"
            aria-live="polite"
            onScroll={handleMessagesScroll}
          >
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
                className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-4 py-3 text-base text-text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 sm:py-2.5"
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
            const archivedConversationId = conversationId;
            const actionId = ++conversationActionIdRef.current;
            abortRef.current?.abort();
            abortRef.current = undefined;
            setLoading(false);
            try {
              await archiveConversation(archivedConversationId);
              if (actionId !== conversationActionIdRef.current) return;
              keepMessagesAtBottomRef.current = true;
              setConversationId(undefined);
              setMessages([]);
              void refreshConversations();
            } catch {
              if (actionId === conversationActionIdRef.current) {
                setError("No pudimos archivar la conversación.");
              }
            }
          }}
          className="shrink-0 border-t border-border px-5 py-3 text-left text-xs text-text-muted hover:text-warning sm:py-2.5"
        >
          Archivar conversación
        </button>
      )}
    </aside>
  </div>;
}
