import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leadsTable = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  cell_phone: text("cell_phone"),
  business_name: text("business_name"),
  client_id: integer("client_id"),
  title: text("title"),
  management_level: text("management_level"),
  industry: text("industry"),
  city: text("city"),
  state: text("state"),
  linkedin_url: text("linkedin_url"),
  website: text("website"),
  facebook_url: text("facebook_url"),
  x_url: text("x_url"),
  company_size: text("company_size"),
  revenue: text("revenue"),
  founded_year: text("founded_year"),
  estimated_value: real("estimated_value"),
  status: text("status", { enum: ["new", "contacted", "proposal", "closed"] }).notNull().default("new"),
  lead_source: text("lead_source"),
  notes: text("notes"),
  follow_up_date: text("follow_up_date"),
  // HubSpot-style CRM fields
  stage: text("stage").default("new"),
  overall_status: text("overall_status").default("Untouched"),
  reply_type: text("reply_type"),
  priority: text("priority"),
  call_attempts: integer("call_attempts").default(0),
  last_call_date: text("last_call_date"),
  last_call_outcome: text("last_call_outcome"),
  next_follow_up_type: text("next_follow_up_type"),
  email_sequence_name: text("email_sequence_name"),
  email_stage: text("email_stage"),
  personalization_notes: text("personalization_notes"),
  lead_owner: text("lead_owner").default("HM Virtual Services"),
  created_at: timestamp("created_at").defaultNow(),
});

export const insertLeadSchema = createInsertSchema(leadsTable).omit({ id: true });
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leadsTable.$inferSelect;
