// Server-side persistence for AI chat threads, over the Mongo `UserThread`
// model (each thread embeds its messages). All writes are best-effort: the
// caller (the chat stream) must never fail a user's answer because Mongo is
// unavailable — see search-relevant-notes.ts. With buffering disabled
// (clients/mongoose_client.ts) a down Mongo makes writes reject instantly
// (callers no-op) and reads return empty here, instead of stalling ~10s.
import mongoose from "mongoose";
import type { ThreadDetail, ThreadMessageRole, ThreadSummary } from "@shared";
import { UserThread } from "model/mongo-db/UserThreads";
import { logger } from "utils/logger";

const TITLE_MAX = 50;

/** Whether the Mongo connection is currently usable (1 = connected). */
function mongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

/** A thread's display title, derived from its first user message. */
export function deriveThreadTitle(firstMessage: string): string {
  const clean = firstMessage.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length <= TITLE_MAX ? clean : clean.slice(0, TITLE_MAX).trimEnd() + "…";
}

/**
 * Record an incoming user turn WITHOUT blocking the response. The thread id is
 * generated locally — so the caller can stream it back and route the client right
 * away — and the actual write runs in the background, taking Mongo off the chat's
 * critical path so a slow or down Mongo never delays the first token.
 *
 * Returns the active thread id, whether it was newly created, and `persisted`: the
 * in-flight write, which the assistant turn awaits before appending so its push
 * always targets an existing doc. `persisted` never rejects (the writer logs and
 * swallows) — all thread persistence is best-effort.
 */
export function recordUserTurn(opts: { threadId?: string; userId: string; text: string }): {
  threadId: string;
  isNew: boolean;
  persisted: Promise<void>;
} {
  const { userId, text } = opts;
  const existingId = opts.threadId && mongoose.isValidObjectId(opts.threadId) ? opts.threadId : undefined;

  if (existingId) {
    const persisted = appendMessage(existingId, userId, { role: "user", content: text }).catch(err =>
      logger.error("Thread persistence (user message) failed:", err)
    );
    return { threadId: existingId, isNew: false, persisted };
  }

  // New thread: fold the first user message into the create (one write, no
  // create→append race), keyed by the locally-generated id we hand back now.
  const id = new mongoose.Types.ObjectId();
  const persisted = UserThread.create({
    _id: id,
    user_id: userId,
    title: deriveThreadTitle(text),
    messages: [{ role: "user", content: text, timestamp: new Date() }],
  })
    .then(() => undefined)
    .catch(err => logger.error("Thread persistence (new thread) failed:", err));

  return { threadId: String(id), isNew: true, persisted };
}

export async function appendMessage(
  threadId: string,
  userId: string,
  // `parts` carries the full AI SDK UIMessage parts (tool calls + text) for assistant
  // turns; user turns pass `content` only. `metadata` holds the model + cost for the
  // answer badge. All stored so the thread round-trips.
  message: { role: ThreadMessageRole; content?: string; parts?: unknown[]; metadata?: unknown }
): Promise<void> {
  if (!mongoose.isValidObjectId(threadId)) return;
  await UserThread.updateOne(
    { _id: threadId, user_id: userId },
    { $push: { messages: { ...message, timestamp: new Date() } } }
  );
}

export async function listThreads(
  userId: string,
  opts?: { limit?: number; offset?: number }
): Promise<ThreadSummary[]> {
  if (!mongoReady()) return [];
  const query = UserThread.find({ user_id: userId }).select("title inserted_at").sort({ inserted_at: -1 });
  if (opts?.offset) query.skip(opts.offset);
  if (opts?.limit && opts.limit > 0) query.limit(opts.limit);

  const docs = await query.lean();
  return docs.map(toSummary);
}

export async function countThreads(userId: string): Promise<number> {
  if (!mongoReady()) return 0;
  return UserThread.countDocuments({ user_id: userId });
}

export async function getThread(threadId: string, userId: string): Promise<ThreadDetail | null> {
  if (!mongoReady() || !mongoose.isValidObjectId(threadId)) return null;
  const doc = await UserThread.findOne({
    _id: threadId,
    user_id: userId,
  }).lean();
  if (!doc) return null;

  return {
    ...toSummary(doc),
    messages: (doc.messages ?? []).map((m: any) => ({
      id: String(m._id),
      role: m.role,
      content: m.content ?? "",
      // Present for assistant turns (tool steps + text); absent for plain user text,
      // where the client falls back to rendering `content`.
      parts: Array.isArray(m.parts) && m.parts.length ? m.parts : undefined,
      // Model + cost for the answer badge (assistant turns only).
      metadata: m.metadata ?? undefined,
      timestamp: toIso(m.timestamp),
    })),
  };
}

export async function deleteThread(threadId: string, userId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(threadId)) return false;
  const res = await UserThread.deleteOne({ _id: threadId, user_id: userId });
  return (res.deletedCount ?? 0) > 0;
}

function toSummary(doc: any): ThreadSummary {
  return {
    id: String(doc._id),
    title: doc.title ?? "",
    inserted_at: toIso(doc.inserted_at),
  };
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date().toISOString();
}
