import { pgTable, serial, text, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  monthly_hour_budget: real("monthly_hour_budget").notNull(),
  monthly_fee: real("monthly_fee").notNull(),
  service_type: text("service_type", { enum: ["bookkeeping", "va", "hybrid"] }).notNull(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
