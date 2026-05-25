export interface Chat {
  id: string; // UUID as string
  user_id: string; // UUID as string
  category_id: string | null; // UUID as string, nullable
  title: string;
  created_at: Date; // timestamp with time zone
  updated_at: Date; // timestamp with time zone
}

// Optional: Create a type for creating new chats (without auto-generated fields)
export interface CreateChatInput {
  user_id: string;
  category_id?: string | null;
  title: string;
}

// Optional: Create a type for updating chats
export interface UpdateChatInput {
  category_id?: string | null;
  title?: string;
  updated_at?: Date;
}
