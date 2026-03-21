import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const appNotificationsTable = pgTable("app_notifications", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").notNull(),
  type: text("type", {
    enum: ["overdue_task", "service_request", "invoice_created", "invoice_updated"],
  }).notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  entity_type: text("entity_type"), // 'task' | 'invoice' | 'service_request'
  entity_id: integer("entity_id"),
  is_read: boolean("is_read").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
