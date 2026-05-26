import { Schema } from "mongoose";

export interface Message {
  _id?: string;
  role: "system" | "user" | "assistant";
  // Plain-text projection of the message (the user's text, or Lexi's final answer).
  content?: string;
  // Full AI SDK UIMessage parts (text + tool-call parts). Persisted verbatim so the
  // chat can re-render tool steps after a reload — see services/chat-threads.ts.
  parts?: unknown[];
  // AI SDK message metadata (e.g. { model, costEur, totalTokens }) — drives the per-answer badge.
  metadata?: unknown;
  timestamp: number;
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
  // Mixed: AI SDK message metadata (model + cost), stored and returned as-is.
  metadata: {
    type: Schema.Types.Mixed,
    default: undefined,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now(),
  },
});
