// API contract for AI chat threads persisted server-side.
// Backed by the Mongo `UserThread` / `Message` models; consumed by the
// frontend StreamChat + Threads contexts. Dates are ISO strings over the wire.

export type ThreadMessageRole = "user" | "assistant" | "system";

export interface ThreadMessageDTO {
  id: string;
  role: ThreadMessageRole;
  content: string;
  // Full AI SDK UIMessage parts (text + tool-call parts) for assistant turns, so the
  // client can re-render tool steps on reload. Absent for plain user text. Typed loose
  // here to avoid coupling the shared package to the `ai` SDK — the client casts it.
  parts?: unknown[];
  // AI SDK message metadata (e.g. { model, costEur, totalTokens }) — drives the answer badge.
  metadata?: unknown;
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
