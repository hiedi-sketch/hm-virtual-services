import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  created_at: text("created_at").notNull(),
});

export type ApiKey = typeof apiKeysTable.$inferSelect;
