// Server-side persistence for AI chat threads, over the Mongo `UserThread`
// model (each thread embeds its messages). All writes are best-effort: the
// caller (the chat stream) must never fail a user's answer because Mongo is
// unavailable — see search-relevant-notes.ts. With buffering disabled
// (clients/mongoose_client.ts) a down Mongo makes writes reject instantly
// (callers no-op) and reads return empty here, instead of stalling ~10s.
import mongoose from "mongoose";
import type { ThreadDetail, ThreadMessageStatus, ThreadSummary, ThreadToolTransaction } from "@shared";
import { UserThread } from "model/mongo-db/UserThreads";
import { logger } from "utils/logger";
import { chatTrace } from "utils/chat-trace";
import {
  deleteChatImage,
  imageIdsFromMessages,
  listImageOwners,
  listUserImages,
  ORPHAN_IMAGE_MIN_AGE_MS,
} from "services/chat-images";

const TITLE_MAX = 50;

interface ToolTransactionPatch {
  toolCallId?: string;
  transaction?: ThreadToolTransaction;
  output?: unknown;
}

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
 * Record an incoming user turn WITHOUT blocking the response, and seed the assistant
 * placeholder for the turn it kicks off. The client supplies the thread id (so it can
 * poll for the answer before the first byte arrives, even on flaky mobile), and the
 * write runs in the background — Mongo stays off the chat's critical path so a slow or
 * down Mongo never delays the first token.
 *
 * Returns the active thread id, `serverMinted` (true only when the client gave no usable
 * id and we minted a fallback — then the caller echoes it via a `data-thread` part), and
 * `persisted`: the in-flight write the assistant turn awaits before finalizing. `persisted`
 * never rejects (the writer logs and swallows) — all thread persistence is best-effort.
 */
export function recordUserTurn(opts: {
  threadId?: string;
  userId: string;
  text: string;
  parts?: unknown[];
  // Client-minted id for the assistant turn this message starts. Persisted on an assistant
  // placeholder in the SAME write (no ordering race) and surfaced as that message's DTO id,
  // so the live stream and the polled/persisted state reconcile to one message.
  generationId: string;
  // Edit/retry only: keep just the first N persisted messages, then append this turn — so the
  // discarded tail can't resurface from the source of truth on the next poll. Omitted for a
  // normal append.
  truncateToCount?: number;
}): { threadId: string; serverMinted: boolean; persisted: Promise<void> } {
  const { userId, text, parts, generationId, truncateToCount } = opts;
  const provided = opts.threadId && mongoose.isValidObjectId(opts.threadId) ? opts.threadId : undefined;
  // We can't tell a new client-minted thread from an existing one by the id alone, so a normal
  // turn is an idempotent upsert. A fallback id is only minted for an old/edge client that sent none.
  const threadId = provided ?? String(new mongoose.Types.ObjectId());

  const persisted = upsertUserTurn(threadId, userId, text, parts, generationId, truncateToCount).catch(err =>
    logger.error("Thread persistence (user turn) failed:", err)
  );

  return { threadId, serverMinted: !provided, persisted };
}

/** The assistant placeholder subdoc written at generation start. */
function assistantPlaceholder(generationId: string, now: Date) {
  // status "streaming" + a fresh heartbeat; metadata/parts stay empty until finalize.
  return { role: "assistant", content: "", status: "streaming", generationId, updatedAt: Date.now(), timestamp: now };
}

