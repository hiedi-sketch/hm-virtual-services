import { db } from "@workspace/db";
import { tasksTable, clientsTable } from "@workspace/db";
import { eq, isNotNull, and, or } from "drizzle-orm";
import { logger } from "./logger";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

function isDue(recurrence: string, lastGeneratedAt: string | null): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (recurrence === "weekdays" && !isWeekday(today)) return false;
  if (!lastGeneratedAt) return true;
  const last = new Date(lastGeneratedAt + "T00:00:00");
  const diffDays = Math.floor((today.getTime() - last.getTime()) / 86_400_000);
  if (recurrence === "daily") return diffDays >= 1;
  if (recurrence === "weekdays") return diffDays >= 1;
  if (recurrence === "weekly") return diffDays >= 7;
  if (recurrence === "monthly") return diffDays >= 30;
  if (recurrence === "annually") return diffDays >= 365;
  return false;
}

function nextDueDate(recurrence: string): string {
  const d = new Date();
  if (recurrence === "daily") {
    d.setDate(d.getDate() + 1);
  } else if (recurrence === "weekdays") {
    d.setDate(d.getDate() + 1);
    while (!isWeekday(d)) d.setDate(d.getDate() + 1);
  } else if (recurrence === "weekly") {
    d.setDate(d.getDate() + 7);
  } else if (recurrence === "monthly") {
    d.setMonth(d.getMonth() + 1);
  } else if (recurrence === "annually") {
    d.setFullYear(d.getFullYear() + 1);
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Spawn new pending instances for all completed recurring tasks that are due.
 * Safe to call multiple times per day — deduplication is enforced by:
 *   1. last_generated_at tracking on the completed source task
 *   2. Checking for an existing pending instance with same title/client/recurrence
 *
 * Returns the list of newly created tasks.
 */
export async function spawnRecurringTasks(): Promise<(typeof tasksTable.$inferSelect)[]> {
  const today = todayStr();

  const completedRecurring = await db
    .select()
    .from(tasksTable)
    .where(and(isNotNull(tasksTable.recurrence), eq(tasksTable.status, "complete")));

  const spawned: (typeof tasksTable.$inferSelect)[] = [];

  for (const task of completedRecurring) {
    if (!task.recurrence) continue;
    if (!isDue(task.recurrence, task.last_generated_at)) continue;

    // Mark the completed source task so it won't trigger again this cycle
    await db
      .update(tasksTable)
      .set({ last_generated_at: today })
      .where(eq(tasksTable.id, task.id));

    // Skip if a pending instance with the same title/client/recurrence already exists
    const existing = await db
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.title, task.title),
          eq(tasksTable.client_id, task.client_id),
          eq(tasksTable.recurrence, task.recurrence),
          eq(tasksTable.status, "pending"),
        ),
      )
      .limit(1);

    if (existing.length > 0) continue;

    const [newTask] = await db
      .insert(tasksTable)
      .values({
        title: task.title,
        description: task.description,
        client_id: task.client_id,
        assigned_to: task.assigned_to,
        status: "pending",
        due_date: nextDueDate(task.recurrence),
        recurrence: task.recurrence,
        last_generated_at: today,
      })
      .returning();

    spawned.push(newTask);
  }

  if (spawned.length > 0) {
    logger.info({ count: spawned.length }, "Recurring tasks spawned");
  }

  return spawned;
}
