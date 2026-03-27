import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tasksTable, clientsTable, subtasksTable, taskCommentsTable, usersTable } from "@workspace/db";
import { eq, isNotNull, and, desc } from "drizzle-orm";
import { notifyAdmins, notifyClientUser, createNotification } from "../lib/notify";
import { z } from "zod";
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
  service_type: tasksTable.service_type,
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
              <div style="margin:16px 0;padding:16px;background:#f8fafc;border-left:4px solid #266b75;border-radius:4px;">
                <p style="margin:0;font-size:17px;font-weight:600;">${task.title}</p>
                ${task.description ? `<p style="margin:8px 0 0;color:#64748b;">${task.description}</p>` : ""}
                ${dueStr ? `<p style="margin:8px 0 0;color:#475569;">${dueStr}</p>` : ""}
              </div>
              <p>Log in to your account to view details or track progress.</p>
              <p style="margin-top:24px;color:#64748b;">— The HM Virtual Services Team</p>
            `)
          );
        }
      } catch (err) {
        console.error("[tasks] Failed to send new-task email:", err);
      }
    })();
  }

  // Fire-and-forget: in-app notifications on task creation
  if (task) {
    (async () => {
      try {
        const dueStr = task.due_date
          ? ` Due: ${new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
          : "";

        if (user.role === "client" && task.client_id) {
          // Client submitted a task request → notify all admins
          await notifyAdmins({
            type: "task_assigned",
            title: `New task request: ${task.title}`,
            message: `Submitted by client.${dueStr}`,
            entityType: "task",
            entityId: task.id,
          });
        } else {
          // Admin/team created task: notify the assigned team member (if any)
          if (task.assigned_to) {
            const [assignedUser] = await db
              .select({ id: usersTable.id })
              .from(usersTable)
              .where(eq(usersTable.name, task.assigned_to))
              .limit(1);
            if (assignedUser) {
              await createNotification({
                userId: assignedUser.id,
                type: "task_assigned",
                title: `Task assigned to you: ${task.title}`,
                message: `Assigned by ${user.name}.${dueStr}`,
                entityType: "task",
                entityId: task.id,
              });
            }
          }
          // Also notify the client's portal user
          if (task.client_id) {
            await notifyClientUser(task.client_id, {
              type: "task_assigned",
              title: `New task: ${task.title}`,
              message: `A new task has been added to your account.${dueStr}`,
              entityType: "task",
              entityId: task.id,
            });
          }
        }
      } catch { /* ignore */ }
    })();
  }
});

// Must be before /tasks/:id routes to avoid Express treating "spawn-recurring" as an :id
router.post("/tasks/spawn-recurring", requireAuth, async (req, res) => {
  const spawned = await spawnRecurringTasks();
  res.json(spawned);
});

router.delete("/tasks/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task id" }); return; }
  await db.delete(tasksTable).where(eq(tasksTable.id, id));
  const actor = req.session.user;
  logAudit("task", id, "deleted", `Task ${id} deleted`, { id: actor?.id, name: actor?.name });
  res.status(204).send();
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
  if (body.status === "Completed") {
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
  const action = body.status === "Completed" ? "completed" : "updated";
  const summary = body.status === "Completed"
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

// ── Task Comments (shared between portal and admin) ──────────────────────────

const createCommentSchema = z.object({
  comment: z.string().min(1),
});

// GET /api/tasks/:taskId/comments
router.get("/tasks/:taskId/comments", requireAuth, async (req, res) => {
  const taskId = Number(req.params.taskId);
  const user = req.session.user!;

  // Clients can only access comments on tasks that belong to their client_id
  if (user.role === "client") {
    const [task] = await db
      .select({ client_id: tasksTable.client_id })
      .from(tasksTable)
      .where(eq(tasksTable.id, taskId));
    if (!task || task.client_id !== user.client_id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  const comments = await db
    .select()
    .from(taskCommentsTable)
    .where(eq(taskCommentsTable.task_id, taskId))
    .orderBy(taskCommentsTable.created_at);

  res.json(comments);
});

// POST /api/tasks/:taskId/comments
router.post("/tasks/:taskId/comments", requireAuth, async (req, res) => {
  const taskId = Number(req.params.taskId);
  const user = req.session.user!;

  // Clients can only comment on tasks that belong to their client_id
  if (user.role === "client") {
    const [task] = await db
      .select({ client_id: tasksTable.client_id })
      .from(tasksTable)
      .where(eq(tasksTable.id, taskId));
    if (!task || task.client_id !== user.client_id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  const body = createCommentSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Comment text is required" });
    return;
  }

  const [comment] = await db
    .insert(taskCommentsTable)
    .values({
      task_id: taskId,
      user_id: user.id,
      author_name: user.name,
      author_role: user.role as "admin" | "team_member" | "client",
      comment: body.data.comment,
    })
    .returning();

  res.status(201).json(comment);

  // Fire-and-forget: in-app notification for new comment
  if (comment) {
    (async () => {
      try {
        const [task] = await db
          .select({ title: tasksTable.title, client_id: tasksTable.client_id, assigned_to: tasksTable.assigned_to })
          .from(tasksTable)
          .where(eq(tasksTable.id, taskId));
        if (!task) return;

        const snippet = body.data.comment.length > 80 ? body.data.comment.slice(0, 80) + "…" : body.data.comment;

        if (user.role === "client") {
          // Client commented → notify admins
          await notifyAdmins({
            type: "task_comment",
            title: `New comment on: ${task.title}`,
            message: `${user.name}: "${snippet}"`,
            entityType: "task",
            entityId: taskId,
          });
        } else {
          // Admin/team commented → notify the client portal user
          if (task.client_id) {
            await notifyClientUser(task.client_id, {
              type: "task_comment",
              title: `New comment on your task: ${task.title}`,
              message: `${user.name}: "${snippet}"`,
              entityType: "task",
              entityId: taskId,
            });
          }
        }
      } catch { /* ignore */ }
    })();
  }
});

export default router;
