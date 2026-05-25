import { pgTable, uuid, text, index } from "drizzle-orm/pg-core";
import { timestamps } from "../timestamps";

// Customer names used for the editor "@mention" autocomplete.
// Previously sourced from a Supabase `customers` table; now owned by our Postgres.
export const customersTable = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    title: text("title"),
    ...timestamps,
  },
  (table) => [index("idx_customers_name").on(table.name)]
);

export type Customer = typeof customersTable.$inferSelect;
export type InsertCustomer = typeof customersTable.$inferInsert;