// Create-or-append the user message + the assistant placeholder. Folding both into one write
// removes the placeholder-vs-user ordering race. Two shapes:
//  • normal: an idempotent upsert keyed on (threadId, generationId) — a new thread is created,
//    an existing one appended, and a replayed/duplicated POST is a no-op (the generationId guard
//    blocks a second append; a collision on the existing _id surfaces as E11000, swallowed here).
//  • edit/retry (truncateToCount set): an atomic pipeline update that keeps the first N messages
//    and concatenates the new turn — so the discarded tail is durably removed, not just hidden
//    client-side. Existing thread only (you can't edit a turn that isn't persisted yet); itself
//    idempotent on replay (re-slicing to the same N + re-appending yields the same array).
async function upsertUserTurn(
  threadId: string,
  userId: string,
  text: string,
  parts: unknown[] | undefined,
  generationId: string,
  truncateToCount?: number
): Promise<void> {
  const now = new Date();
  // Stamp an explicit _id: a raw $push of a plain object skips Mongoose subdoc _id generation,
  // leaving user turns without a stable id (getThread surfaces _id as the message DTO id; without
  // it the client keys collide). Reused by both the $push upsert and $concatArrays truncate paths.
  const userMessage = { _id: new mongoose.Types.ObjectId(), role: "user", content: text, parts, timestamp: now };
  const placeholder = assistantPlaceholder(generationId, now);

  if (typeof truncateToCount === "number" && Number.isInteger(truncateToCount) && truncateToCount >= 0) {
    const res = await UserThread.updateOne({ _id: threadId, user_id: userId }, [
      {
        $set: {
          messages: {
            $concatArrays: [{ $slice: [{ $ifNull: ["$messages", []] }, truncateToCount] }, [userMessage, placeholder]],
          },
        },
      },
    ]);
    chatTrace(generationId, "persist:truncate", {
      threadId,
      truncateToCount,
      matchedCount: res.matchedCount,
      modifiedCount: res.modifiedCount,
      fellThroughToUpsert: (res.matchedCount ?? 0) === 0,
    });
    // If the thread isn't persisted yet (the user edited/retried the very first turn before its
    // create write landed — likely on slow/flaky Mongo), the pipeline update matches nothing. Don't
    // drop the turn: fall through to the normal create-or-append upsert below, which inserts the
    // thread with just this turn (the truncated prefix of a non-existent thread is empty anyway).
    if ((res.matchedCount ?? 0) > 0) return;
  }

  try {
    const res = await UserThread.updateOne(
      { _id: threadId, user_id: userId, "messages.generationId": { $ne: generationId } },
      {
        $setOnInsert: { title: deriveThreadTitle(text) },
        $push: { messages: { $each: [userMessage, placeholder] } },
      },
      { upsert: true }
    );
    chatTrace(generationId, "persist:upsert", {
      threadId,
      matchedCount: res.matchedCount,
      modifiedCount: res.modifiedCount,
      upsertedId: res.upsertedId ? String(res.upsertedId) : undefined,
      branch: res.upsertedId ? "inserted" : (res.modifiedCount ?? 0) > 0 ? "appended" : "noop-or-replay",
    });
  } catch (err) {
    // A replayed POST whose generationId already exists fails the $ne guard, so the upsert tries
    // to insert and collides on the existing _id — that duplicate-key error IS the desired no-op.
    if ((err as { code?: number })?.code !== 11000) throw err;
    chatTrace(generationId, "persist:upsert-e11000", { threadId });
  }
}

// Throttled partial-text write for a streaming assistant placeholder — drives the
// poll-first live catch-up. Targets the placeholder by generationId AND status:"streaming"
// so a write that lands after finalize can't clobber the finished answer, and bumps the
// `updatedAt` heartbeat the staleness rule reads. Best-effort: a dropped partial just means
// the next poll shows slightly older text. NEVER awaited on the model's hot path (it would
// add backpressure to token streaming) — see agentic-rag.ts onChunk.
export async function updateAssistantPartial(
  threadId: string,
  userId: string,
  generationId: string,
  content: string
): Promise<void> {
  if (!mongoose.isValidObjectId(threadId)) return;
  const res = await UserThread.updateOne(
    { _id: threadId, user_id: userId },
    { $set: { "messages.$[m].content": content, "messages.$[m].updatedAt": Date.now() } },
    { arrayFilters: [{ "m.generationId": generationId, "m.status": "streaming" }] }
  );
  chatTrace(generationId, "persist:partial", {
    matchedCount: res.matchedCount,
    modifiedCount: res.modifiedCount,
    len: content.length,
  });
}

