import { pgTable, serial, integer, real, text } from "drizzle-orm/pg-core";

export const budgetAdjustmentsTable = pgTable("budget_adjustments", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull(),
  service_id: integer("service_id"),
  hours: real("hours").notNull(),
  reason: text("reason").notNull(),
  created_by: text("created_by"),
  created_at: text("created_at").notNull(),
});

export type BudgetAdjustment = typeof budgetAdjustmentsTable.$inferSelect;
