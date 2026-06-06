import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tasksTable, clientsTable, subtasksTable, taskCommentsTable, usersTable, appSettingsTable } from "@workspace/db";
import { eq, isNotNull, and, desc, sql, inArray } from "drizzle-orm";
import { notifyAdmins, notifyClientUser, createNotification } from "../lib/notify";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { spawnRecurringTasks, spawnOnCompletion } from "../lib/spawn-recurring";
import { sendMail, template } from "../lib/mailer";
import { logAudit } from "../lib/audit";
import { updateTask as cuUpdateTask, createComment as cuCreateComment, localStatusToCU, dateToMs } from "../services/clickup";
import { pushTaskToAsana } from "../services/asana";
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

// ── External service auto-push helpers ────────────────────────────────────────

async function getClickUpToken(): Promise<string | null> {
  const rows = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "clickup_token"))
    .limit(1);
  return rows[0]?.value ?? null;
}

async function getAsanaPat(): Promise<string | null> {
  const rows = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "asana_pat"))
    .limit(1);
  return rows[0]?.value ?? null;
}

/**
 * Fire-and-forget: push a task update to ClickUp if linked.
 * Status is only pushed when the local status is "Completed" — we never send
 * a non-complete status to ClickUp so we don't un-complete tasks that were
 * already marked done there.
 */
async function maybePushTaskToClickUp(task: {
  clickup_task_id: string | null;
  title: string;
  status: string;
  due_date: string | null;
  description: string | null;
  tags: string | null;
}): Promise<void> {
  if (!task.clickup_task_id) return;
  const token = await getClickUpToken();
  if (!token) return;
  try {
    await cuUpdateTask(token, task.clickup_task_id, {
      name: task.title,
      description: task.description ?? undefined,
      due_date: dateToMs(task.due_date),
      // Only push status=Completed; never push incomplete statuses to avoid
      // un-completing tasks that were already marked done in ClickUp.
      ...(task.status === "Completed" ? { status: localStatusToCU(task.status) } : {}),
      tags: task.tags ? task.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
    });
  } catch { /* best-effort */ }
}

/**
 * Fire-and-forget: mark a task as completed in Asana when it is completed
 * in the dashboard. Never called with completed=false so we never un-complete
 * tasks that were already done in Asana.
 */
async function maybePushCompletionToAsana(task: {
  asana_gid: string | null;
  title: string;
  due_date: string | null;
  description: string | null;
}): Promise<void> {
  if (!task.asana_gid) return;
  const pat = await getAsanaPat();
  if (!pat) return;
  try {
    await pushTaskToAsana(pat, task.asana_gid, {
      name: task.title,
      due_on: task.due_date ?? null,
      completed: true,
      notes: task.description ?? null,
    });
  } catch { /* best-effort */ }
}

/** Fire-and-forget: push a new local comment to ClickUp if the task is linked. */
async function maybePushCommentToClickUp(
  taskId: number,
  commentText: string,
  clickupCommentId: string | null,
): Promise<void> {
  // Don't echo back comments that originated from ClickUp
  if (clickupCommentId) return;

  const [task] = await db
    .select({ clickup_task_id: tasksTable.clickup_task_id })
    .from(tasksTable)
    .where(eq(tasksTable.id, taskId))
    .limit(1);
  if (!task?.clickup_task_id) return;

  const token = await getClickUpToken();
  if (!token) return;
  try {
    await cuCreateComment(token, task.clickup_task_id, commentText);
  } catch { /* best-effort */ }
}

// ─────────────────────────────────────────────────────────────────────────────