// Finalize the assistant placeholder: full text + parts + metadata + terminal status in
// ONE atomic $set, so a poll never sees status:"complete" without its badge metadata. This
// is the durable answer, so — unlike the partials — the caller awaits + best-effort logs it.
// If the placeholder is missing (its create was lost) but the thread exists, append the
// finished turn instead so the answer still persists.
export async function finalizeAssistant(
  threadId: string,
  userId: string,
  generationId: string,
  message: { content: string; parts: unknown[]; metadata: unknown; status: "complete" | "error" }
): Promise<void> {
  if (!mongoose.isValidObjectId(threadId)) return;
  const now = Date.now();
  const res = await UserThread.updateOne(
    { _id: threadId, user_id: userId },
    {
      $set: {
        "messages.$[m].content": message.content,
        "messages.$[m].parts": message.parts,
        "messages.$[m].metadata": message.metadata,
        "messages.$[m].status": message.status,
        "messages.$[m].updatedAt": now,
      },
    },
    { arrayFilters: [{ "m.generationId": generationId }] }
  );
  if ((res.modifiedCount ?? 0) > 0) {
    chatTrace(generationId, "persist:finalize", {
      branch: "in-place",
      matchedCount: res.matchedCount,
      modifiedCount: res.modifiedCount,
      status: message.status,
    });
    return; // placeholder updated — done
  }
  if ((res.matchedCount ?? 0) === 0) {
    chatTrace(generationId, "persist:finalize", { branch: "lost-no-thread", matchedCount: 0, status: message.status });
    return; // no such thread (Mongo down / never created) — best-effort lost
  }
  // Thread exists but the placeholder is gone — append the finished turn so it isn't lost.
  chatTrace(generationId, "persist:finalize", {
    branch: "append-fallback",
    matchedCount: res.matchedCount,
    modifiedCount: res.modifiedCount,
    status: message.status,
  });
  await UserThread.updateOne(
    { _id: threadId, user_id: userId },
    {
      $push: {
        messages: {
          role: "assistant",
          content: message.content,
          parts: message.parts,
          metadata: message.metadata,
          status: message.status,
          generationId,
          updatedAt: now,
          timestamp: new Date(),
        },
      },
    }
  );
}

// Mark a streaming placeholder errored WITHOUT touching its content/parts — used when the
// stream throws, so any partial text already shown survives while the client stops polling
// and renders an interrupted state. Guarded on status:"streaming" so it can't override a
// turn that already finalized.
export async function failAssistant(threadId: string, userId: string, generationId: string): Promise<void> {
  if (!mongoose.isValidObjectId(threadId)) return;
  const res = await UserThread.updateOne(
    { _id: threadId, user_id: userId },
    { $set: { "messages.$[m].status": "error", "messages.$[m].updatedAt": Date.now() } },
    { arrayFilters: [{ "m.generationId": generationId, "m.status": "streaming" }] }
  );
  chatTrace(generationId, "persist:fail", { matchedCount: res.matchedCount, modifiedCount: res.modifiedCount });
}

