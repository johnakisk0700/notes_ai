// POST /api/search-notes — the chat endpoint. Consumes an AI SDK UI message stream
// request (`{ messages }` as UIMessage[]) and streams back the agentic-RAG answer
// (text + tool-call parts). Thread bookkeeping (create + persist the user turn) happens
// here; the streamed answer + cost are handled in services/ai/agentic-rag.ts.
import type { Request, Response } from "express";
import type { UIMessage } from "ai";
import { recordUserTurn } from "services/chat-threads";
import { streamNotesChat } from "services/ai/agentic-rag";
import { isChatModelId, isReasoningEffort } from "@shared/ai/chatModels";

interface SearchNotesBody {
  messages?: UIMessage[];
  selectedUsers?: string[];
  now?: string;
  // Existing thread to append to. Omitted for a new chat's first message, in which case
  // the server creates one and streams its id back via a `data-thread` part.
  threadId?: string;
  // Chat model the user picked in the UI; validated against the allowlist below.
  model?: string;
  // Reasoning effort (low/medium/high); validated below.
  effort?: string;
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
  const { messages = [], selectedUsers, now, threadId, model: rawModel, effort: rawEffort }: SearchNotesBody = req.body;
  const model = isChatModelId(rawModel) ? rawModel : undefined;
  const effort = isReasoningEffort(rawEffort) ? rawEffort : undefined;
  const userId = req.user.id;
  const userIds = selectedUsers && selectedUsers.length ? [userId, ...selectedUsers] : [userId];

  const userText = lastUserText(messages);
  const userParts = lastUserPartsWithFile(messages);

  // Record the user's turn off the response path: the thread id is generated locally
  // (so a new chat's id streams back immediately) and the write runs in the background,
  // so a slow or down Mongo never delays the first token. `persisted` lets the assistant
  // turn wait for this write to land before appending to the thread. An image-only turn has
  // no text but still has parts, so fire on either — else it would skip thread creation.
  let activeThreadId = typeof threadId === "string" && threadId ? threadId : undefined;
  let newThreadId: string | undefined;
  let persisted: Promise<void> | undefined;
  if (userText || userParts) {
    const turn = recordUserTurn({ threadId: activeThreadId, userId, text: userText, parts: userParts });
    activeThreadId = turn.threadId;
    if (turn.isNew) newThreadId = turn.threadId;
    persisted = turn.persisted;
  }

  streamNotesChat({
    req,
    res,
    messages,
    userIds,
    userId,
    now: now ?? new Date().toISOString(),
    threadId: activeThreadId,
    newThreadId,
    persisted,
    model,
    effort,
  });
}

export default searchRelevantNotes;
