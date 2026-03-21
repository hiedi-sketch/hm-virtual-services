import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tasksTable, clientsTable, subtasksTable } from "@workspace/db";
import { eq, isNotNull, and } from "drizzle-orm";
import {
  CreateTaskBody,
  UpdateTaskBody,
  UpdateTaskParams,
  ListTasksQueryParams,
  ListTasksResponse,
  UpdateTaskResponse,
  ListSubtasksParams,
  CreateSubtaskBody,
  CreateSubtaskParams,
  UpdateSubtaskBody,
  UpdateSubtaskParams,
  DeleteSubtaskParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isWeekday(d: Date): boolean {
  const day = d.getDay(); // 0=Sun, 6=Sat
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
    // Skip to next weekday
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

// --- Task CRUD ---

router.get("/tasks", async (req, res) => {
  const query = ListTasksQueryParams.parse(req.query);

  let rows;
  if (query.clientId) {
    rows = await db
      .select({
        id: tasksTable.id,
        title: tasksTable.title,
        description: tasksTable.description,
        client_id: tasksTable.client_id,
        assigned_to: tasksTable.assigned_to,
        status: tasksTable.status,
        due_date: tasksTable.due_date,
        client_name: clientsTable.name,
        recurrence: tasksTable.recurrence,
        last_generated_at: tasksTable.last_generated_at,
      })
      .from(tasksTable)
      .leftJoin(clientsTable, eq(tasksTable.client_id, clientsTable.id))
      .where(eq(tasksTable.client_id, query.clientId))
      .orderBy(tasksTable.id);
  } else {
    rows = await db
      .select({
        id: tasksTable.id,
        title: tasksTable.title,
        description: tasksTable.description,
        client_id: tasksTable.client_id,
        assigned_to: tasksTable.assigned_to,
        status: tasksTable.status,
        due_date: tasksTable.due_date,
        client_name: clientsTable.name,
        recurrence: tasksTable.recurrence,
        last_generated_at: tasksTable.last_generated_at,
      })
      .from(tasksTable)
      .leftJoin(clientsTable, eq(tasksTable.client_id, clientsTable.id))
      .orderBy(tasksTable.id);
  }

  const parsed = ListTasksResponse.parse(rows);
  res.json(parsed);
});

router.post("/tasks", async (req, res) => {
  const body = CreateTaskBody.parse(req.body);
  const [task] = await db.insert(tasksTable).values(body).returning();
  res.status(201).json(task);
});

// Must be before /tasks/:id routes to avoid Express treating "spawn-recurring" as an :id
router.post("/tasks/spawn-recurring", async (req, res) => {
  const today = todayStr();

  // Only look at COMPLETED recurring tasks — pending ones already visible to the user, no duplicate needed
  const completedRecurring = await db
    .select()
    .from(tasksTable)
    .where(and(isNotNull(tasksTable.recurrence), eq(tasksTable.status, "complete")));

  const spawned: (typeof tasksTable.$inferSelect)[] = [];

  for (const task of completedRecurring) {
    if (!task.recurrence) continue;
    if (!isDue(task.recurrence, task.last_generated_at)) continue;

    // Mark this completed task as processed (prevent re-triggering on next page load)
    await db
      .update(tasksTable)
      .set({ last_generated_at: today })
      .where(eq(tasksTable.id, task.id));

    // Skip if a pending instance with same title/client/recurrence already exists
    // (created by the on-complete handler in the frontend)
    const existing = await db
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.title, task.title),
          eq(tasksTable.client_id, task.client_id),
          eq(tasksTable.recurrence, task.recurrence),
          eq(tasksTable.status, "pending"),
        )
      )
      .limit(1);

    if (existing.length > 0) continue;

    // No pending instance exists — create one (catches missed days when app was closed)
    const [newTask] = await db
      .insert(tasksTable)
      .values({
        title: task.title,
        description: task.description,
        client_id: task.client_id,
        assigned_to: task.assigned_to,
        status: "pending",
        due_date: nextDueDate(task.recurrence),
        recurrence: task.recurrence, // Preserve the recurrence type
        last_generated_at: null,
      })
      .returning();

    spawned.push(newTask);
  }

  res.json(spawned);
});

router.patch("/tasks/:id", async (req, res) => {
  const { id } = UpdateTaskParams.parse(req.params);
  const body = UpdateTaskBody.parse(req.body);

  const [updated] = await db
    .update(tasksTable)
    .set(body)
    .where(eq(tasksTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const parsed = UpdateTaskResponse.parse(updated);
  res.json(parsed);
});

// --- Subtask routes ---

router.get("/tasks/:taskId/subtasks", async (req, res) => {
  const { taskId } = ListSubtasksParams.parse(req.params);
  const rows = await db
    .select()
    .from(subtasksTable)
    .where(eq(subtasksTable.task_id, taskId))
    .orderBy(subtasksTable.id);
  res.json(rows);
});

router.post("/tasks/:taskId/subtasks", async (req, res) => {
  const { taskId } = CreateSubtaskParams.parse(req.params);
  const body = CreateSubtaskBody.parse(req.body);
  const [subtask] = await db
    .insert(subtasksTable)
    .values({ task_id: taskId, title: body.title })
    .returning();
  res.status(201).json(subtask);
});

router.patch("/subtasks/:id", async (req, res) => {
  const { id } = UpdateSubtaskParams.parse(req.params);
  const body = UpdateSubtaskBody.parse(req.body);

  const [updated] = await db
    .update(subtasksTable)
    .set(body)
    .where(eq(subtasksTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Subtask not found" });
    return;
  }

  res.json(updated);
});

router.delete("/subtasks/:id", async (req, res) => {
  const { id } = DeleteSubtaskParams.parse(req.params);
  await db.delete(subtasksTable).where(eq(subtasksTable.id, id));
  res.status(204).send();
});

export default router;
