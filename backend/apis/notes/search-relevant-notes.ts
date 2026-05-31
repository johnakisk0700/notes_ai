// POST /api/search-notes — the chat endpoint. Consumes an AI SDK UI message stream
// request (`{ messages }` as UIMessage[]) and streams back the agentic-RAG answer
// (text + tool-call parts). Thread bookkeeping (create + persist the user turn) happens
// here; the streamed answer + cost are handled in services/ai/agentic-rag.ts.
import type { Request, Response } from "express";
import type { UIMessage } from "ai";
import mongoose from "mongoose";
import { recordUserTurn } from "services/chat-threads";
import { streamNotesChat } from "services/ai/agentic-rag";
import { isChatModelId, isReasoningEffort } from "@shared/ai/chatModels";
import { chatTrace } from "utils/chat-trace";

interface SearchNotesBody {
  messages?: UIMessage[];
  selectedUsers?: string[];
  now?: string;
  // The thread to write to — client-minted for a new chat (so it can poll for the answer
  // before the first byte arrives), or an existing thread id. Omitted only by an old client,
  // in which case the server mints one and echoes it via a `data-thread` part.
  threadId?: string;
  // Client-minted id (24-hex) for the assistant turn this message starts. Correlates the
  // live stream to the persisted placeholder so the answer survives a dropped connection.
  // Server mints a fallback when missing/invalid.
  generationId?: string;
  // Edit/retry only: keep just the first N persisted messages before appending this turn, so the
  // discarded tail is durably removed (not merely hidden client-side). Validated as a non-negative
  // integer below; ignored otherwise.
  truncateToCount?: number;
  // Chat model the user picked in the UI; validated against the allowlist below.
  model?: string;
  // Reasoning effort (minimal/low/medium/high); validated below, then clamped per-model.
  effort?: string;
}

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

// `now` is the client's LOCAL-offset ISO timestamp, interpolated into the system prompt so the
// model knows the user's "today". Validate it's a short, parseable date (kills the unbounded /
// newline / prompt-injection vector of an arbitrary string) but keep the client's local-offset
// string verbatim — re-serializing to UTC would shift "today" across midnight for UTC+2/+3 users.
// Fall back to the server's UTC now when missing or invalid.
function validatedNow(value: unknown): string {
  if (typeof value === "string" && value.length <= 40 && !Number.isNaN(new Date(value).getTime())) {
    return value;
  }
  return new Date().toISOString();
}

/** The text of the latest user message in an AI SDK UI message list. */
function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") {
      return m.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map(p => p.text)
        .join(" ")
        .trim();
    }
  }
  return "";
}

/** The latest user message's full parts, but only when it carries a non-text part (e.g.
 *  an image reference) worth persisting; text-only turns keep storing just `content`. */
function lastUserPartsWithFile(messages: UIMessage[]): UIMessage["parts"] | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "user") {
      return m.parts.some(p => p.type === "file") ? m.parts : undefined;
    }
  }
  return undefined;
}

async function searchRelevantNotes(req: Request, res: Response) {
  const {
    messages = [],
    selectedUsers,
    now,
    threadId,
    generationId: rawGenerationId,
    truncateToCount: rawTruncate,
    model: rawModel,
    effort: rawEffort,
  }: SearchNotesBody = req.body;
  const model = isChatModelId(rawModel) ? rawModel : undefined;
  const effort = isReasoningEffort(rawEffort) ? rawEffort : undefined;
  const userId = req.user.id;
  // SECURITY: reading OTHER users' notes via `selectedUsers` is an admin-only affordance. The UI
  // only shows the picker to admins, but that's not a trust boundary — gate it on the server so a
  // non-admin can't POST a victim's id and have the retrieval tools surface their notes. The self
  // id always comes from the verified session (req.user.id), never the request body.
  const extraUsers = req.user.isAdmin && Array.isArray(selectedUsers) ? selectedUsers : [];
  const userIds = extraUsers.length ? [userId, ...extraUsers] : [userId];

  // The assistant turn's id, correlating the live stream to its persisted placeholder.
  // Client-minted so it can poll before the first byte; server mints a fallback otherwise.
  const generationId =
    typeof rawGenerationId === "string" && OBJECT_ID_RE.test(rawGenerationId)
      ? rawGenerationId
      : String(new mongoose.Types.ObjectId());

  // Edit/retry truncation point — only honor a sane non-negative integer.
  const truncateToCount =
    typeof rawTruncate === "number" && Number.isInteger(rawTruncate) && rawTruncate >= 0 ? rawTruncate : undefined;

  const userText = lastUserText(messages);
  const userParts = lastUserPartsWithFile(messages);

  // Record the user's turn + the assistant placeholder off the response path: the thread id
  // is client-supplied (so the client can poll right away) and the write runs in the
  // background, so a slow or down Mongo never delays the first token. `persisted` lets the
  // finalize wait for this write to land. An image-only turn has no text but still has parts,
  // so fire on either — else it would skip thread/placeholder creation.
  let activeThreadId = typeof threadId === "string" && threadId ? threadId : undefined;
  let newThreadId: string | undefined;
  let persisted: Promise<void> | undefined;
  if (userText || userParts) {
    const turn = recordUserTurn({
      threadId: activeThreadId,
      userId,
      text: userText,
      parts: userParts,
      generationId,
      truncateToCount,
    });
    activeThreadId = turn.threadId;
    if (turn.serverMinted) newThreadId = turn.threadId;
    persisted = turn.persisted;
  }

  chatTrace(generationId, "request", {
    providedThreadId: threadId,
    activeThreadId,
    newThreadId,
    userId,
    userIds,
    isAdmin: req.user.isAdmin,
    selectedUsers,
    extraUsersApplied: extraUsers,
    model,
    effort,
    truncateToCount,
    messageCount: messages.length,
    userTextLen: userText.length,
    hasFileParts: Boolean(userParts),
  });

  streamNotesChat({
    req,
    res,
    messages,
    userIds,
    userId,
    now: validatedNow(now),
    threadId: activeThreadId,
    newThreadId,
    generationId,
    persisted,
    model,
    effort,
  });
}

export default searchRelevantNotes;
