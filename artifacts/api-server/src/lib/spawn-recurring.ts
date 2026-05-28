import { db } from "@workspace/db";
import { tasksTable, clientsTable } from "@workspace/db";
import { eq, isNotNull, and, or } from "drizzle-orm";
import { logger } from "./logger";

/** Returns today's date as "YYYY-MM-DD" in UTC — immune to server TZ settings. */
function todayUTCStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

/** Parse a YYYY-MM-DD string as UTC midnight (no timezone shift). */
function parseDateUTC(dateStr: string): number {
  return Date.parse(dateStr + "T00:00:00Z");
}

function isWeekdayUTC(ms: number): boolean {
  const day = new Date(ms).getUTCDay();
  return day >= 1 && day <= 5;
}

const DAY_MAP: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/**
 * Parse the day list out of a weekly_ recurrence string.
 * Handles both single-day ("weekly_mon") and multi-day ("weekly_mon,wed,fri").
 */
function parseWeeklyDays(recurrence: string): number[] {
  const part = recurrence.replace("weekly_", "");
  return part
    .split(",")
    .map((s) => DAY_MAP[s.trim()])
    .filter((d): d is number => d !== undefined);
}

function isDue(recurrence: string, lastGeneratedAt: string | null): boolean {
  const todayStr = todayUTCStr();
  const todayMs = parseDateUTC(todayStr);

  if (recurrence === "weekdays" && !isWeekdayUTC(todayMs)) return false;
  if (!lastGeneratedAt) return true;

  const lastMs = parseDateUTC(lastGeneratedAt);
  const diffDays = Math.floor((todayMs - lastMs) / 86_400_000);

  if (recurrence === "daily") return diffDays >= 1;
  if (recurrence === "weekdays") return diffDays >= 1;
  // Multi-day weekly (e.g. weekly_mon,wed,fri): can recur multiple times per week
  if (recurrence.startsWith("weekly_") && recurrence.includes(",")) return diffDays >= 1;
  if (recurrence === "weekly" || recurrence.startsWith("weekly_")) return diffDays >= 7;
  if (recurrence === "monthly" || recurrence.startsWith("monthly_")) return diffDays >= 28;
  if (recurrence === "annually") return diffDays >= 365;
  return false;
}

/**
 * Compute the next due date (YYYY-MM-DD) based on the recurrence pattern,
 * starting from `fromDateStr` (the completion date). Defaults to today if
 * not provided so the cron path still works unchanged.
 */
function nextDueDate(recurrence: string, fromDateStr?: string): string {
  const baseStr = fromDateStr ?? todayUTCStr();
  const [y, m, d] = baseStr.split("-").map(Number) as [number, number, number];

  const toStr = (date: Date) => date.toISOString().split("T")[0]!;
  const MS = 86_400_000;

  // Weekly with specific day(s) of week — handles both "weekly_mon" and "weekly_mon,wed,fri"
  if (recurrence.startsWith("weekly_")) {
    const targets = parseWeeklyDays(recurrence);
    if (targets.length > 0) {
      // Search from the day after the completion date, up to 14 days out
      let next = new Date(Date.UTC(y, m - 1, d + 1));
      for (let i = 0; i < 14; i++) {
        if (targets.includes(next.getUTCDay())) return toStr(next);
        next = new Date(next.getTime() + MS);
      }
    }
  }

  // Monthly with specific day of month
  if (recurrence.startsWith("monthly_")) {
    const part = recurrence.replace("monthly_", "");
    if (part === "last") {
      return toStr(new Date(Date.UTC(y, m + 1, 0)));
    }
    const dom = parseInt(part);
    const thisMonthTarget = new Date(Date.UTC(y, m - 1, dom));
    if (thisMonthTarget.getTime() > parseDateUTC(baseStr)) {
      return toStr(thisMonthTarget);
    }
    return toStr(new Date(Date.UTC(y, m, dom)));
  }

  if (recurrence === "daily") {
    return toStr(new Date(Date.UTC(y, m - 1, d + 1)));
  }
  if (recurrence === "weekdays") {
    let next = new Date(Date.UTC(y, m - 1, d + 1));
    while (!isWeekdayUTC(next.getTime())) {
      next = new Date(next.getTime() + MS);
    }
    return toStr(next);
  }
  if (recurrence === "weekly") {
    return toStr(new Date(Date.UTC(y, m - 1, d + 7)));
  }
  if (recurrence === "monthly") {
    return toStr(new Date(Date.UTC(y, m, d)));
  }
  if (recurrence === "annually") {
    return toStr(new Date(Date.UTC(y + 1, m - 1, d)));
  }
  return baseStr;
}

