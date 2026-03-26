import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const fileUploadsTable = pgTable("file_uploads", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull(),
  uploaded_by_user_id: integer("uploaded_by_user_id"),
  original_name: text("original_name").notNull(),
  stored_name: text("stored_name").notNull(),
  mimetype: text("mimetype").notNull(),
  size_bytes: integer("size_bytes").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FileUpload = typeof fileUploadsTable.$inferSelect;
