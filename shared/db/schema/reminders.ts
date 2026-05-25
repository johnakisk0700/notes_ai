import { pgTable, uuid, text, timestamp, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";
import { timestamps } from "../timestamps"; // Assuming this provides createdAt and updatedAt
import { notesTable } from "./notes"; // For foreign key relationship

// Define the reminder_status enum based on your SQL
export const reminderStatusEnum = pgEnum("reminder_status", ["pending", "completed"]);

export const remindersTable = pgTable(
  "reminders",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notesTable.id, { onDelete: "cascade" }), // Foreign key to notes, ensures a reminder is tied to a note
    userId: text("user_id").notNull(), // Clerk user ID (text, not uuid)
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    status: reminderStatusEnum("status").default("pending").notNull(),
    ...timestamps, // Includes createdAt and updatedAt
  },
  table => [
    // Changed from object to array for index definitions
    // Unique constraint on noteId to enforce the one-to-one relationship (a note can have at most one reminder).
    // PostgreSQL automatically creates an index for a unique constraint.
    uniqueIndex("reminders_note_id_unique").on(table.noteId),

    // Index for general queries on user_id.
    index("idx_reminders_user_id").on(table.userId),

    // Partial index for efficiently querying all pending reminders, ordered by remind_at.
    // Useful for a global reminder processing system.
    index("idx_reminders_pending_remind_at")
      .on(table.remindAt)
      .where(sql`${table.status} = 'pending'`),

    // Partial index for efficiently querying pending reminders for a specific user, ordered by remind_at.
    // This is a common query pattern in multi-user systems.
    index("idx_reminders_user_pending")
      .on(table.userId, table.remindAt)
      .where(sql`${table.status} = 'pending'`),
  ]
);

export const remindersRelations = relations(remindersTable, ({ one }) => ({
  // Defines the inverse relationship back to the note.
  note: one(notesTable, {
    fields: [remindersTable.noteId],
    references: [notesTable.id],
  }),
}));

export type Reminder = typeof remindersTable.$inferSelect;
export type InsertReminder = typeof remindersTable.$inferInsert;
