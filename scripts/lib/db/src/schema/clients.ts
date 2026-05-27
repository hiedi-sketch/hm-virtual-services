import { pgTable, serial, text, real, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  contact_name: text("contact_name"),
  phone: text("phone"),
  address: text("address"),
  website: text("website"),
  timezone: text("timezone"),
  monthly_hour_budget: real("monthly_hour_budget").notNull(),
  monthly_fee: real("monthly_fee").notNull(),
  service_type: text("service_type", { enum: ["bookkeeping", "va", "hybrid"] }),
  /** Bookkeeping flat monthly fee component (null = not enrolled in bookkeeping) */
  bk_fee: real("bk_fee"),
  /** VA hourly billing rate in $/hr (null = not enrolled in VA) */
  va_hourly_rate: real("va_hourly_rate"),
  /** VA monthly hour cap; time over this limit triggers an alert (null = unlimited) */
  va_hour_limit: real("va_hour_limit"),
  /** Parent client id — set for sub-clients; null for top-level clients */
  parent_id: integer("parent_id"),
  /** Square Customer ID for card-on-file / autopay */
  square_customer_id: text("square_customer_id"),
  /** Square Card ID saved for autopay */
  square_card_id: text("square_card_id"),
  /** Whether autopay is enabled for this client */
  autopay_enabled: boolean("autopay_enabled").notNull().default(false),
  /** Whether this client is active; inactive clients are hidden from main lists */
  is_active: boolean("is_active").notNull().default(true),
  /** Date the client agreement was signed */
  signed_date: text("signed_date"),
  /** Client's recurring billing date (YYYY-MM-DD or MM-DD) */
  billing_date: text("billing_date"),
  /** Billing method: 'direct' = Direct Bill, 'time_etc' = Time Etc Billing */
  billing_method: text("billing_method"),
  /** Internal notes about the client */
  notes: text("notes"),
  /** QuickBooks Online Realm ID (company ID) from QBOA firm list */
  qbo_realm_id: text("qbo_realm_id"),
  /** Preferred task channel: dashboard | asana | clickup */
  preferred_channel: text("preferred_channel", { enum: ["dashboard", "asana", "clickup"] }),
  /** Channel config JSON: e.g. Asana project GID or ClickUp list ID */
  channel_config: text("channel_config"),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
