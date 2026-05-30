// API contract for AI chat threads persisted server-side.
// Backed by the Mongo `UserThread` / `Message` models; consumed by the
// frontend StreamChat + Threads contexts. Dates are ISO strings over the wire.

export type ThreadMessageRole = "user" | "assistant" | "system";

// Lifecycle of an assistant turn under the poll-first durability model. A turn is
// persisted as a placeholder ("streaming") at generation start, grows its text, then
// finalizes ("complete") or fails ("error"). "error" also covers a turn the server
// abandoned (worker crash / deadline): getThread serves a long-stuck "streaming"
// placeholder as effective "error" at read time. Absent on legacy/user messages.
export type ThreadMessageStatus = "streaming" | "complete" | "error";

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
  // Assistant-turn lifecycle (see ThreadMessageStatus). Drives the client's poll-while-
  // streaming + "interrupted" affordance. Absent ⇒ treat as a finished message.
  status?: ThreadMessageStatus;
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
