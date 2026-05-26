// POST /api/search-notes — the chat endpoint. Consumes an AI SDK UI message stream
// request (`{ messages }` as UIMessage[]) and streams back the agentic-RAG answer
// (text + tool-call parts). Thread bookkeeping (create + persist the user turn) happens
// here; the streamed answer + cost are handled in services/ai/agentic-rag.ts.
import type { Request, Response } from "express";
import type { UIMessage } from "ai";
import { appendMessage, createThread, deriveThreadTitle } from "services/chat-threads";
import { streamNotesChat } from "services/ai/agentic-rag";
import { isChatModelId, isReasoningEffort } from "@shared/ai/chatModels";
import { logger } from "utils/logger";

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

async function searchRelevantNotes(req: Request, res: Response) {
  const { messages = [], selectedUsers, now, threadId, model: rawModel, effort: rawEffort }: SearchNotesBody = req.body;
  const model = isChatModelId(rawModel) ? rawModel : undefined;
  const effort = isReasoningEffort(rawEffort) ? rawEffort : undefined;
  const userId = req.user.id;
  const userIds = selectedUsers && selectedUsers.length ? [userId, ...selectedUsers] : [userId];

  const userText = lastUserText(messages);

  let activeThreadId = typeof threadId === "string" && threadId ? threadId : undefined;
  let newThreadId: string | undefined;
  try {
    if (!activeThreadId && userText) {
      const created = await createThread(userId, deriveThreadTitle(userText));
      activeThreadId = created.id;
      newThreadId = created.id;
    }
    if (activeThreadId && userText) {
      await appendMessage(activeThreadId, userId, { role: "user", content: userText });
    }
  } catch (err) {
    logger.error("Thread persistence (user message) failed; continuing:", err);
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
    model,
    effort,
  });
}

export default searchRelevantNotes;
