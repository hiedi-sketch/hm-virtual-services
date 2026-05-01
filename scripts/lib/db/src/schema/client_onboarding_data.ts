import { pgTable, serial, integer, text, timestamp, json } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const clientOnboardingDataTable = pgTable("client_onboarding_data", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  services: text("services").notNull(),
  industry: text("industry"),
  bk_software: text("bk_software"),
  bk_existing_accounts: text("bk_existing_accounts"),
  bk_fiscal_year_end: text("bk_fiscal_year_end"),
  bk_accounting_basis: text("bk_accounting_basis"),
  bk_business_bank_account: text("bk_business_bank_account"),
  bk_notes: text("bk_notes"),
  va_task_types: json("va_task_types").$type<string[]>(),
  va_tools: text("va_tools"),
  va_communication: text("va_communication"),
  va_availability: text("va_availability"),
  access_notes: text("access_notes"),
  goals: text("goals"),
  other_notes: text("other_notes"),
  submitted_at: timestamp("submitted_at").defaultNow(),
});
