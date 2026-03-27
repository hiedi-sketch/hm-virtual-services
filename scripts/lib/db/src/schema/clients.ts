import { pgTable, serial, text, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  contact_name: text("contact_name"),
  phone: text("phone"),
  website: text("website"),
  monthly_hour_budget: real("monthly_hour_budget").notNull(),
  monthly_fee: real("monthly_fee").notNull(),
  service_type: text("service_type", { enum: ["bookkeeping", "va", "hybrid"] }).notNull(),
  /** Bookkeeping flat monthly fee component (null = not enrolled in bookkeeping) */
  bk_fee: real("bk_fee"),
  /** VA hourly billing rate in $/hr (null = not enrolled in VA) */
  va_hourly_rate: real("va_hourly_rate"),
  /** VA monthly hour cap; time over this limit triggers an alert (null = unlimited) */
  va_hour_limit: real("va_hour_limit"),
  /** Parent client id — set for sub-clients; null for top-level clients */
  parent_id: integer("parent_id"),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
