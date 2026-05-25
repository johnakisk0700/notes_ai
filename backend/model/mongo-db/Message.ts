import { Schema } from "mongoose";

export interface Message {
  _id?: string;
  role: "system" | "user" | "assistant";
  content: string;
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
    required: true,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now(),
  },
});
