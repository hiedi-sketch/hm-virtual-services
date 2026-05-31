import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadActivitiesTable = pgTable("lead_activities", {
  id: serial("id").primaryKey(),
  lead_id: integer("lead_id").notNull(),
  type: text("type").notNull(),
  notes: text("notes"),
  outcome: text("outcome"),
  scheduled_date: text("scheduled_date"),
  follow_up_type: text("follow_up_type"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertLeadActivitySchema = createInsertSchema(leadActivitiesTable).omit({ id: true, created_at: true });
export type InsertLeadActivity = z.infer<typeof insertLeadActivitySchema>;
export type LeadActivity = typeof leadActivitiesTable.$inferSelect;
