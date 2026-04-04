import { pgTable, serial, text, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  business_name: text("business_name"),
  estimated_value: real("estimated_value"),
  status: text("status", { enum: ["new", "contacted", "proposal", "closed"] }).notNull().default("new"),
  lead_source: text("lead_source"),
  notes: text("notes"),
  follow_up_date: text("follow_up_date"),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
