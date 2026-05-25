import { pgTable, uuid, text, boolean, index, foreignKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { timestamps } from "../timestamps";
import { threadsTable } from "./threads";

export const messagesTable = pgTable(
  "messages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    threadId: uuid("thread_id").notNull(),
    content: text("content").notNull(),
    isUser: boolean("is_user").notNull().default(true),
    role: text("role", { enum: ["user", "assistant", "system"] })
      .notNull()
      .default("user"), // More explicit than isUser
    ...timestamps,
  },
  table => [
    // Foreign key relationship to threads
    foreignKey({
      columns: [table.threadId],
      foreignColumns: [threadsTable.id],
      name: "fk_messages_thread_id",
    }).onDelete("cascade"),

    // Primary indexes for chat functionality
    index("idx_messages_thread_id").on(table.threadId),
    index("idx_messages_thread_created").on(table.threadId, table.created_at.desc()),

    // Index for filtering by message role
    index("idx_messages_role").on(table.role),

    // Composite index for thread-specific role queries
    index("idx_messages_thread_role").on(table.threadId, table.role),

    // Index for ordering by creation time globally
    index("idx_messages_created_at").on(table.created_at.desc()),

    // Text search index for content searches
    index("idx_messages_content_gin").using("gin", sql`to_tsvector('english', ${table.content})`),

    // Composite index for thread messages with role and time ordering
    index("idx_messages_thread_role_created").on(table.threadId, table.role, table.created_at.desc()),
  ]
);

export type Message = typeof messagesTable.$inferSelect;
export type InsertMessage = typeof messagesTable.$inferInsert;
