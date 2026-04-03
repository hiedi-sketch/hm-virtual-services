import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const appSettingsTable = pgTable("app_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
});

export type AppSetting = typeof appSettingsTable.$inferSelect;
