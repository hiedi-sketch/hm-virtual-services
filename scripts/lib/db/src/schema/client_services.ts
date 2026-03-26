import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";
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
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type ClientService = typeof clientServicesTable.$inferSelect;
