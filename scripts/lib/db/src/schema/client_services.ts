import { pgTable, serial, integer, text, real } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";
import { servicesTable } from "./services";

export const clientServicesTable = pgTable("client_services", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id")
    .notNull()
    .references(() => clientsTable.id, { onDelete: "cascade" }),
  service_id: integer("service_id")
    .notNull()
    .references(() => servicesTable.id, { onDelete: "cascade" }),
  custom_price: real("custom_price"),
  custom_hourly_rate: real("custom_hourly_rate"),
  custom_budgeted_hours: real("custom_budgeted_hours"),
  monthly_hours_reset_day: integer("monthly_hours_reset_day"),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type ClientService = typeof clientServicesTable.$inferSelect;
