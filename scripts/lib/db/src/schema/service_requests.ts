import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const serviceRequestsTable = pgTable("service_requests", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull(),
  type: text("type", { enum: ["new_service", "upgrade_package", "consultation", "other"] }).notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status", { enum: ["pending", "in_review", "resolved"] }).notNull().default("pending"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