const taskSelectFields = {
  id: tasksTable.id,
  title: tasksTable.title,
  description: tasksTable.description,
  client_id: tasksTable.client_id,
  assigned_to: tasksTable.assigned_to,
  status: tasksTable.status,
  due_date: tasksTable.due_date,
  completed_date: tasksTable.completed_date,
  client_name: clientsTable.contact_name,
  recurrence: tasksTable.recurrence,
  last_generated_at: tasksTable.last_generated_at,
  service_type: tasksTable.service_type,
  asana_gid: tasksTable.asana_gid,
  clickup_task_id: tasksTable.clickup_task_id,
  tags: tasksTable.tags,
  is_pinned: tasksTable.is_pinned,
  queue_position: tasksTable.queue_position,
  missive_conversation_id: tasksTable.missive_conversation_id,
  reset_interval_hours: tasksTable.reset_interval_hours,
  reset_daily_time: tasksTable.reset_daily_time,
  incomplete_subtask_count: sql<number>`(
    SELECT COUNT(*) FROM subtasks
    WHERE subtasks.task_id = ${tasksTable.id} AND subtasks.done = false
  )`.mapWith(Number),
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
  const [inserted] = await db.insert(tasksTable).values(body).returning({ id: tasksTable.id });
  const [task] = await db
    .select(taskSelectFields)
    .from(tasksTable)
    .leftJoin(clientsTable, eq(tasksTable.client_id, clientsTable.id))
    .where(eq(tasksTable.id, inserted.id));
  res.status(201).json(task);
  const actor = req.session.user;
  logAudit("task", task.id, "created", `Task "${task.title}" created`, { id: actor?.id, name: actor?.name });

  // Fire-and-forget: email the client only when the task is explicitly assigned to them
  // (task.client_name maps to contact_name — if assigned_to matches, the client has an action item)
  if (task?.client_id && task.assigned_to && task.client_name && task.assigned_to === task.client_name) {
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
          // Admin/team created task: notify the assigned team member (if any),
          // but skip the notification when the creator assigned the task to themselves.
          if (task.assigned_to) {
            const [assignedUser] = await db
              .select({ id: usersTable.id })
              .from(usersTable)
              .where(eq(usersTable.name, task.assigned_to))
              .limit(1);
            if (assignedUser && assignedUser.id !== user.id) {
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

// ── GET /api/tasks/labels ─────────────────────────────────────────────────────
// Returns the account-level labels and folders.
router.get("/tasks/labels", requireRole("admin"), async (req, res) => {
  const [row] = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "task_labels"))
    .limit(1);
  res.json(row ? JSON.parse(row.value) : []);
});

// ── POST /api/tasks/labels ────────────────────────────────────────────────────
// Creates a new account-level label or folder.
router.post("/tasks/labels", requireRole("admin"), async (req, res) => {
  const schema = z.object({
    name:  z.string().min(1).max(50),
    type:  z.enum(["label", "folder"]),
    color: z.string().default("#266b75"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }
  const [row] = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "task_labels"))
    .limit(1);
  const labels: { id: string; name: string; type: string; color: string }[] = row ? JSON.parse(row.value) : [];
  const { randomUUID } = await import("crypto");
  const newLabel = { id: randomUUID(), ...parsed.data };
  labels.push(newLabel);
  await db.insert(appSettingsTable)
    .values({ key: "task_labels", value: JSON.stringify(labels) })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: JSON.stringify(labels) } });
  res.json(newLabel);
});

// ── DELETE /api/tasks/labels/:labelId ─────────────────────────────────────────
// Removes an account-level label or folder.
router.delete("/tasks/labels/:labelId", requireRole("admin"), async (req, res) => {
  const { labelId } = req.params;
  const [row] = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, "task_labels"))
    .limit(1);
  const labels: { id: string }[] = row ? JSON.parse(row.value) : [];
  const filtered = labels.filter(l => l.id !== labelId);
  await db.insert(appSettingsTable)
    .values({ key: "task_labels", value: JSON.stringify(filtered) })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: JSON.stringify(filtered) } });
  res.json({ ok: true });
});

