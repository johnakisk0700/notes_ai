import type { Document } from "mongoose";
import mongoose from "mongoose";
import type { Message } from "./Message.js";
import { MessageSchema } from "./Message.js";

export interface IUserThread extends Document {
  user_id: string;
  title: string;
  inserted_at: Date;
  messages: Message[];
}

// Define the schema
const UserThreadsSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    index: true,
  },
  title: {
    type: String,
  },
  inserted_at: {
    type: Date,
    default: Date.now,
    index: true,
  },
  messages: {
    type: [MessageSchema],
    default: [],
  },
});

// Supports the sidebar query: a user's threads ordered newest first.
UserThreadsSchema.index({ user_id: 1, inserted_at: -1 });

// Create the model with type
export const UserThread = mongoose.model<IUserThread>("UserThread", UserThreadsSchema);
