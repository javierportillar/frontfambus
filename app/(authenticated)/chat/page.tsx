"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  archiveConversation,
  createConversation,
  listConversations,
  listMessages,
  normalizeChatMessage,
  sendChatMessage,
  type ChatMessage,
  type Conversation,
} from "@/lib/api/chat";
import { formatMessageTime } from "@/lib/api/chatView";
import { useAuthStore } from "@/lib/auth/store";
import { getTenantDisplay } from "@/lib/tenant/config";
import { LogoMark } from "@/components/Logo";
import { AssistantMessage } from "@/components/chat/AssistantMessage";
import type { AccessContext } from "@/lib/auth/access";

const MAX_TURNS = 20;

const SUGGESTIONS = [
  "¿Cómo van las ventas este mes?",
  "¿Qué productos necesitan atención?",
  "¿Cuál es la situación del inventario?",
];

interface ConversationSelectHandler {
  // eslint-disable-next-line no-unused-vars
  (conversationId: string): void;
}

function ThinkingDots(): JSX.Element {
  return (
    <span className="inline-flex gap-1" aria-hidden="true">
      <span className="chat-dot" />
      <span className="chat-dot" />
      <span className="chat-dot" />
    </span>
  );
}

function MessageTime({ message }: { message: ChatMessage }): JSX.Element {
  const label = message.role === "user" ? "Enviado" : "Respondido";
  return <time dateTime={message.created_at} className="mt-1 block text-[10px] text-text-muted">{label} · {formatMessageTime(message.created_at)}</time>;
}

function ConversationList({
  conversations,
  conversationId,
  onSelect,
  scrollAreaClassName = "min-h-0 flex-1",
}: {
  conversations: Conversation[];
  conversationId?: string;
  onSelect: ConversationSelectHandler;
  scrollAreaClassName?: string;
}): JSX.Element {
  if (!conversations.length) {
    return <p className="px-3 py-4 text-xs leading-relaxed text-text-muted">Tus conversaciones aparecerán acá.</p>;
  }

  return (
    <div
      role="region"
      aria-label="Conversaciones recientes"
      className={`space-y-1 overflow-y-auto overscroll-contain ${scrollAreaClassName}`}
    >
      {conversations.map((conversation) => (
        <button
          key={conversation.id}
          type="button"
          onClick={() => onSelect(conversation.id)}
          className={`w-full truncate rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
            conversation.id === conversationId
              ? "bg-primary/10 font-semibold text-primary"
              : "text-text-secondary hover:bg-surface-alt hover:text-text-primary"
          }`}
          title={conversation.title}
        >
          {conversation.title}
        </button>
      ))}
    </div>
  );
}

