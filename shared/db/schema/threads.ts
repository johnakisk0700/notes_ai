import { pgTable, uuid, text, index, integer, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamps } from "../timestamps";

export const threadsTable = pgTable(
  "threads",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id").notNull(), // Clerk user ID (text, not uuid)
    title: text("title").notNull(),
    description: text("description"),
    messageCount: integer("message_count").default(0).notNull(),
    isArchived: boolean("is_archived").default(false).notNull(),
    isPinned: boolean("is_pinned").default(false).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    metadata: jsonb("metadata"), // For model settings, temperature, etc.
    ...timestamps,
  },
  table => [
    // Core indexes for chat app queries
    index("idx_threads_user_id").on(table.userId),
    index("idx_threads_user_last_message").on(table.userId, table.lastMessageAt.desc()),

    // For recent conversations
    index("idx_threads_user_created").on(table.userId, table.created_at.desc()),

    // For recently updated threads
    index("idx_threads_user_updated").on(table.userId, table.updated_at.desc()),

    // For active (non-archived) threads
    index("idx_threads_user_active").on(table.userId, table.isArchived, table.lastMessageAt.desc()),

    // For pinned threads
    index("idx_threads_user_pinned").on(table.userId, table.isPinned),

    // Global indexes
    index("idx_threads_created_at").on(table.created_at.desc()),
    index("idx_threads_last_message_at").on(table.lastMessageAt.desc()),

    // Text search for thread titles and descriptions
    index("idx_threads_search").using(
      "gin",
      sql`to_tsvector('english', ${table.title} || ' ' || coalesce(${table.description}, ''))`
    ),
  ]
);

export type Thread = typeof threadsTable.$inferSelect;
export type InsertThread = typeof threadsTable.$inferInsert;
