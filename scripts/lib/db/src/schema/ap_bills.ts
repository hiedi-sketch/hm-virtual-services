import { pgTable, serial, integer, real, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const apBillsTable = pgTable("ap_bills", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clientsTable.id),
  vendor: text("vendor").notNull(),
  invoice_number: text("invoice_number"),
  invoice_date: text("invoice_date"),
  due_date: text("due_date").notNull(),
  amount: real("amount").notNull(),
  category: text("category"),
  status: text("status", {
    enum: ["upcoming", "due_soon", "sent_for_approval", "approved", "snoozed", "rejected", "paid"],
  }).notNull().default("upcoming"),
  notes: text("notes"),
  attachment_url: text("attachment_url"),
  snooze_until: text("snooze_until"),
  client_response_note: text("client_response_note"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export const apClientSettingsTable = pgTable("ap_client_settings", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().unique().references(() => clientsTable.id),
  cycle_window_days: integer("cycle_window_days").notNull().default(14),
  payment_day: text("payment_day").notNull().default("tuesday"),
  approval_send_day: text("approval_send_day").notNull().default("wednesday"),
  snooze_auto: boolean("snooze_auto").notNull().default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

export type ApBill = typeof apBillsTable.$inferSelect;
export type ApClientSettings = typeof apClientSettingsTable.$inferSelect;
