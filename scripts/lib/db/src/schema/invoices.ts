import { pgTable, serial, integer, real, text, json, timestamp, boolean } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";
import { leadsTable } from "./leads";

export type LineItem = {
  name: string;
  description?: string;
  qty: number;
  unit_price: number;
};

export const recurringInvoicesTable = pgTable("recurring_invoices", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clientsTable.id),
  frequency: text("frequency", { enum: ["weekly", "monthly", "custom"] }).notNull().default("monthly"),
  interval_days: integer("interval_days"),
  start_date: text("start_date").notNull(),
  end_date: text("end_date"),
  next_due_date: text("next_due_date").notNull(),
  description: text("description"),
  line_items: json("line_items").$type<LineItem[]>(),
  notes: text("notes"),
  thank_you_message: text("thank_you_message"),
  amount: real("amount").notNull().default(0),
  active: boolean("active").notNull().default(true),
  auto_send: boolean("auto_send").notNull().default(false),
  created_at: timestamp("created_at").defaultNow(),
});

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").references(() => clientsTable.id),
  lead_id: integer("lead_id").references(() => leadsTable.id),
  amount: real("amount").notNull(),
  type: text("type", { enum: ["invoice", "estimate"] }).notNull().default("invoice"),
  status: text("status", { enum: ["draft", "sent", "paid", "unpaid", "void", "accepted", "declined"] }).notNull().default("unpaid"),
  issue_date: text("issue_date"),
  due_date: text("due_date").notNull(),
  description: text("description"),
  line_items: json("line_items").$type<LineItem[]>(),
  notes: text("notes"),
  thank_you_message: text("thank_you_message"),
  paid_at: text("paid_at"),
  payment_method: text("payment_method"),
  payment_notes: text("payment_notes"),
  recurring_id: integer("recurring_id").references(() => recurringInvoicesTable.id),
  updated_at: timestamp("updated_at").defaultNow(),
});

export type Invoice = typeof invoicesTable.$inferSelect;
export type RecurringInvoice = typeof recurringInvoicesTable.$inferSelect;