// Persist the user's decision on a note-action tool card (apply/discard/manual retry).
// The message-level log handles clicks that happen before the streaming turn finalizes;
// when the rendered tool part exists, we also denormalize the marker onto it. getThread
// overlays the log either way, and message-history.ts turns it into deterministic text.
export async function updateThreadToolTransaction(opts: {
  threadId: string;
  userId: string;
  assistantMessageId: string;
  toolCallId: string;
  transaction: ThreadToolTransaction;
  output?: unknown;
}): Promise<boolean> {
  const { threadId, userId, assistantMessageId, toolCallId, transaction, output } = opts;
  if (!mongoose.isValidObjectId(threadId)) return false;

  const messageFilter = { _id: threadId, user_id: userId, "messages.generationId": assistantMessageId };
  const patch = { toolCallId, transaction, ...(output !== undefined ? { output } : {}) };

  // Append the decision to the message's transaction log in ONE atomic update — no read-modify-
  // write window, so concurrent double-clicks can't lose-update each other. This works even while
  // the turn is still streaming and the finalized tool `parts` haven't been written yet. A rapid
  // re-click can append a second entry for the same toolCallId, but that's harmless: the read path
  // (applyToolTransactions) collapses entries to the LAST one per toolCallId, and a card is normally
  // decided once, so the array stays tiny.
  const logged = await UserThread.updateOne(
    messageFilter,
    {
      $push: { "messages.$[m].toolTransactions": patch },
      $set: { "messages.$[m].updatedAt": Date.now() },
    },
    { arrayFilters: [{ "m.generationId": assistantMessageId }] }
  );
  chatTrace(assistantMessageId, "persist:tooltx-log", {
    toolCallId,
    status: transaction?.status,
    hasOutput: output !== undefined,
    matchedCount: logged.matchedCount,
    modifiedCount: logged.modifiedCount,
  });
  if ((logged.matchedCount ?? 0) === 0) return false;

  const set: Record<string, unknown> = {
    "messages.$[m].parts.$[p].transaction": transaction,
  };
  if (output !== undefined) {
    set["messages.$[m].parts.$[p].output"] = output;
    set["messages.$[m].parts.$[p].state"] = "output-available";
  }

  // Best-effort denormalization for stored parts. If the part does not exist yet,
  // getThread overlays the transaction log when it hydrates the thread.
  const denorm = await UserThread.updateOne(
    {
      _id: threadId,
      user_id: userId,
      messages: {
        $elemMatch: {
          generationId: assistantMessageId,
          parts: { $elemMatch: { toolCallId } },
        },
      },
    },
    { $set: set },
    { arrayFilters: [{ "m.generationId": assistantMessageId }, { "p.toolCallId": toolCallId }] }
  );
  chatTrace(assistantMessageId, "persist:tooltx-denorm", {
    toolCallId,
    matchedCount: denorm.matchedCount,
    modifiedCount: denorm.modifiedCount,
    note: (denorm.matchedCount ?? 0) === 0 ? "part not stored yet — getThread overlays the log" : undefined,
  });

  return true;
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
    messages: (doc.messages ?? []).map((m: any, i: number) => ({
      // Assistant turns surface their generationId as id, so the live stream and the
      // polled/persisted state reconcile to the same message; user turns keep their Mongo id.
      // Legacy user messages written before subdocs got an explicit _id fall back to their
      // position, so the DTO id is never "undefined" (which would collide as a React key).
      id: m.generationId ? String(m.generationId) : m._id ? String(m._id) : `msg-${i}`,
      role: m.role,
      content: m.content ?? "",
      // Present for assistant turns (tool steps + text); absent for plain user text,
      // where the client falls back to rendering `content`.
      parts: applyToolTransactions(m.parts, m.toolTransactions),
      // Model + cost for the answer badge (assistant turns only).
      metadata: m.metadata ?? undefined,
      // Lifecycle for poll-first durability, with the read-time staleness rule applied.
      status: effectiveStatus(m),
      timestamp: toIso(m.timestamp),
    })),
  };
}

// A "streaming" placeholder whose heartbeat (updatedAt) is older than STALE_MS was abandoned —
// the generating worker crashed, so no finalize will ever run — and is served as "error". PURE:
// the read path never writes (concurrent GETs would race the real finalize). The threshold is set
// against the longest GAP between heartbeats in a HEALTHY turn — not the turn's total length: the
// heartbeat is bumped on every stream chunk incl. reasoning (agentic-rag.ts onChunk), so the only
// quiet stretch is a single tool's execution (web/embed/qdrant clients all ≤12s). 120s clears that
// with wide margin, so a long but live turn is never mis-aged — even one running up to the turn's
// absolute ceiling (TURN_MAX_MS, 180s), which exceeds STALE_MS yet keeps its heartbeat fresh.
export const STALE_MS = 120_000;

export function effectiveStatus(
  m: { status?: ThreadMessageStatus; updatedAt?: number; timestamp?: unknown },
  now: number = Date.now()
): ThreadMessageStatus | undefined {
  if (m.status !== "streaming") return m.status ?? undefined;
  const heartbeat = typeof m.updatedAt === "number" ? m.updatedAt : msFromDate(m.timestamp);
  return now - heartbeat > STALE_MS ? "error" : "streaming";
}

