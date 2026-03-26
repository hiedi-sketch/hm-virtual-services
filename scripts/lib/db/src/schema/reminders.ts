import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { invoicesTable } from "./invoices";

export type ReminderType = "due" | "day3" | "day5" | "day10";

export const invoiceRemindersTable = pgTable("invoice_reminders", {
  id: serial("id").primaryKey(),
  invoice_id: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["due", "day3", "day5", "day10"] }).notNull().$type<ReminderType>(),
  sent_at: timestamp("sent_at").notNull().defaultNow(),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export type InvoiceReminder = typeof invoiceRemindersTable.$inferSelect;