export default function ChatPage(): JSX.Element {
  const currentTenant = useAuthStore((state) => state.currentTenant);
  const user = useAuthStore((state) => state.user);
  const role = useAuthStore((state) => state.role);
  const enabledFeatures = useAuthStore((state) => state.enabledFeatures);
  const allowedModules = useAuthStore((state) => state.allowedModules);
  const tenantDisplay = currentTenant ? getTenantDisplay(currentTenant) : undefined;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const [greeting, setGreeting] = useState("Buenas tardes");
  const abortRef = useRef<AbortController>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refreshConversations = useCallback(async () => {
    const requestedTenant = useAuthStore.getState().currentTenant;
    const requestedUser = useAuthStore.getState().user;

    try {
      const rows = await listConversations();
      if (
        useAuthStore.getState().currentTenant === requestedTenant &&
        useAuthStore.getState().user === requestedUser
      ) {
        setConversations(rows);
      }
    } catch {
      setError("No pudimos cargar tus conversaciones.");
    }
  }, []);

  useEffect(() => {
    if (currentTenant) void refreshConversations();
  }, [currentTenant, refreshConversations]);

  useEffect(() => {
    abortRef.current?.abort();
    setConversations([]);
    setConversationId(undefined);
    setMessages([]);
    setInput("");
    setError(undefined);
    setMobileHistoryOpen(false);
  }, [currentTenant, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches");
  }, []);

  const selectConversation = async (id: string) => {
    const requestedTenant = currentTenant;
    const requestedUser = user;
    setConversationId(id);
    setError(undefined);
    setMobileHistoryOpen(false);

    try {
      const rows = await listMessages(id);
      if (
        useAuthStore.getState().currentTenant === requestedTenant &&
        useAuthStore.getState().user === requestedUser
      ) {
        setMessages(rows.map((row) => ({ ...row, tenant_id: requestedTenant ?? "" })));
      }
    } catch {
      setError("No pudimos cargar este historial.");
    }
  };

  const newConversation = async () => {
    setError(undefined);
    setMobileHistoryOpen(false);
    try {
      const row = await createConversation();
      setConversations((previous) => [row, ...previous.filter((item) => item.id !== row.id)]);
      setConversationId(row.id);
      setMessages([]);
    } catch {
      setError("No pudimos crear la conversación.");
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    const requestedTenant = currentTenant;
    const requestedUser = user;
    const turnCount = messages.filter((message) => message.role === "user").length;

    if (!text || isLoading || turnCount >= MAX_TURNS || !requestedTenant || !requestedUser) return;

    setInput("");
    setError(undefined);
    setIsLoading(true);
    const requestId = crypto.randomUUID();
    const optimistic = normalizeChatMessage({
      id: requestId,
      tenant_id: requestedTenant,
      conversation_id: conversationId ?? "",
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    });
    setMessages((previous) => [...previous, optimistic]);
    abortRef.current = new AbortController();

    try {
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        const created = await createConversation(abortRef.current.signal);
        activeConversationId = created.id;
        setConversationId(created.id);
        setConversations((previous) => [created, ...previous]);
      }

      if (
        useAuthStore.getState().currentTenant !== requestedTenant ||
        useAuthStore.getState().user !== requestedUser
      ) return;

      const reply = await sendChatMessage(
        text,
        activeConversationId,
        requestId,
        abortRef.current.signal,
      );
      if (
        reply.tenant_id !== requestedTenant ||
        useAuthStore.getState().currentTenant !== requestedTenant ||
        useAuthStore.getState().user !== requestedUser
      ) return;

      setConversationId(reply.conversation_id);
      setMessages((previous) => [
        ...previous,
        {
          id: `${requestId}-assistant`,
          conversation_id: reply.conversation_id,
          role: "assistant",
          content: reply.text,
          created_at: new Date().toISOString(),
          tenant_id: reply.tenant_id,
          status: reply.status,
          tools_used: reply.tools_used,
          sources: reply.sources,
          freshness: reply.freshness,
          entity_refs: reply.entity_refs,
          attachments: reply.attachments,
        },
      ]);
      void refreshConversations();
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) {
        setError("No pudimos procesar tu consulta. Intentá de nuevo.");
      }
    } finally {
      setIsLoading(false);
      abortRef.current = undefined;
    }
  };

  const turnCount = messages.filter((message) => message.role === "user").length;
  const accessContext: AccessContext = {
    role,
    enabledFeatures,
    allowedModules,
    currentTenant,
  };
  const rawDisplayName = user?.split(/[.@]/)[0] || "equipo";
  const displayName = rawDisplayName.charAt(0).toUpperCase() + rawDisplayName.slice(1);


  return (
    <div data-testid="assistant-workspace" className="assistant-workspace -mx-4 -mt-4 flex h-[calc(100dvh-5rem)] overflow-hidden bg-background text-text-primary lg:-mx-6 lg:h-[calc(100dvh-2rem)]">
      <aside aria-label="Historial de conversaciones" className="hidden min-h-0 w-72 shrink-0 flex-col border-r border-border bg-surface-alt px-4 py-5 lg:flex">
        <div className="flex items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-2 text-text-primary" aria-label="Volver al inicio">
            <LogoMark size={28} tone="light" />
            <span className="font-serif text-xl font-semibold tracking-tight">Asistente IA</span>
          </Link>
          <span className="rounded-full bg-surface px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            IA
          </span>
        </div>

        <div className="mt-7 rounded-2xl border border-border bg-surface p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Negocio activo</p>
          <p className="mt-1 truncate text-sm font-semibold text-text-primary">
            {tenantDisplay?.name ?? currentTenant ?? "Tu negocio"}
          </p>
          <p className="mt-0.5 truncate text-xs text-text-muted">
            {tenantDisplay?.shortDescription ?? "Datos operativos"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void newConversation()}
          className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm font-semibold text-text-primary shadow-sm transition-colors hover:border-primary/40 hover:text-primary"
        >
          <span className="text-lg leading-none" aria-hidden="true">+</span>
          Nueva conversación
        </button>

        <div className="mt-8 flex min-h-0 flex-1 flex-col">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">Recientes</p>
          <ConversationList conversations={conversations} conversationId={conversationId} onSelect={(id) => void selectConversation(id)} />
        </div>

        {conversationId && (
          <button
            type="button"
            onClick={async () => {
              try {
                await archiveConversation(conversationId);
                setConversationId(undefined);
                setMessages([]);
                void refreshConversations();
              } catch {
                setError("No pudimos archivar la conversación.");
              }
            }}
            className="mt-4 border-t border-border pt-3 text-left text-xs text-text-muted transition-colors hover:text-warning"
          >
            Archivar conversación
          </button>
        )}
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-text-primary lg:px-8 lg:py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-full lg:hidden" aria-label="Volver al inicio"><span className="text-2xl">←</span></Link>
            <div className="min-w-0 lg:hidden">
              <div className="flex items-center gap-2"><LogoMark size={26} tone="light" /><p className="truncate text-base font-semibold">Asistente IA</p></div>
              <p className="truncate text-xs text-text-muted">{tenantDisplay?.name ?? currentTenant ?? "Tu negocio"}</p>
            </div>
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-semibold text-text-primary">Asistente de negocio</p>
              <p className="truncate text-xs text-text-muted">{tenantDisplay?.name ?? currentTenant ?? "Datos de tu operación"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMobileHistoryOpen((open) => !open)} className="rounded-full border border-border bg-surface-alt px-3 py-2 text-xs font-semibold text-text-secondary lg:hidden" aria-expanded={mobileHistoryOpen}>
              Conversaciones
            </button>
            <span className="hidden rounded-full bg-white px-3 py-1.5 text-xs text-text-muted lg:inline-flex">
              {turnCount}/{MAX_TURNS} turnos
            </span>
          </div>
        </header>

        {mobileHistoryOpen && (
          <div className="shrink-0 border-b border-border bg-surface-alt p-4 lg:hidden">
            <button type="button" onClick={() => void newConversation()} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-fg">
              <span aria-hidden="true">+</span> Nueva conversación
            </button>
            <ConversationList
              conversations={conversations}
              conversationId={conversationId}
              onSelect={(id) => void selectConversation(id)}
              scrollAreaClassName="max-h-[35dvh] shrink-0"
            />
          </div>
        )}

        <div
          role="region"
          aria-label="Mensajes de la conversación"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background px-5 py-8 lg:px-10 lg:py-10"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-3xl flex-col items-center justify-center text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center" aria-hidden="true"><LogoMark size={52} tone="light" /></div>
              <p className="hidden text-xs font-semibold uppercase tracking-[0.22em] text-primary lg:block">{tenantDisplay?.name ?? "Tu negocio"}</p>
              <h1 className="mt-3 max-w-2xl font-serif text-[2.65rem] leading-tight tracking-tight text-text-primary sm:text-5xl">
                {greeting}, {displayName}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-text-muted sm:text-lg">
                ¿Qué te gustaría entender hoy de tu operación?
              </p>
              <div className="mt-9 hidden w-full gap-3 sm:grid-cols-3 lg:grid">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setInput(suggestion)}
                    className="rounded-2xl border border-[#e4dfd8] bg-white/80 p-4 text-left text-sm leading-relaxed text-text-secondary transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:text-text-primary hover:shadow-sm"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              {error && <p role="alert" className="mt-5 rounded-xl bg-warning/10 p-3 text-sm text-warning">{error}</p>}
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  {message.role === "assistant" ? (
                    <div>
                      <AssistantMessage message={message} context={accessContext} />
                      <MessageTime message={message} />
                    </div>
                  ) : (
                    <div className="max-w-[88%] rounded-2xl bg-primary px-4 py-3 text-sm text-primary-fg shadow-sm">
                      <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                      <MessageTime message={message} />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div role="status" className="flex items-center gap-3 px-2 text-sm text-text-muted">
                  <span>Pensando</span>
                  <ThinkingDots />
                  <span className="sr-only">El asistente está preparando una respuesta</span>
                </div>
              )}
              {error && <p role="alert" className="rounded-xl bg-warning/10 p-3 text-sm text-warning">{error}</p>}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
          className="shrink-0 bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:px-10 lg:pb-7"
        >
          <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-[1.6rem] border border-border bg-surface p-4 shadow-sm transition-shadow focus-within:border-primary/50 focus-within:shadow-md lg:rounded-2xl lg:p-3">
            <label htmlFor="page-chat-input" className="sr-only">Pregunta al asistente</label>
            <textarea
              id="page-chat-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              maxLength={500}
              rows={1}
              disabled={isLoading || turnCount >= MAX_TURNS}
              placeholder={turnCount >= MAX_TURNS ? "Límite de turnos alcanzado" : "Chat con el asistente"}
              className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim() || turnCount >= MAX_TURNS}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-fg transition-colors hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-40 lg:h-10 lg:w-auto lg:rounded-xl lg:px-4 lg:text-sm"
              aria-label="Enviar"
            >
              <span className="hidden lg:inline">Enviar</span>
              <span className="lg:hidden" aria-hidden="true">↑</span>
            </button>
          </div>
          <div className="mx-auto mt-3 flex max-w-3xl items-center justify-between text-[11px] text-text-muted lg:mt-2 lg:justify-center">
            <span className="rounded-full bg-primary/10 px-3 py-1.5 text-primary lg:hidden">{tenantDisplay?.name ?? "Negocio"} IA · datos del negocio</span>
            <p className="hidden lg:block">La información se consulta con los datos disponibles de {tenantDisplay?.name ?? "tu negocio"}.</p>
          </div>
          {isLoading && (
            <button type="button" onClick={() => abortRef.current?.abort()} className="mx-auto mt-1 block text-xs text-text-muted underline">
              Cancelar
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
