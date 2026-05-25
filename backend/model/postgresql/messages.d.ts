export interface Message {
  id: string; // UUID as string
  chat_id: string; // UUID as string, foreign key to chats
  content: string; // text NOT NULL
  is_user: boolean; // boolean with default true
  created_at: Date; // timestamp with time zone
}

// Optional: Create a type for creating new messages (without auto-generated fields)
export interface CreateMessageInput {
  chat_id: string;
  content: string;
  is_user?: boolean; // Optional since it has a default value
}

// Optional: Create a type for updating messages
export interface UpdateMessageInput {
  content?: string;
  is_user?: boolean;
}