function msFromDate(value: unknown): number {
  return value instanceof Date ? value.getTime() : 0;
}

export function applyToolTransactions(parts: unknown, patches: unknown): unknown[] | undefined {
  if (!Array.isArray(parts) || parts.length === 0) return undefined;
  if (!Array.isArray(patches) || patches.length === 0) return parts;

  const byCallId = new Map(
    (patches as ToolTransactionPatch[])
      .filter(p => typeof p?.toolCallId === "string" && p.transaction)
      .map(p => [p.toolCallId as string, p])
  );
  if (byCallId.size === 0) return parts;

  return parts.map(part => {
    if (!part || typeof part !== "object") return part;
    const toolCallId = (part as { toolCallId?: unknown }).toolCallId;
    if (typeof toolCallId !== "string") return part;
    const patch = byCallId.get(toolCallId);
    if (!patch) return part;
    return {
      ...(part as Record<string, unknown>),
      transaction: patch.transaction,
      ...(patch.output !== undefined ? { output: patch.output, state: "output-available" } : {}),
    };
  });
}

export async function deleteThread(threadId: string, userId: string): Promise<boolean> {
  if (!mongoose.isValidObjectId(threadId)) return false;
  // Read the doc first so we can unlink its attached image files once it's gone
  // (best-effort — image cleanup must never block thread deletion).
  let imageIds: string[] = [];
  try {
    const doc = await UserThread.findOne({ _id: threadId, user_id: userId }).lean();
    if (doc) imageIds = imageIdsFromMessages((doc.messages ?? []) as Array<{ parts?: unknown }>);
  } catch (err) {
    logger.error("Thread image cleanup (read) failed:", err);
  }
  const res = await UserThread.deleteOne({ _id: threadId, user_id: userId });
  const deleted = (res.deletedCount ?? 0) > 0;
  if (deleted && imageIds.length) {
    await Promise.all(imageIds.map(id => deleteChatImage(userId, id)));
  }
  return deleted;
}

// Reclaim chat-image files that no thread references — covers images uploaded but never sent
// (abandoned compose) or whose send/persist failed, which thread-delete cleanup alone never reaps.
// FAIL-SAFE by construction: a file is deleted ONLY when it is both (a) older than the min age (so a
// just-staged, not-yet-sent image is never reaped) AND (b) absent from the user's referenced-id set,
// which is recomputed per user from live threads. Any per-user error skips that user WITHOUT
// deleting, so a transient DB/FS fault can never delete a referenced image. Best-effort + idempotent.
export async function pruneOrphanChatImages(now: number = Date.now()): Promise<{ scanned: number; deleted: number }> {
  if (!mongoReady()) return { scanned: 0, deleted: 0 };
  let scanned = 0;
  let deleted = 0;
  const owners = await listImageOwners();
  for (const userId of owners) {
    try {
      const files = await listUserImages(userId);
      scanned += files.length;
      const stale = files.filter(f => now - f.mtimeMs > ORPHAN_IMAGE_MIN_AGE_MS);
      if (stale.length === 0) continue;
      // Only hit Mongo when there's something potentially reclaimable. A read failure throws → the
      // catch skips this user, so we never delete without a confirmed reference set.
      const docs = await UserThread.find({ user_id: userId }).select("messages").lean();
      const referenced = new Set(
        docs.flatMap(d => imageIdsFromMessages((d.messages ?? []) as Array<{ parts?: unknown }>))
      );
      for (const file of stale) {
        if (referenced.has(file.id)) continue;
        await deleteChatImage(userId, file.id);
        deleted++;
      }
    } catch (err) {
      logger.error(`Orphan chat-image sweep skipped user ${userId} (kept all their files):`, err);
    }
  }
  if (deleted > 0) logger.info(`Orphan chat-image sweep removed ${deleted} unreferenced file(s) of ${scanned} scanned`);
  return { scanned, deleted };
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
