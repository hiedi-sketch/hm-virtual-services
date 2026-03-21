import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const timeEntriesTable = pgTable("time_entries", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull(),
  task_id: integer("task_id"),
  duration_minutes: integer("duration_minutes").notNull(),
  date: text("date").notNull(),
  started_at: text("started_at"),
  ended_at: text("ended_at"),
});

export const insertTimeEntrySchema = createInsertSchema(timeEntriesTable).omit({ id: true });
export type InsertTimeEntry = z.infer<typeof insertTimeEntrySchema>;
export type TimeEntry = typeof timeEntriesTable.$inferSelect;
