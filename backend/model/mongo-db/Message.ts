import { Schema } from "mongoose";

export interface Message {
  _id?: string;
  role: "system" | "user" | "assistant";
  // Plain-text projection of the message (the user's text, or Lexi's final answer).
  content?: string;
  // Full AI SDK UIMessage parts (text + tool-call parts). Persisted verbatim so the
  // chat can re-render tool steps after a reload — see services/chat-threads.ts.
  parts?: unknown[];
  // User/client outcomes for note-action tool cards, keyed by toolCallId. Kept separate
  // from parts so Apply/Discard can be recorded even before the streaming turn finalizes.
  toolTransactions?: unknown[];
  // AI SDK message metadata (e.g. { model, costEur, totalTokens }) — drives the per-answer badge.
  metadata?: unknown;
  // Assistant-turn lifecycle for poll-first durability: a placeholder is written
  // "streaming" at generation start, grows its `content`, then finalizes "complete"/"error".
  // Correlated to the live stream by `generationId` (client-minted, also the assistant
  // message's DTO id). `updatedAt` is a heartbeat (bumped on every partial write) the
  // read path uses to age out an abandoned "streaming" placeholder. See chat-threads.ts.
  status?: "streaming" | "complete" | "error";
  generationId?: string;
  updatedAt?: number;
  timestamp: Date;
}

// Define the schema for conversation messages
export const MessageSchema = new Schema({
  role: {
    type: String,
    enum: ["system", "user", "assistant"],
    required: true,
  },
  content: {
    type: String,
  },
  // Mixed: the parts shape is owned by the AI SDK; we store it as-is and hand it
  // straight back to the client on hydration.
  parts: {
    type: [Schema.Types.Mixed],
    default: undefined,
  },
  // Mixed transaction patches for rendered tool parts (apply/discard/manual retry).
  toolTransactions: {
    type: [Schema.Types.Mixed],
    default: undefined,
  },
  // Mixed: AI SDK message metadata (model + cost), stored and returned as-is.
  metadata: {
    type: Schema.Types.Mixed,
    default: undefined,
  },
  // Assistant-turn lifecycle (poll-first durability). See the Message interface above.
  status: {
    type: String,
    enum: ["streaming", "complete", "error"],
    default: undefined,
  },
  // Client-minted id correlating the persisted placeholder to the live stream + DTO id.
  generationId: {
    type: String,
    default: undefined,
  },
  // Heartbeat for read-time staleness of a "streaming" placeholder (ms epoch).
  updatedAt: {
    type: Number,
    default: undefined,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
  },
});
