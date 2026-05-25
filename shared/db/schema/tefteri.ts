import { pgTable, text, integer, decimal, index } from "drizzle-orm/pg-core";
import { timestamps } from "../timestamps";

export const tefteriTable = pgTable(
  "tefteri",
  {
    userId: text("user_id").primaryKey(), // Changed from uuid to text
    totalCost: decimal("total_cost", { precision: 19, scale: 10 })
      .notNull()
      .default("0"),
    queryCount: integer("query_count").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("idx_tefteri_created_at").on(table.created_at.desc()),
    index("idx_tefteri_user_id_created_at").on(
      table.userId,
      table.created_at.desc()
    ),
  ]
);

export type Tefteri = typeof tefteriTable.$inferSelect;
export type InsertTefteri = typeof tefteriTable.$inferInsert;
