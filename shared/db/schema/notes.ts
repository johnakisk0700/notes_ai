import { pgTable, uuid, text, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamps } from "../timestamps";

export const notesTable = pgTable(
  "notes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(), // Clerk user ID (text, not uuid)
    title: text("title"),
    content: text("content").notNull(),
    ...timestamps,
  },
  table => [
    // Index for finding notes by user_id (most common query pattern)
    index("idx_notes_user_id").on(table.userId),

    // Composite index for user-specific date-ordered queries (creation date)
    index("idx_notes_user_created_desc").on(table.userId, table.created_at.desc()),

    // Composite index for user-specific date-ordered queries (update date)
    index("idx_notes_user_updated_desc").on(table.userId, table.updated_at.desc()),

    // Composite index for user-specific title searches
    index("idx_notes_user_title").on(table.userId, table.title),

    // Full-text search index for both title and content searching
    // Queries should typically include a `WHERE user_id = ?` clause,
    // which will be efficient in combination with `idx_notes_user_id`.
    index("idx_notes_content_fts").using(
      "gin",
      sql`to_tsvector('english', coalesce(${table.title}, '') || ' ' || ${table.content})`
    ),
  ]
);

export type Note = typeof notesTable.$inferSelect;
export type InsertNote = typeof notesTable.$inferInsert;
