export interface Note {
  id: string; // UUID as string
  user_id: string; // UUID as string
  title: string; // text NOT NULL
  content: string; // text NOT NULL
  created_at: Date; // timestamp with time zone
  updated_at: Date; // timestamp with time zone
}

// Optional: Create a type for creating new notes (without auto-generated fields)
export interface CreateNoteInput {
  user_id: string;
  title: string;
  content: string;
}

// Optional: Create a type for updating notes
export interface UpdateNoteInput {
  content?: string;
  updated_at?: Date;
}
