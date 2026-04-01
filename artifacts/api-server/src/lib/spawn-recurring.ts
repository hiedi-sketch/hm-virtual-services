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

function isDue(recurrence: string, lastGeneratedAt: string | null): boolean {
  const todayStr = todayUTCStr();
  const todayMs = parseDateUTC(todayStr);

  if (recurrence === "weekdays" && !isWeekdayUTC(todayMs)) return false;
  if (!lastGeneratedAt) return true;

  const lastMs = parseDateUTC(lastGeneratedAt);
  const diffDays = Math.floor((todayMs - lastMs) / 86_400_000);

  if (recurrence === "daily") return diffDays >= 1;
  if (recurrence === "weekdays") return diffDays >= 1;
  if (recurrence === "weekly" || recurrence.startsWith("weekly_")) return diffDays >= 7;
  if (recurrence === "monthly" || recurrence.startsWith("monthly_")) return diffDays >= 28;
  if (recurrence === "annually") return diffDays >= 365;
  return false;
}

/** Compute the next due date (YYYY-MM-DD) using UTC arithmetic. */
function nextDueDate(recurrence: string): string {
  const todayStr = todayUTCStr();
  const [y, m, d] = todayStr.split("-").map(Number) as [number, number, number];

  const toStr = (date: Date) => date.toISOString().split("T")[0]!;
  const MS = 86_400_000;

  // Weekly with specific day of week
  if (recurrence.startsWith("weekly_")) {
    const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const target = dayMap[recurrence.replace("weekly_", "")];
    if (target !== undefined) {
      let next = new Date(Date.UTC(y, m - 1, d + 1));
      while (next.getUTCDay() !== target) next = new Date(next.getTime() + MS);
      return toStr(next);
    }
  }

  // Monthly with specific day of month
  if (recurrence.startsWith("monthly_")) {
    const part = recurrence.replace("monthly_", "");
    if (part === "last") {
      // Last day of next month (UTC)
      return toStr(new Date(Date.UTC(y, m + 1, 0)));
    }
    const dom = parseInt(part);
    // Next occurrence: this month if not yet passed, otherwise next month
    const thisMonthTarget = new Date(Date.UTC(y, m - 1, dom));
    if (thisMonthTarget.getTime() > parseDateUTC(todayStr)) {
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
  return todayStr;
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
          eq(tasksTable.client_id, task.client_id),
          eq(tasksTable.recurrence, task.recurrence),
          or(eq(tasksTable.status, "Not Started"), eq(tasksTable.status, "Pending")),
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
        status: "Not Started",
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
