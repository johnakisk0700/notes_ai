import { pgTable, text, index, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "../timestamps";
import {
  defaultUserSettings,
  UserSettings,
} from "@shared/interfaces/UserSettings";
import { tefteriTable } from "./tefteri";

// Define the enum for user roles
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

export const profileTable = pgTable(
  "profile",
  {
    id: text("id").primaryKey(), // Clerk user ID as primary key
    role: userRoleEnum("role").default("user").notNull(),
    email: text("email").notNull().unique(),
    first_name: text("first_name"),
    last_name: text("last_name"),
    settings: jsonb("settings")
      .$type<UserSettings>()
      .default(defaultUserSettings),
    ...timestamps,
  },
  (table) => [
    // Core indexes - only what you'll actually query
    index("idx_profile_role").on(table.role),
    index("idx_profile_created_at").on(table.created_at.desc()),
    // Email is unique, so it gets an automatic unique index
  ]
);

export const profileRelations = relations(profileTable, ({ one }) => ({
  tefteri: one(tefteriTable, {
    fields: [profileTable.id],
    references: [tefteriTable.userId], // You'll need to update this reference too
  }),
}));

export type Profile = typeof profileTable.$inferSelect;
export type InsertProfile = typeof profileTable.$inferInsert;
