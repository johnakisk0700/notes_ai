import { pgTable, uuid, text, index } from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";
import { timestamps } from "../timestamps";
import { remindersTable } from "./reminders";

export const notesTable = pgTable(
  "notes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid("user_id").notNull(),
    title: text("title"),
    content: text("content").notNull(),
    ...timestamps,
  },
  (table) => [
    // Index for finding notes by user_id (most common query pattern)
    index("idx_notes_user_id").on(table.userId),

    // Composite index for user-specific date-ordered queries (creation date)
    index("idx_notes_user_created_desc").on(
      table.userId,
      table.created_at.desc()
    ),

    // Composite index for user-specific date-ordered queries (update date) - ADDED
    index("idx_notes_user_updated_desc").on(
      table.userId,
      table.updated_at.desc()
    ),

    // Composite index for user-specific title searches
    index("idx_notes_user_title").on(table.userId, table.title),

    // Full-text search index for both title and content searching
    // Queries should typically include a `WHERE user_id = ?` clause,
    // which will be efficient in combination with `idx_notes_user_id`.
    index("idx_notes_content_fts").using(
      "gin",
      sql`to_tsvector('english', coalesce(${table.title}, '') || ' ' || ${table.content})`
    ),

    // The following global indexes might be less critical if most queries are user-specific.
    // Consider their usage patterns before removing.
    // index("idx_notes_created_at").on(table.created_at), // Potentially covered by idx_notes_user_created_desc for user queries
    // index("idx_notes_updated_at").on(table.updated_at), // Potentially covered by idx_notes_user_updated_desc for user queries
    // index("idx_notes_title").on(table.title), // Potentially covered by idx_notes_user_title for user queries
  ]
);

export const notesRelations = relations(notesTable, ({ one }) => ({
  // Defines a one-to-one relationship. A note can have one reminder.
  reminder: one(remindersTable, {
    fields: [notesTable.id],
    references: [remindersTable.noteId],
  }),
}));

export type Note = typeof notesTable.$inferSelect;
export type InsertNote = typeof notesTable.$inferInsert;
