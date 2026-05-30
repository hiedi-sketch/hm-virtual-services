import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const clientChecklistItemsTable = pgTable("client_checklist_items", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull(),
  stage: text("stage").notNull(),
  task: text("task").notNull(),
  who: text("who").notNull().default("Hiedi"),
  status: text("status").notNull().default("Not Started"),
  notes: text("notes"),
  due_date: text("due_date"),
  sort_order: integer("sort_order").notNull().default(0),
  is_custom: boolean("is_custom").notNull().default(false),
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});
