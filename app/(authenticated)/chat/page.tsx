"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { sendChatMessage, type ChatMessage } from "@/lib/api/chat";
import { createUserMessage, shouldAcceptChatResult } from "@/lib/api/chatView";
import { useAuthStore } from "@/lib/auth/store";
import { AssistantMessage } from "@/components/chat/AssistantMessage";
import type { AccessContext } from "@/lib/auth/access";

function ThinkingDots() {
  return (
    <span className="inline-flex gap-0.5">
      <span className="animate-bounce">.</span>
      <span className="animate-bounce" style={{ animationDelay: "0.15s" }}>.</span>
      <span className="animate-bounce" style={{ animationDelay: "0.3s" }}>.</span>
    </span>
  );
}

const MAX_TURNS = 20;

export default function ChatPage(): JSX.Element {
  const currentTenant = useAuthStore((state) => state.currentTenant);
  const user = useAuthStore((state) => state.user);
  const role = useAuthStore((state) => state.role);
  const enabledFeatures = useAuthStore((state) => state.enabledFeatures);
  const allowedModules = useAuthStore((state) => state.allowedModules);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [turnCount, setTurnCount] = useState(0);
  const [error, setError] = useState<string>();
  const abortRef = useRef<AbortController>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    abortRef.current?.abort();
    setMessages([]); setInput(""); setError(undefined); setConversationId(undefined); setTurnCount(0); setIsLoading(false);
  }, [currentTenant, user]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  const handleSend = async () => {
    const requestedTenant = currentTenant;
    const requestedUser = user;
    if (!input.trim() || isLoading || turnCount >= MAX_TURNS || !requestedTenant || !requestedUser) return;
    const userMsg = input.trim();
    const requestId = crypto.randomUUID();
    setInput(""); setError(undefined); setMessages((prev) => [...prev, createUserMessage(userMsg, requestId, requestedTenant)]); setIsLoading(true);
    abortRef.current = new AbortController();
    try {
      const resp = await sendChatMessage(userMsg, conversationId, requestId, abortRef.current.signal);
      if (!shouldAcceptChatResult(resp, requestedTenant) || useAuthStore.getState().currentTenant !== requestedTenant || useAuthStore.getState().user !== requestedUser) return;
      setMessages((prev) => [...prev, { id: `${requestId}-assistant`, conversation_id: resp.conversation_id, role: "assistant", content: resp.text, created_at: new Date().toISOString(), tenant_id: resp.tenant_id, status: resp.status, tools_used: resp.tools_used, sources: resp.sources, freshness: resp.freshness, entity_refs: resp.entity_refs, attachments: resp.attachments }]);
      setConversationId(resp.conversation_id); setTurnCount(resp.turn_count);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === "AbortError")) setError("No pudimos procesar tu consulta. Intentá de nuevo.");
    } finally { setIsLoading(false); abortRef.current = undefined; }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };
  const accessContext: AccessContext = { role, enabledFeatures, allowedModules, currentTenant };

  return (
    <div className="mx-auto flex max-w-2xl flex-col" style={{ height: "calc(100vh - 80px)" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-1 py-3">
        <h1 className="text-lg font-bold text-text-primary">Asistente {currentTenant ?? "de negocio"}</h1>
        <span className="text-xs text-text-muted">
          Turno {turnCount}/{MAX_TURNS}
        </span>
      </div>

      {/* Help block */}
      <details className="mb-3 text-sm">
        <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
          ¿Qué puedo preguntar?
        </summary>
        <div className="mt-2 space-y-1 rounded-lg bg-surface-alt p-3 text-xs text-text-muted">
          <p>• ¿Cómo van las ventas este mes vs el pasado?</p>
          <p>• ¿Qué productos están dormidos hace más de 60 días?</p>
          <p>• ¿Quién es la mejor vendedora?</p>
          <p>• ¿Hay alertas críticas hoy?</p>
          <p>• ¿Cuál fue la última compra y de qué proveedor?</p>
          <p>• ¿Cuánto hemos comprado este mes?</p>
          <p>• ¿Tenemos filtros de aceite? ¿A cuánto están?</p>
          <p>• ¿Quiénes son nuestros mejores clientes?</p>
          <p>• ¿Cómo está la clasificación ABC/XYZ?</p>
          <p>• ¿Hubo drift en alguna categoría del forecast?</p>
          <p>• ¿Cómo está el forecast?</p>
          <p>• ¿Cuánto vale el inventario?</p>
        </div>
      </details>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-2" aria-live="polite">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-text-muted">
            Preguntale al asistente sobre el negocio. Usa lenguaje natural.
          </p>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" ? <AssistantMessage message={msg} context={accessContext} /> : <div className="max-w-[85%] rounded-xl bg-primary px-4 py-2.5 text-sm text-primary-fg"><p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p></div>}
          </div>
        ))}

        {isLoading && <div role="status" className="flex justify-start"><div className="rounded-xl bg-surface-alt border border-border px-4 py-2.5 text-sm text-text-muted">Pensando<ThinkingDots /></div></div>}
        {error && <p role="alert" className="rounded-md bg-warning/10 p-2 text-xs text-warning">{error}</p>}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border pt-3 pb-4">
        <div className="flex gap-2">
          <label htmlFor="page-chat-input" className="sr-only">Pregunta al asistente</label>
          <input
            id="page-chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={turnCount >= MAX_TURNS ? "Límite de turnos alcanzado" : "Escribí tu pregunta..."}
            disabled={isLoading || turnCount >= MAX_TURNS}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            maxLength={500}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={isLoading || !input.trim() || turnCount >= MAX_TURNS}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-fg hover:bg-primary-light disabled:opacity-40 transition-colors"
          >
            Enviar
          </button>
        </div>
        {isLoading && <button type="button" onClick={() => abortRef.current?.abort()} className="mt-2 text-xs text-text-muted underline">Cancelar</button>}
        {turnCount >= MAX_TURNS && (
          <p className="mt-2 text-xs text-text-muted text-center">
            Iniciá una nueva conversación (refrescá la página).
          </p>
        )}
      </div>
    </div>
  );
}
