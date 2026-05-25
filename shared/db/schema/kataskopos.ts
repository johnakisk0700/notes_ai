import { pgTable, uuid, text, varchar, decimal, timestamp, index } from "drizzle-orm/pg-core";

export const kataskoposTable = pgTable(
  "kataskopos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(), // Clerk user ID (text, not uuid)
    model: varchar("model", { length: 100 }).notNull(),
    inputCost: decimal("input_cost", { precision: 19, scale: 10 }).notNull().default("0"),
    outputCost: decimal("output_cost", { precision: 19, scale: 10 }).notNull().default("0"),
    totalCost: decimal("total_cost", { precision: 19, scale: 10 }).notNull().default("0"),
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  table => [
    index("idx_kataskopos_user_id").on(table.userId),
    index("idx_kataskopos_timestamp").on(table.timestamp.desc()),
    index("idx_kataskopos_user_timestamp").on(table.userId, table.timestamp.desc()),
    index("idx_kataskopos_model").on(table.model),
  ]
);

export type Kataskopos = typeof kataskoposTable.$inferSelect;
export type InsertKataskopos = typeof kataskoposTable.$inferInsert;
