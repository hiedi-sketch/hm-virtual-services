import { pgTable, serial, text, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  estimated_value: real("estimated_value"),
  status: text("status", { enum: ["new", "contacted", "closed"] }).notNull().default("new"),
  lead_source: text("lead_source"),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
