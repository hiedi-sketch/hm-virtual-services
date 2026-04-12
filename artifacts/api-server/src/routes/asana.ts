/**
 * Asana integration routes
 *
 * GET    /api/asana/settings        – return stored config (PAT is masked)
 * POST   /api/asana/settings        – save PAT + project ID to the settings table
 * GET    /api/asana/tasks           – fetch tasks from Asana
 * POST   /api/asana/tasks           – create a task in Asana
 * PUT    /api/asana/tasks/:taskId   – toggle completed status
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appSettingsTable, tasksTable } from "@workspace/db";
import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  getProjectTasks,
  createProjectTask,
  updateTaskStatus,
  pushTaskToAsana,
  validatePat,
  getUserProjects,
} from "../services/asana";
import { z } from "zod";

const router: IRouter = Router();

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const existing = await db
    .select({ id: appSettingsTable.id })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, key))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(appSettingsTable)
      .set({ value })
      .where(eq(appSettingsTable.key, key));
  } else {
    await db.insert(appSettingsTable).values({ key, value });
  }
}

async function getProjectIds(): Promise<string[]> {
  const raw = await getSetting("asana_project_ids");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
    } catch { /* fall through */ }
  }
  // Backward-compat: single project
  const single = await getSetting("asana_project_id");
  return single ? [single] : [];
}

async function getCredentials(): Promise<{ pat: string; projectIds: string[] } | null> {
  const pat = await getSetting("asana_pat");
  const projectIds = await getProjectIds();
  if (!pat || projectIds.length === 0) return null;
  return { pat, projectIds };
}

// ─── routes ──────────────────────────────────────────────────────────────────

/** GET /api/asana/settings — return current config (PAT is masked) */
router.get("/asana/settings", requireAuth, requireRole("admin"), async (req, res) => {
  const pat = await getSetting("asana_pat");
  const projectIds = await getProjectIds();

  let asanaUser: { name: string; email: string } | null = null;
  if (pat) {
    try {
      asanaUser = await validatePat(pat);
    } catch {
      // token may be invalid — just return null user
    }
  }

  res.json({
    configured: !!(pat && projectIds.length > 0),
    pat_masked: pat ? `${pat.slice(0, 6)}${"•".repeat(Math.max(0, pat.length - 6))}` : null,
    project_ids: projectIds,
    asana_user: asanaUser,
  });
});

/** POST /api/asana/settings — save PAT and optionally add a project to the list */
router.post("/asana/settings", requireAuth, requireRole("admin"), async (req, res) => {
  const schema = z.object({
    pat: z.string().min(1, "PAT is required"),
    project_id: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }

  const { pat, project_id } = parsed.data;

  let effectivePat = pat;
  if (pat === "__keep__") {
    const existing = await getSetting("asana_pat");
    if (!existing) {
      res.status(400).json({ error: "No existing PAT found. Please enter your Asana PAT." });
      return;
    }
    effectivePat = existing;
  }

  // Validate the PAT before saving
  let asanaUser: { name: string; email: string };
  try {
    asanaUser = await validatePat(effectivePat);
  } catch (err: any) {
    const msg = err.statusCode === 401
      ? "Invalid Asana token — please check your PAT and try again."
      : (err.message ?? "Could not connect to Asana");
    res.status(400).json({ error: msg });
    return;
  }

  await setSetting("asana_pat", effectivePat);

  // If a project_id is provided, ADD it to the list (do not replace)
  if (project_id && project_id !== "__keep__") {
    const currentIds = await getProjectIds();
    if (!currentIds.includes(project_id)) {
      const newIds = [...currentIds, project_id];
      await setSetting("asana_project_ids", JSON.stringify(newIds));
    }
    // Keep legacy key in sync (set to latest added project for compat)
    await setSetting("asana_project_id", project_id);
  }

  const projectIds = await getProjectIds();
  res.json({ ok: true, asana_user: asanaUser, project_ids: projectIds });
});

/** DELETE /api/asana/projects/:gid — remove a project from the configured list */
router.delete("/asana/projects/:gid", requireAuth, requireRole("admin"), async (req, res) => {
  const { gid } = req.params;
  const currentIds = await getProjectIds();
  const newIds = currentIds.filter(id => id !== gid);
  await setSetting("asana_project_ids", JSON.stringify(newIds));
  res.json({ ok: true, project_ids: newIds });
});

/** GET /api/asana/tasks — fetch tasks from all configured Asana projects */
router.get("/asana/tasks", requireAuth, async (req, res) => {
  const creds = await getCredentials();
  if (!creds) {
    res.status(400).json({ error: "Asana is not configured. Please add your PAT and Project ID in Settings." });
    return;
  }

  try {
    const allArrays = await Promise.all(creds.projectIds.map(pid => getProjectTasks(creds.pat, pid)));
    const seen = new Set<string>();
    const tasks = allArrays.flat().filter(t => !seen.has(t.gid) && seen.add(t.gid));
    res.json({ tasks });
  } catch (err: any) {
    const statusCode = err.statusCode ?? 500;
    const message =
      statusCode === 401 ? "Invalid Asana token — please update your PAT in Settings." :
      statusCode === 404 ? "Asana project not found — please check your Project ID in Settings." :
      (err.message ?? "Failed to fetch tasks from Asana");
    res.status(statusCode < 500 ? statusCode : 502).json({ error: message });
  }
});

/** POST /api/asana/tasks — create a new task in Asana */
router.post("/asana/tasks", requireAuth, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1, "Task name is required"),
    due_on: z.string().optional().nullable(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }

  const creds = await getCredentials();
  if (!creds) {
    res.status(400).json({ error: "Asana is not configured." });
    return;
  }

  try {
    const task = await createProjectTask(creds.pat, creds.projectIds[0]!, parsed.data.name, parsed.data.due_on);
    res.status(201).json({ task });
  } catch (err: any) {
    const statusCode = err.statusCode ?? 500;
    const message =
      statusCode === 401 ? "Invalid Asana token — please update your PAT in Settings." :
      (err.message ?? "Failed to create task in Asana");
    res.status(statusCode < 500 ? statusCode : 502).json({ error: message });
  }
});

