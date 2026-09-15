import { apiFetchJson } from "./client";

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

export interface ReportAttachment {
  type: string;
  format: "excel" | "pdf" | "word" | string;
  filename: string;
  download_url: string;
  file_size_kb?: number;
  date_from?: string | null;
  date_to?: string | null;
  period_label?: string | null;
  expires_at?: string | null;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  created_at: string;
  tools_used?: string[];
  sources?: Array<{ source?: string; section?: string | null; score?: number }>;
  attachments?: ReportAttachment[];
}

export interface ChatReply {
  text: string;
  conversation_id: string;
  turn_count: number;
  tools_used: string[];
  sources: Array<{ source?: string; section?: string | null; score?: number }>;
  data_as_of?: string | null;
  attachments?: ReportAttachment[];
}

export function listConversations(signal?: AbortSignal): Promise<Conversation[]> {
  return apiFetchJson("/api/llm/chat/conversations", { signal });
}

export function createConversation(signal?: AbortSignal): Promise<Conversation> {
  return apiFetchJson("/api/llm/chat/conversations", { method: "POST", signal });
}

export function listMessages(id: string, signal?: AbortSignal): Promise<ChatMessage[]> {
  return apiFetchJson(`/api/llm/chat/conversations/${encodeURIComponent(id)}/messages`, { signal });
}

export function sendChatMessage(message: string, conversationId?: string, requestId?: string, signal?: AbortSignal): Promise<ChatReply> {
  return apiFetchJson("/api/llm/qa/chat", {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversation_id: conversationId ?? null, request_id: requestId }),
  });
}

export function archiveConversation(id: string, signal?: AbortSignal): Promise<Conversation> {
  return apiFetchJson(`/api/llm/chat/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived: true }),
  });
}
