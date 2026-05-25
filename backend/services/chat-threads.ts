// Server-side persistence for AI chat threads, over the Mongo `UserThread`
// model (each thread embeds its messages). All writes are best-effort: the
// caller (the chat stream) must never fail a user's answer because Mongo is
// unavailable — see search-relevant-notes.ts.
import mongoose from "mongoose";
import type { ThreadDetail, ThreadMessageRole, ThreadSummary } from "@shared";
import { UserThread } from "model/mongo-db/UserThreads";

const TITLE_MAX = 50;

/** A thread's display title, derived from its first user message. */
export function deriveThreadTitle(firstMessage: string): string {
  const clean = firstMessage.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length <= TITLE_MAX
    ? clean
    : clean.slice(0, TITLE_MAX).trimEnd() + "…";
}

export async function createThread(
  userId: string,
  title: string
): Promise<{ id: string; title: string }> {
  const thread = await UserThread.create({
    user_id: userId,
    title,
    messages: [],
  });
  return { id: String(thread._id), title };
}

export async function appendMessage(
  threadId: string,
  userId: string,
  message: { role: ThreadMessageRole; content: string }
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
  const query = UserThread.find({ user_id: userId })
    .select("title inserted_at")
    .sort({ inserted_at: -1 });
  if (opts?.offset) query.skip(opts.offset);
  if (opts?.limit && opts.limit > 0) query.limit(opts.limit);

  const docs = await query.lean();
  return docs.map(toSummary);
}

export async function countThreads(userId: string): Promise<number> {
  return UserThread.countDocuments({ user_id: userId });
}

export async function getThread(
  threadId: string,
  userId: string
): Promise<ThreadDetail | null> {
  if (!mongoose.isValidObjectId(threadId)) return null;
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
      content: m.content,
      timestamp: toIso(m.timestamp),
    })),
  };
}

export async function deleteThread(
  threadId: string,
  userId: string
): Promise<boolean> {
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
