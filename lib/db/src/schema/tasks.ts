import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  client_id: integer("client_id").notNull(),
  assigned_to: text("assigned_to"),
  status: text("status", { enum: ["pending", "complete"] }).notNull().default("pending"),
  due_date: text("due_date"),
  recurrence: text("recurrence", { enum: ["daily", "weekly", "monthly"] }),
  last_generated_at: text("last_generated_at"),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({ id: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;

export const subtasksTable = pgTable("subtasks", {
  id: serial("id").primaryKey(),
  task_id: integer("task_id").notNull().references(() => tasksTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  done: boolean("done").notNull().default(false),
});

export const insertSubtaskSchema = createInsertSchema(subtasksTable).omit({ id: true });
export type InsertSubtask = z.infer<typeof insertSubtaskSchema>;
export type Subtask = typeof subtasksTable.$inferSelect;
