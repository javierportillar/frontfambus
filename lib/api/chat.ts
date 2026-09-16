import { apiFetchJson } from "./client";

export type AssistantStatus = "complete" | "partial" | "empty" | "needs_clarification" | "unavailable";
export type ReportFormat = "excel" | "pdf" | "word";
export interface SourceEvidence { source_id: string; domain: string; kind: "duckdb" | "supabase" | "document"; citation: string; cutoff_at: string | null; observed_at: string | null; status: "used" | "failed"; }
export interface Freshness { domain: string; cutoff_at: string | null; observed_at: string | null; status: "current" | "stale" | "unknown"; }
export interface EntityRef { entity_type: string; entity_id: string; label: string; domain: string; href: string; }

export interface Conversation {
  id: string;
  tenant_id: string;
  user_id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_message_at: string;
  message_count: number;
}
export interface ReportAttachment { type: "report"; format: ReportFormat; filename: string; download_url: string; state: "available" | "expired"; expires_at: string | null; date_from: string | null; date_to: string | null; period_label: string | null; }
export interface ChatMessage { id: string; conversation_id: string; role: "user" | "assistant" | "tool"; content: string; created_at: string; tenant_id: string; status: AssistantStatus; tools_used: string[]; sources: SourceEvidence[]; freshness: Freshness[]; entity_refs: EntityRef[]; attachments: ReportAttachment[]; }
export interface ChatReply { status: AssistantStatus; tenant_id: string; text: string; conversation_id: string; turn_count: number; tools_used: string[]; sources: SourceEvidence[]; freshness: Freshness[]; entity_refs: EntityRef[]; attachments: ReportAttachment[]; }

function arrayOrEmpty<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
function reportFormat(value: unknown): ReportFormat { return value === "pdf" || value === "word" ? value : "excel"; }
function normalizeAttachment(value: Partial<ReportAttachment> & { download_url?: unknown }): ReportAttachment { const expiresAt = value.expires_at ?? null; const expired = typeof expiresAt === "string" && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) <= Date.now(); return { type: "report", format: reportFormat(value.format), filename: typeof value.filename === "string" ? value.filename : "reporte", download_url: typeof value.download_url === "string" ? value.download_url : "", state: value.state === "expired" || expired ? "expired" : "available", expires_at: expiresAt, date_from: value.date_from ?? null, date_to: value.date_to ?? null, period_label: value.period_label ?? null }; }
export function chatCacheKey(tenant: string, user: string, conversationId?: string): string { return ["assistant-chat", tenant, user, conversationId ?? "inbox"].map(encodeURIComponent).join(":"); }
export function normalizeChatReply(value: Partial<ChatReply>): ChatReply { return { status: value.status ?? "complete", tenant_id: value.tenant_id ?? "", text: value.text ?? "", conversation_id: value.conversation_id ?? "", turn_count: value.turn_count ?? 0, tools_used: arrayOrEmpty<string>(value.tools_used), sources: arrayOrEmpty<SourceEvidence>(value.sources), freshness: arrayOrEmpty<Freshness>(value.freshness), entity_refs: arrayOrEmpty<EntityRef>(value.entity_refs), attachments: arrayOrEmpty<Partial<ReportAttachment>>(value.attachments).map(normalizeAttachment) }; }
export function normalizeChatMessage(value: Partial<ChatMessage>): ChatMessage { return { id: value.id ?? crypto.randomUUID(), conversation_id: value.conversation_id ?? "", role: value.role ?? "assistant", content: value.content ?? "", created_at: value.created_at ?? new Date(0).toISOString(), tenant_id: value.tenant_id ?? "", status: value.status ?? "complete", tools_used: arrayOrEmpty<string>(value.tools_used), sources: arrayOrEmpty<SourceEvidence>(value.sources), freshness: arrayOrEmpty<Freshness>(value.freshness), entity_refs: arrayOrEmpty<EntityRef>(value.entity_refs), attachments: arrayOrEmpty<Partial<ReportAttachment>>(value.attachments).map(normalizeAttachment) }; }

export function listConversations(signal?: AbortSignal): Promise<Conversation[]> {
  return apiFetchJson("/api/llm/chat/conversations", { signal });
}
export function createConversation(signal?: AbortSignal): Promise<Conversation> {
  return apiFetchJson("/api/llm/chat/conversations", { method: "POST", signal });
}
export function listMessages(id: string, signal?: AbortSignal): Promise<ChatMessage[]> { return apiFetchJson<Partial<ChatMessage>[]>(`/api/llm/chat/conversations/${encodeURIComponent(id)}/messages`, { signal }).then((messages) => messages.map(normalizeChatMessage)); }
export function sendChatMessage(message: string, conversationId?: string, requestId?: string, signal?: AbortSignal): Promise<ChatReply> { return apiFetchJson<Partial<ChatReply>>("/api/llm/qa/chat", { method: "POST", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, conversation_id: conversationId ?? null, request_id: requestId }) }).then(normalizeChatReply); }
export function archiveConversation(id: string, signal?: AbortSignal): Promise<Conversation> { return apiFetchJson(`/api/llm/chat/conversations/${encodeURIComponent(id)}`, { method: "PATCH", signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: true }) }); }