// ── POST /api/tasks/bulk ─────────────────────────────────────────────────────
// Performs a bulk action on a list of task IDs.
// Supported actions: "delete" | "update_status" | "update_client" | "update_service_type" | "update_assigned" | "add_label" | "move_to_folder"
router.post("/tasks/bulk", requireRole("admin"), async (req, res) => {
  const schema = z.object({
    action:       z.enum(["delete", "update_status", "update_client", "update_service_type", "update_assigned", "add_label", "move_to_folder"]),
    ids:          z.array(z.number().int().positive()).min(1).max(500),
    status:       z.string().optional(),
    client_id:    z.number().int().positive().optional(),
    service_type: z.enum(["Bookkeeping", "Virtual Assistant", "Family"]).optional(),
    assigned_to:  z.string().optional(),
    label:        z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }

  const { action, ids, status, client_id, service_type, assigned_to, label } = parsed.data;
  const actor = req.session.user;

  if (action === "delete") {
    // Cancel recurrence on parent completed tasks (same logic as single delete)
    const targets = await db
      .select({ title: tasksTable.title, client_id: tasksTable.client_id, recurrence: tasksTable.recurrence })
      .from(tasksTable)
      .where(inArray(tasksTable.id, ids));

    for (const t of targets) {
      if (t.recurrence && t.client_id) {
        await db
          .update(tasksTable)
          .set({ recurrence: null })
          .where(and(
            eq(tasksTable.title, t.title),
            eq(tasksTable.client_id, t.client_id),
            eq(tasksTable.recurrence, t.recurrence),
            eq(tasksTable.status, "Completed"),
          ));
      }
    }

    await db.delete(tasksTable).where(inArray(tasksTable.id, ids));
    logAudit("task", 0, "bulk_deleted", `${ids.length} tasks bulk-deleted`, { id: actor?.id, name: actor?.name });
    res.json({ affected: ids.length });
    return;
  }

  if (action === "update_status") {
    if (!status) { res.status(400).json({ error: "status is required" }); return; }
    await db.update(tasksTable).set({ status }).where(inArray(tasksTable.id, ids));
    logAudit("task", 0, "bulk_status", `${ids.length} tasks → status "${status}"`, { id: actor?.id, name: actor?.name });
    res.json({ affected: ids.length });
    return;
  }

  if (action === "update_client") {
    if (!client_id) { res.status(400).json({ error: "client_id is required" }); return; }
    await db.update(tasksTable).set({ client_id }).where(inArray(tasksTable.id, ids));
    logAudit("task", 0, "bulk_client", `${ids.length} tasks → client ${client_id}`, { id: actor?.id, name: actor?.name });
    res.json({ affected: ids.length });
    return;
  }

  if (action === "update_service_type") {
    if (!service_type) { res.status(400).json({ error: "service_type is required" }); return; }
    await db.update(tasksTable).set({ service_type }).where(inArray(tasksTable.id, ids));
    logAudit("task", 0, "bulk_service_type", `${ids.length} tasks → service_type "${service_type}"`, { id: actor?.id, name: actor?.name });
    res.json({ affected: ids.length });
    return;
  }

  if (action === "update_assigned") {
    if (!assigned_to) { res.status(400).json({ error: "assigned_to is required" }); return; }
    await db.update(tasksTable).set({ assigned_to }).where(inArray(tasksTable.id, ids));
    logAudit("task", 0, "bulk_assigned", `${ids.length} tasks → assigned_to "${assigned_to}"`, { id: actor?.id, name: actor?.name });
    res.json({ affected: ids.length });
    return;
  }

  if (action === "add_label") {
    if (!label) { res.status(400).json({ error: "label is required" }); return; }
    const currentTasks = await db
      .select({ id: tasksTable.id, tags: tasksTable.tags })
      .from(tasksTable)
      .where(inArray(tasksTable.id, ids));
    for (const task of currentTasks) {
      const existing = task.tags ? task.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
      if (!existing.includes(label)) {
        existing.push(label);
        await db.update(tasksTable).set({ tags: existing.join(", ") }).where(eq(tasksTable.id, task.id));
      }
    }
    logAudit("task", 0, "bulk_add_label", `${ids.length} tasks → add label "${label}"`, { id: actor?.id, name: actor?.name });
    res.json({ affected: ids.length });
    return;
  }

  if (action === "move_to_folder") {
    if (!label) { res.status(400).json({ error: "label is required" }); return; }
    // Load all managed label names so we can strip them and replace with the new one
    const [settingsRow] = await db
      .select({ value: appSettingsTable.value })
      .from(appSettingsTable)
      .where(eq(appSettingsTable.key, "task_labels"))
      .limit(1);
    const allManagedNames: string[] = settingsRow
      ? (JSON.parse(settingsRow.value) as { name: string }[]).map(l => l.name)
      : [];
    const currentTasks = await db
      .select({ id: tasksTable.id, tags: tasksTable.tags })
      .from(tasksTable)
      .where(inArray(tasksTable.id, ids));
    for (const task of currentTasks) {
      const existing = task.tags ? task.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
      const kept = existing.filter(t => !allManagedNames.includes(t));
      kept.push(label);
      await db.update(tasksTable).set({ tags: kept.join(", ") }).where(eq(tasksTable.id, task.id));
    }
    logAudit("task", 0, "bulk_move_folder", `${ids.length} tasks → move to folder "${label}"`, { id: actor?.id, name: actor?.name });
    res.json({ affected: ids.length });
    return;
  }
});

router.delete("/tasks/:id", requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid task id" }); return; }

  // Before deleting, check if this is a recurring task. If so, cancel the
  // recurrence on all completed tasks in the same series (same title + client +
  // recurrence pattern) so the spawner never regenerates this task again.
  const [target] = await db
    .select({ title: tasksTable.title, client_id: tasksTable.client_id, recurrence: tasksTable.recurrence })
    .from(tasksTable)
    .where(eq(tasksTable.id, id))
    .limit(1);

  if (target?.recurrence && target.client_id) {
    await db
      .update(tasksTable)
      .set({ recurrence: null })
      .where(
        and(
          eq(tasksTable.title, target.title),
          eq(tasksTable.client_id, target.client_id),
          eq(tasksTable.recurrence, target.recurrence),
          eq(tasksTable.status, "Completed"),
        )
      );
  }

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

  // Auto-set completed_date and last_generated_at when completing.
  const extraFields: Record<string, unknown> = {};
  let existingLastGeneratedAt: string | null = null;
  if (body.status === "Completed") {
    const [existing] = await db
      .select({ recurrence: tasksTable.recurrence, completed_date: tasksTable.completed_date, last_generated_at: tasksTable.last_generated_at })
      .from(tasksTable)
      .where(eq(tasksTable.id, id));
    existingLastGeneratedAt = existing?.last_generated_at ?? null;
    if (!body.completed_date && !existing?.completed_date) {
      extraFields["completed_date"] = todayStr();
    }
    if (existing?.recurrence) {
      extraFields["last_generated_at"] = todayStr();
    }
    // Auto-remove from queue when completed
    extraFields["queue_position"] = null;
  } else if (body.status && body.status !== "Completed" && !("completed_date" in body)) {
    extraFields["completed_date"] = null;
  }

  const [rawUpdated] = await db
    .update(tasksTable)
    .set({ ...body, ...extraFields })
    .where(eq(tasksTable.id, id))
    .returning();

  if (!rawUpdated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }

  // Re-fetch with client JOIN so the response always includes client_name
  const [updated] = await db
    .select(taskSelectFields)
    .from(tasksTable)
    .leftJoin(clientsTable, eq(tasksTable.client_id, clientsTable.id))
    .where(eq(tasksTable.id, id));

  const parsed = UpdateTaskResponse.parse(updated ?? rawUpdated);
  res.json(parsed);

  // Fire-and-forget: push changes to ClickUp if this task is linked.
  // Status is only forwarded when Completed (see helper for rationale).
  maybePushTaskToClickUp({
    clickup_task_id: updated.clickup_task_id ?? null,
    title: updated.title,
    status: updated.status,
    due_date: updated.due_date ?? null,
    description: updated.description ?? null,
    tags: updated.tags ?? null,
  }).catch(() => {});

  // Fire-and-forget: if the task was just marked Completed, immediately
  // mark it done in Asana too (real-time, rather than waiting for nightly sync).
  if (body.status === "Completed") {
    maybePushCompletionToAsana({
      asana_gid: updated.asana_gid ?? null,
      title: updated.title,
      due_date: updated.due_date ?? null,
      description: updated.description ?? null,
    }).catch(() => {});
  }

  const actor = req.session.user;
  const action = body.status === "Completed" ? "completed" : "updated";
  const summary = body.status === "Completed"
    ? `Task "${updated.title}" completed`
    : `Task "${updated.title}" updated`;
  logAudit("task", id, action, summary, { id: actor?.id, name: actor?.name });

  // Immediately spawn the next recurring instance when a recurring task is completed,
  // but only if this is the first time it's being processed (last_generated_at was
  // null before this update). Re-completing an already-processed task should not
  // spawn a duplicate.
  if (body.status === "Completed" && updated.recurrence && !existingLastGeneratedAt) {
    spawnOnCompletion(updated).catch((err) =>
      logger.error({ err, taskId: updated.id }, "spawnOnCompletion failed"),
    );
  }
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

  // Fire-and-forget: push comment to ClickUp if task is linked
  // (clickup_comment_id is null here because this comment originated locally)
  maybePushCommentToClickUp(taskId, body.data.comment, null).catch(() => {});

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