/**
 * Immediately spawn the next pending instance for a single task that was just
 * marked complete. Called from the PATCH /tasks/:id handler so the new task
 * appears right away instead of waiting for the midnight cron.
 *
 * Uses the task's completed_date as the base for next-due calculation so the
 * schedule stays anchored to the actual completion day, not the server clock.
 *
 * Skips creation if a pending/not-started instance with the same
 * title + client + recurrence already exists (idempotent).
 */
export async function spawnOnCompletion(
  task: typeof tasksTable.$inferSelect,
): Promise<typeof tasksTable.$inferSelect | null> {
  if (!task.recurrence) return null;

  const today = todayUTCStr();
  // Anchor next due date to the actual completion date (falls back to today)
  const fromDate = task.completed_date ?? today;

  // Dedup: don't create a second pending copy
  const existing = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.title, task.title),
        eq(tasksTable.client_id, task.client_id!),
        eq(tasksTable.recurrence, task.recurrence),
        or(eq(tasksTable.status, "Not Started"), eq(tasksTable.status, "Pending")),
      ),
    )
    .limit(1);

  if (existing.length > 0) return null;

  const [newTask] = await db
    .insert(tasksTable)
    .values({
      title: task.title,
      description: task.description,
      client_id: task.client_id,
      service_type: task.service_type,
      assigned_to: task.assigned_to,
      status: "Not Started",
      due_date: nextDueDate(task.recurrence, fromDate),
      recurrence: task.recurrence,
      last_generated_at: today,
    })
    .returning();

  if (newTask) {
    logger.info(
      { taskId: newTask.id, title: newTask.title, due_date: newTask.due_date },
      "Spawned next recurring task on completion",
    );
  }

  return newTask ?? null;
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
  const today = todayUTCStr();

  const completedRecurring = await db
    .select()
    .from(tasksTable)
    .where(and(isNotNull(tasksTable.recurrence), eq(tasksTable.status, "Completed")));

  const spawned: (typeof tasksTable.$inferSelect)[] = [];

  for (const task of completedRecurring) {
    if (!task.recurrence) continue;
    if (!isDue(task.recurrence, task.last_generated_at)) continue;

    // Mark the completed source task so it won't trigger again this cycle
    await db
      .update(tasksTable)
      .set({ last_generated_at: today })
      .where(eq(tasksTable.id, task.id));

    // Skip if a not-started or pending instance with same title/client/recurrence already exists
    const existing = await db
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.title, task.title),
          eq(tasksTable.client_id, task.client_id!),
          eq(tasksTable.recurrence, task.recurrence),
          or(eq(tasksTable.status, "Not Started"), eq(tasksTable.status, "Pending")),
        ),
      )
      .limit(1);

    if (existing.length > 0) continue;

    // Use the task's actual completion date as the base for scheduling
    const fromDate = task.completed_date ?? today;

    const [newTask] = await db
      .insert(tasksTable)
      .values({
        title: task.title,
        description: task.description,
        client_id: task.client_id,
        service_type: task.service_type,
        assigned_to: task.assigned_to,
        status: "Not Started",
        due_date: nextDueDate(task.recurrence, fromDate),
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