/** GET /api/asana/projects — return projects accessible to the configured PAT */
router.get("/asana/projects", requireAuth, requireRole("admin"), async (req, res) => {
  const pat = await getSetting("asana_pat");
  if (!pat) {
    res.status(400).json({ error: "Asana PAT is not configured. Please add your PAT in Settings." });
    return;
  }
  try {
    const projects = await getUserProjects(pat);
    res.json({ projects });
  } catch (err: any) {
    const statusCode = err.statusCode ?? 500;
    const message =
      statusCode === 401 ? "Invalid Asana token — please update your PAT in Settings." :
      (err.message ?? "Failed to fetch projects from Asana");
    res.status(statusCode < 500 ? statusCode : 502).json({ error: message });
  }
});

/** GET /api/asana/import/preview — return Asana tasks from all configured projects */
router.get("/asana/import/preview", requireAuth, requireRole("admin"), async (req, res) => {
  const creds = await getCredentials();
  if (!creds) {
    res.status(400).json({ error: "Asana is not configured. Please add your PAT and at least one Project in Asana Sync settings." });
    return;
  }
  try {
    const allArrays = await Promise.all(creds.projectIds.map(pid => getProjectTasks(creds.pat, pid)));
    const seen = new Set<string>();
    const flat = allArrays.flat().filter(t => !seen.has(t.gid) && seen.add(t.gid));
    res.json({
      tasks: flat.map(t => ({
        gid: t.gid,
        name: t.name,
        completed: t.completed,
        due_on: t.due_on,
        assignee_name: t.assignee?.name ?? null,
      })),
    });
  } catch (err: any) {
    const statusCode = err.statusCode ?? 500;
    const message =
      statusCode === 401 ? "Invalid Asana token — please update your PAT in Asana Sync settings." :
      statusCode === 404 ? "Asana project not found — please check your Project IDs in Asana Sync settings." :
      (err.message ?? "Failed to fetch tasks from Asana");
    res.status(statusCode < 500 ? statusCode : 502).json({ error: message });
  }
});

