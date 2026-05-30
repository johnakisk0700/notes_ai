import type { ThreadDetail, ThreadMessageStatus } from '@shared';

// Query keys for the chat-thread cache (TanStack Query). `detail` is the poll-first source
// of truth for an open thread; `list` backs the sidebar.
export const threadKeys = {
  list: ['threads'] as const,
  detail: (id: string) => ['thread', id] as const,
};

// How often to poll a thread whose answer is still being generated server-side.
export const THREAD_POLL_MS = 2_000;

// The latest assistant message's (read-time-resolved) status, or undefined. Drives both the
// poll-while-streaming decision and the streaming/interrupted affordance. The server already
// applies the staleness rule, so a long-abandoned turn arrives here as 'error' and stops the
// poll on its own — the client never has to time the generation out itself.
export function latestAssistantStatus(detail: ThreadDetail | undefined): ThreadMessageStatus | undefined {
  const messages = detail?.messages;
  const last = messages && messages[messages.length - 1];
  return last && last.role === 'assistant' ? last.status : undefined;
}

// Mint a 24-hex, ObjectId-compatible id on the client so a new thread / assistant turn has a
// stable id the server adopts — letting the client poll + reconcile the answer even if the
// stream never delivers a single byte (the flaky-mobile case this whole feature is for).
export function mintObjectId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}
