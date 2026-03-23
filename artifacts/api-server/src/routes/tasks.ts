import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tasksTable, clientsTable, subtasksTable } from "@workspace/db";
import { eq, isNotNull, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { spawnRecurringTasks } from "../lib/spawn-recurring";
import { sendMail, template } from "../lib/mailer";
import { logAudit } from "../lib/audit";
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

/** Returns today's date as "YYYY-MM-DD" in UTC — immune to server TZ settings. */
function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

const taskSelectFields = {
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
};

// --- Task CRUD ---

router.get("/tasks", requireAuth, async (req, res) => {
  const query = ListTasksQueryParams.parse(req.query);
  const user = req.session.user!;

  let whereClause;
  if (user.role === "client" && user.client_id) {
    whereClause = eq(tasksTable.client_id, user.client_id);
  } else if (user.role === "team_member" && user.name) {
    whereClause = query.clientId
      ? and(eq(tasksTable.client_id, query.clientId), eq(tasksTable.assigned_to, user.name))
      : eq(tasksTable.assigned_to, user.name);
  } else {
    whereClause = query.clientId ? eq(tasksTable.client_id, query.clientId) : undefined;
  }

  const rows = await db
    .select(taskSelectFields)
    .from(tasksTable)
    .leftJoin(clientsTable, eq(tasksTable.client_id, clientsTable.id))
    .where(whereClause)
    .orderBy(tasksTable.id);

  const parsed = ListTasksResponse.parse(rows);
  res.json(parsed);
});

router.post("/tasks", requireAuth, async (req, res) => {
  const user = req.session.user!;

  // Clients may only create tasks for their own client_id
  if (user.role === "client") {
    if (!user.client_id) {
      res.status(403).json({ error: "No client account linked" });
      return;
    }
    req.body.client_id = user.client_id;
    // Clients cannot assign tasks to team members
    delete req.body.assigned_to;
  }

  const body = CreateTaskBody.parse(req.body);
  const [task] = await db.insert(tasksTable).values(body).returning();
  res.status(201).json(task);
  const actor = req.session.user;
  logAudit("task", task.id, "created", `Task "${task.title}" created`, { id: actor?.id, name: actor?.name });

  // Fire-and-forget: email the client about their new task
  if (task?.client_id) {
    (async () => {
      try {
        const [client] = await db
          .select({ email: clientsTable.email, name: clientsTable.name })
          .from(clientsTable)
          .where(eq(clientsTable.id, task.client_id!));

        if (client?.email) {
          const dueStr = task.due_date
            ? ` Due: <strong>${new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</strong>.`
            : "";

          await sendMail(
            client.email,
            `New task assigned: ${task.title}`,
            template(`
              <p>Hi ${client.name ?? "there"},</p>
              <p>A new task has been assigned to your account:</p>
              <div style="margin:16px 0;padding:16px;background:#f8fafc;border-left:4px solid #3b82f6;border-radius:4px;">
                <p style="margin:0;font-size:17px;font-weight:600;">${task.title}</p>
                ${task.description ? `<p style="margin:8px 0 0;color:#64748b;">${task.description}</p>` : ""}
                ${dueStr ? `<p style="margin:8px 0 0;color:#475569;">${dueStr}</p>` : ""}
              </div>
              <p>Log in to your account to view details or track progress.</p>
              <p style="margin-top:24px;color:#64748b;">— The Flowstate Team</p>
            `)
          );
        }
      } catch (err) {
        console.error("[tasks] Failed to send new-task email:", err);
      }
    })();
  }
});

// Must be before /tasks/:id routes to avoid Express treating "spawn-recurring" as an :id
router.post("/tasks/spawn-recurring", requireAuth, async (req, res) => {
  const spawned = await spawnRecurringTasks();
  res.json(spawned);
});

router.patch("/tasks/:id", requireRole("admin", "team_member"), async (req, res) => {
  const { id } = UpdateTaskParams.parse(req.params);
  const body = UpdateTaskBody.parse(req.body);

  if (Object.keys(body).length === 0) {
    res.status(400).json({ error: "No fields provided to update" });
    return;
  }

  // When completing a recurring task, stamp last_generated_at = today so the daily
  // scheduler won't count this task as a new spawn source for the current cycle.
  const extraFields: Record<string, unknown> = {};
  if (body.status === "complete") {
    const [existing] = await db
      .select({ recurrence: tasksTable.recurrence })
      .from(tasksTable)
      .where(eq(tasksTable.id, id));
    if (existing?.recurrence) {
      extraFields["last_generated_at"] = todayStr();
    }
  }

  const [updated] = await db
    .update(tasksTable)
    .set({ ...body, ...extraFields })
    .where(eq(tasksTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  const parsed = UpdateTaskResponse.parse(updated);
  res.json(parsed);
  const actor = req.session.user;
  const action = body.status === "complete" ? "completed" : "updated";
  const summary = body.status === "complete"
    ? `Task "${updated.title}" completed`
    : `Task "${updated.title}" updated`;
  logAudit("task", id, action, summary, { id: actor?.id, name: actor?.name });
});

// --- Subtask routes ---

router.get("/tasks/:taskId/subtasks", requireAuth, async (req, res) => {
  const { taskId } = ListSubtasksParams.parse(req.params);
  const rows = await db
    .select()
    .from(subtasksTable)
    .where(eq(subtasksTable.task_id, taskId))
    .orderBy(subtasksTable.id);
  res.json(rows);
});

router.post("/tasks/:taskId/subtasks", requireRole("admin", "team_member"), async (req, res) => {
  const { taskId } = CreateSubtaskParams.parse(req.params);
  const body = CreateSubtaskBody.parse(req.body);
  const [subtask] = await db
    .insert(subtasksTable)
    .values({ task_id: taskId, title: body.title })
    .returning();
  res.status(201).json(subtask);
});

router.patch("/subtasks/:id", requireRole("admin", "team_member"), async (req, res) => {
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

router.delete("/subtasks/:id", requireRole("admin", "team_member"), async (req, res) => {
  const { id } = DeleteSubtaskParams.parse(req.params);
  await db.delete(subtasksTable).where(eq(subtasksTable.id, id));
  res.status(204).send();
});

export default router;
