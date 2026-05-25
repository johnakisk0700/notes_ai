// Export the enum type first
export type ReminderStatus = "pending" | "completed";

export interface Reminder {
  id: string; // UUID as string
  note_id: string; // UUID as string, foreign key to notes (unique)
  user_id: string; // UUID as string
  remind_at: Date; // timestamp with time zone
  status: ReminderStatus; // reminder_status enum with default 'pending'
  created_at: Date; // timestamp with time zone
  updated_at: Date; // timestamp with time zone
}

// Optional: Create a type for creating new reminders (without auto-generated fields)
export interface CreateReminderInput {
  note_id: string;
  user_id: string;
  remind_at: Date;
  status?: ReminderStatus; // Optional since it has a default value
}

// Optional: Create a type for updating reminders
export interface UpdateReminderInput {
  remind_at?: Date;
  status?: ReminderStatus;
  updated_at?: Date;
}
