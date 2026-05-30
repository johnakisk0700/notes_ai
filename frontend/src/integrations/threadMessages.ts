import type { UIMessage } from 'ai';
import type { ThreadDetail, ThreadMessageDTO, ThreadMessageStatus, ThreadToolTransaction } from '@shared';

// Pure mapping between the persisted thread (DTO, the poll-first source of truth) and the AI
// SDK UI messages the chat renders. Kept out of the provider so the subtle bits — the
// generationId id-swap and the Mongo-down-safe optimistic write — are unit-testable.

const TITLE_MAX = 50;

/** Concatenated text of a message's text parts (ignores tool/reasoning parts). */
export function textOf(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join('');
}

/** A thread title derived from its first user message (mirrors the server's derivation). */
export function deriveThreadTitle(messages: UIMessage[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  const clean = (firstUser ? textOf(firstUser) : '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'New chat';
  return clean.length <= TITLE_MAX ? clean : clean.slice(0, TITLE_MAX).trimEnd() + '…';
}

// Map a persisted thread message (DTO) to a UI message for rendering. Assistant turns carry
// their full parts (tool cards + text); plain user text falls back to a single text part. The
// lifecycle `status` is tucked into metadata so ChatMessage can show a streaming/interrupted
// affordance for a turn caught via polling (no live stream to drive the thinking indicator).
export function toUIMessage(m: ThreadMessageDTO): UIMessage {
  const metadata =
    m.status !== undefined ? { ...((m.metadata as Record<string, unknown>) ?? {}), status: m.status } : m.metadata;
  return {
    id: m.id,
    role: m.role === 'user' ? 'user' : 'assistant',
    parts: (m.parts && m.parts.length ? m.parts : [{ type: 'text', text: m.content }]) as UIMessage['parts'],
    metadata,
  } as UIMessage;
}

// Project the live useChat conversation into a ThreadDetail for an optimistic cache write on
// finish — so the swap from the live overlay to RQ is flicker-free and the answer survives even
// if the reconcile refetch comes back empty (Mongo down). The just-finished assistant turn
// adopts the client `generationId` (matching what the server persisted) + a terminal status;
// everything else keeps its current id. Title/inserted_at are carried from `previous` if known.
export function optimisticThread(
  threadId: string,
  messages: UIMessage[],
  finishedId: string,
  generationId: string,
  status: ThreadMessageStatus,
  previous: ThreadDetail | undefined
): ThreadDetail {
  const nowIso = new Date().toISOString();
  return {
    id: threadId,
    title: previous?.title ?? deriveThreadTitle(messages),
    inserted_at: previous?.inserted_at ?? nowIso,
    messages: messages.map(m => {
      const isFinished = m.role === 'assistant' && m.id === finishedId;
      return {
        id: isFinished ? generationId : m.id,
        role: m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'assistant',
        content: textOf(m),
        parts: m.parts as unknown[],
        metadata: m.metadata,
        status: isFinished ? status : undefined,
        timestamp: nowIso,
      };
    }),
  };
}

// Prevent a poll that read the placeholder BEFORE the server's finalize committed from regressing
// an already-finalized latest turn back to "streaming" — which would flicker the finished answer
// back to the thinking indicator (the optimistic onFinish write racing an in-flight refetchInterval
// poll). Only the exact terminal→streaming downgrade of the SAME latest assistant turn (matched by
// id = generationId) is blocked; every other update — forward streaming→complete, a genuinely new
// turn, a disconnect still streaming — passes straight through. Applied in the thread queryFn.
export function mergeThreadNoRegress(cached: ThreadDetail | undefined, fresh: ThreadDetail): ThreadDetail {
  if (!cached) return fresh;
  const cachedLast = cached.messages[cached.messages.length - 1];
  const freshLast = fresh.messages[fresh.messages.length - 1];
  const cachedTerminal = cachedLast?.status === 'complete' || cachedLast?.status === 'error';
  if (
    cachedLast &&
    freshLast &&
    cachedLast.role === 'assistant' &&
    cachedLast.id === freshLast.id &&
    cachedTerminal &&
    freshLast.status === 'streaming'
  ) {
    return { ...fresh, messages: [...fresh.messages.slice(0, -1), cachedLast] };
  }
  return fresh;
}

export function patchToolTransaction(
  detail: ThreadDetail | undefined,
  messageId: string,
  toolCallId: string,
  transaction: ThreadToolTransaction,
  output?: unknown
): ThreadDetail | undefined {
  if (!detail) return detail;
  let changed = false;
  const messages = detail.messages.map(message => {
    if (message.id !== messageId || !Array.isArray(message.parts)) return message;
    const parts = message.parts.map(part => {
      if (!part || typeof part !== 'object' || (part as { toolCallId?: string }).toolCallId !== toolCallId) {
        return part;
      }
      changed = true;
      return {
        ...(part as Record<string, unknown>),
        transaction,
        ...(output !== undefined ? { output, state: 'output-available' } : {}),
      };
    });
    return { ...message, parts };
  });

  return changed ? { ...detail, messages } : detail;
}
