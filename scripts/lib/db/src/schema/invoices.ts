import { pgTable, serial, integer, real, text, json, timestamp } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export type LineItem = {
  name: string;
  description?: string;
  qty: number;
  unit_price: number;
};

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clientsTable.id),
  amount: real("amount").notNull(),
  status: text("status", { enum: ["paid", "unpaid", "void"] }).notNull().default("unpaid"),
  due_date: text("due_date").notNull(),
  description: text("description"),
  line_items: json("line_items").$type<LineItem[]>(),
  notes: text("notes"),
  thank_you_message: text("thank_you_message"),
  paid_at: text("paid_at"),
  payment_method: text("payment_method"),
  payment_notes: text("payment_notes"),
  updated_at: timestamp("updated_at").defaultNow(),
});

export type Invoice = typeof invoicesTable.$inferSelect;
