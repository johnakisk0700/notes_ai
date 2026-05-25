import { pgTable, uuid, text, index } from "drizzle-orm/pg-core";
import { timestamps } from "../timestamps";

// Wine names used for the editor "@mention" autocomplete.
// Previously sourced from a Supabase `wines` table; now owned by our Postgres.
export const winesTable = pgTable(
  "wines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull().unique(),
    ...timestamps,
  },
  (table) => [index("idx_wines_name").on(table.name)]
);

export type Wine = typeof winesTable.$inferSelect;
export type InsertWine = typeof winesTable.$inferInsert;
