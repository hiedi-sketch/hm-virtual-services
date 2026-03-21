import { pgTable, serial, integer, real, text } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clientsTable.id),
  amount: real("amount").notNull(),
  status: text("status", { enum: ["paid", "unpaid"] }).notNull().default("unpaid"),
  due_date: text("due_date").notNull(),
  description: text("description"),
});

export type Invoice = typeof invoicesTable.$inferSelect;
