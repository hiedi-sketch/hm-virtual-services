import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  entity_type: text("entity_type").notNull(),
  entity_id: integer("entity_id").notNull(),
  action: text("action").notNull(),
  summary: text("summary").notNull(),
  user_id: integer("user_id"),
  user_name: text("user_name"),
  created_at: text("created_at").notNull(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
