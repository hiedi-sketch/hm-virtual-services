import { pgTable, serial, text, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  parent_id: integer("parent_id"),
  subject: text("subject"),
  body: text("body").notNull(),
  sender_name: text("sender_name").notNull(),
  sender_role: text("sender_role", { enum: ["admin", "team_member", "client"] }).notNull(),
  is_read: boolean("is_read").notNull().default(false),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export type Message = typeof messagesTable.$inferSelect;
export type InsertMessage = typeof messagesTable.$inferInsert;
