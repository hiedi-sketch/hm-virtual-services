import { pgTable, serial, real, text, boolean } from "drizzle-orm/pg-core";

export const servicesTable = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  service_type: text("service_type", { enum: ["Bookkeeping", "Virtual Assistant"] })
    .notNull()
    .default("Virtual Assistant"),
  price: real("price").notNull().default(0),
  billing_type: text("billing_type", { enum: ["Flat Rate", "Hourly"] })
    .notNull()
    .default("Flat Rate"),
  hourly_rate: real("hourly_rate"),
  budgeted_hours: real("budgeted_hours"),
  active: boolean("active").notNull().default(true),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Service = typeof servicesTable.$inferSelect;
