// API contract for AI chat threads persisted server-side.
// Backed by the Mongo `UserThread` / `Message` models; consumed by the
// frontend StreamChat + Threads contexts. Dates are ISO strings over the wire.

export type ThreadMessageRole = "user" | "assistant" | "system";

export interface ThreadMessageDTO {
  id: string;
  role: ThreadMessageRole;
  content: string;
  timestamp: string;
}

export interface ThreadSummary {
  id: string;
  title: string;
  inserted_at: string;
}

export interface ThreadDetail extends ThreadSummary {
  messages: ThreadMessageDTO[];
}
