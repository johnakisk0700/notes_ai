import { pgTable, text, decimal, date, index, primaryKey } from "drizzle-orm/pg-core";
import { timestamps } from "../timestamps";

export const ecbConversionRatesTable = pgTable(
  "ecb_conversion_rates",
  {
    from: text("from").notNull(),
    to: text("to").notNull(),
    rate: decimal("rate", { precision: 19, scale: 10 }).notNull(),
    rateDate: date("rate_date").notNull(),
    ...timestamps,
  },
  table => ({
    pk: primaryKey({ columns: [table.from, table.to] }),
    fromToIdx: index("idx_ecb_rates_from_to").on(table.from, table.to),
    createdAtIdx: index("idx_ecb_rates_created_at").on(table.created_at.desc()),
  })
);

export type EcbConversionRate = typeof ecbConversionRatesTable.$inferSelect;
export type InsertEcbConversionRate = typeof ecbConversionRatesTable.$inferInsert;
