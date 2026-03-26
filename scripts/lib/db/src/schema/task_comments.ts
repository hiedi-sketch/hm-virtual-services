import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { tasksTable } from "./tasks";

export const taskCommentsTable = pgTable("task_comments", {
  id: serial("id").primaryKey(),
  task_id: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  user_id: integer("user_id"),
  author_name: text("author_name").notNull(),
  author_role: text("author_role", { enum: ["admin", "team_member", "client"] }).notNull(),
  comment: text("comment").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
});

export type TaskComment = typeof taskCommentsTable.$inferSelect;
export type InsertTaskComment = typeof taskCommentsTable.$inferInsert;