/** POST /api/asana/import — create selected Asana tasks in the local tasks table */
router.post("/asana/import", requireAuth, requireRole("admin"), async (req, res) => {
  const schema = z.object({
    client_id: z.number().int().positive(),
    tasks: z.array(z.object({
      gid: z.string(),
      name: z.string(),
      completed: z.boolean(),
      due_on: z.string().nullable().optional(),
      assignee_name: z.string().nullable().optional(),
    })),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }

  const { client_id, tasks } = parsed.data;
  const created: number[] = [];
  const skipped: number[] = [];

  for (const t of tasks) {
    // 1. Already linked by asana_gid — fully skip
    const byGid = await db
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .where(eq(tasksTable.asana_gid, t.gid))
      .limit(1);

    if (byGid.length > 0) {
      skipped.push(byGid[0]!.id);
      continue;
    }

    // 2. Same title within this client (case-insensitive, trimmed) — backfill asana_gid, then skip
    const byTitle = await db
      .select({ id: tasksTable.id, asana_gid: tasksTable.asana_gid })
      .from(tasksTable)
      .where(and(
        sql`LOWER(TRIM(${tasksTable.title})) = LOWER(TRIM(${t.name}))`,
        eq(tasksTable.client_id, client_id),
      ))
      .limit(1);

    if (byTitle.length > 0) {
      const match = byTitle[0]!;
      if (!match.asana_gid) {
        await db
          .update(tasksTable)
          .set({ asana_gid: t.gid })
          .where(eq(tasksTable.id, match.id));
      }
      skipped.push(match.id);
      continue;
    }

    // 3. Brand new — insert
    const [row] = await db.insert(tasksTable).values({
      title: t.name,
      client_id,
      asana_gid: t.gid,
      status: t.completed ? "Completed" : "Not Started",
      due_date: t.due_on ?? null,
      assigned_to: t.assignee_name ?? null,
      completed_date: t.completed ? (t.due_on ?? null) : null,
    }).returning({ id: tasksTable.id });

    if (row) created.push(row.id);
  }

  res.json({ created: created.length, skipped: skipped.length });
});

// ─── Push local → Asana ──────────────────────────────────────────────────────

/** Core push logic — shared by the manual route and the midnight scheduler. */
export async function runPush(): Promise<{ pushed: number; errors: number; pushedAt: string }> {
  const creds = await getCredentials();
  if (!creds) throw new Error("Asana is not configured.");

  // Fetch all local tasks that have been linked to Asana
  const linked = await db
    .select({
      id:         tasksTable.id,
      asana_gid:  tasksTable.asana_gid,
      title:      tasksTable.title,
      status:     tasksTable.status,
      due_date:   tasksTable.due_date,
      description: tasksTable.description,
    })
    .from(tasksTable)
    .where(isNotNull(tasksTable.asana_gid));

  let pushed = 0;
  let errors = 0;

  await Promise.all(linked.map(async task => {
    try {
      await pushTaskToAsana(creds.pat, task.asana_gid!, {
        name:      task.title,
        due_on:    task.due_date ?? null,
        completed: task.status === "Completed",
        notes:     task.description ?? null,
      });
      pushed++;
    } catch {
      errors++;
    }
  }));

  const pushedAt = new Date().toISOString();
  await setSetting("asana_last_push_at", pushedAt);
  return { pushed, errors, pushedAt };
}

/** GET /api/asana/push/status — return last push timestamp + linked-task count */
router.get("/asana/push/status", requireAuth, requireRole("admin"), async (_req, res) => {
  const lastPushAt = await getSetting("asana_last_push_at");
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(tasksTable)
    .where(isNotNull(tasksTable.asana_gid));

  res.json({ last_push_at: lastPushAt, linked_count: count });
});

/** POST /api/asana/push — manually push all linked local tasks to Asana */
router.post("/asana/push", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const result = await runPush();
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? "Push failed" });
  }
});

/** PUT /api/asana/tasks/:taskId — toggle completion status */
router.put("/asana/tasks/:taskId", requireAuth, async (req, res) => {
  const schema = z.object({ completed: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "completed (boolean) is required" });
    return;
  }

  const creds = await getCredentials();
  if (!creds) {
    res.status(400).json({ error: "Asana is not configured." });
    return;
  }

  const { taskId } = req.params as { taskId: string };

  try {
    const task = await updateTaskStatus(creds.pat, taskId, parsed.data.completed);
    res.json({ task });
  } catch (err: any) {
    const statusCode = err.statusCode ?? 500;
    const message =
      statusCode === 401 ? "Invalid Asana token — please update your PAT in Settings." :
      statusCode === 404 ? "Task not found in Asana." :
      (err.message ?? "Failed to update task");
    res.status(statusCode < 500 ? statusCode : 502).json({ error: message });
  }
});

export default router;
