import { pgTable, serial, real, text, boolean } from "drizzle-orm/pg-core";

export const servicesTable = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: real("price").notNull(),
  billing_type: text("billing_type", { enum: ["one_time", "recurring"] })
    .notNull()
    .default("one_time"),
  active: boolean("active").notNull().default(true),
  created_at: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type Service = typeof servicesTable.$inferSelect;
