import { pgTable, serial, text, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tasksTable = pgTable("tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  client_id: integer("client_id"),
  assigned_to: text("assigned_to"),
  status: text("status", { enum: ["Not Started", "Pending", "Confirmed", "In Progress", "Completed"] }).notNull().default("Not Started"),
  due_date: text("due_date"),
  completed_date: text("completed_date"),
  recurrence: text("recurrence"),
  last_generated_at: text("last_generated_at"),
  service_type: text("service_type", { enum: ["Bookkeeping", "Virtual Assistant"] }),
  asana_gid: text("asana_gid"),
  clickup_task_id: text("clickup_task_id"),
  tags: text("tags"),
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
