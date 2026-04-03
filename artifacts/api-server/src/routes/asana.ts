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
import { appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  getProjectTasks,
  createProjectTask,
  updateTaskStatus,
  validatePat,
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

async function getCredentials(): Promise<{ pat: string; projectId: string } | null> {
  const pat = await getSetting("asana_pat");
  const projectId = await getSetting("asana_project_id");
  if (!pat || !projectId) return null;
  return { pat, projectId };
}

// ─── routes ──────────────────────────────────────────────────────────────────

/** GET /api/asana/settings — return current config (PAT is masked) */
router.get("/asana/settings", requireAuth, requireRole("admin"), async (req, res) => {
  const pat = await getSetting("asana_pat");
  const projectId = await getSetting("asana_project_id");

  let asanaUser: { name: string; email: string } | null = null;
  if (pat) {
    try {
      asanaUser = await validatePat(pat);
    } catch {
      // token may be invalid — just return null user
    }
  }

  res.json({
    configured: !!(pat && projectId),
    pat_masked: pat ? `${pat.slice(0, 6)}${"•".repeat(Math.max(0, pat.length - 6))}` : null,
    project_id: projectId,
    asana_user: asanaUser,
  });
});

/** POST /api/asana/settings — save PAT + project ID */
router.post("/asana/settings", requireAuth, requireRole("admin"), async (req, res) => {
  const schema = z.object({
    pat: z.string().min(1, "PAT is required"),
    project_id: z.string().min(1, "Project ID is required"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }

  const { pat, project_id } = parsed.data;

  // "__keep__" is a sentinel sent by the UI when the user doesn't want to replace the stored PAT
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
  await setSetting("asana_project_id", project_id);

  res.json({ ok: true, asana_user: asanaUser });
});

/** GET /api/asana/tasks — fetch tasks from the configured Asana project */
router.get("/asana/tasks", requireAuth, async (req, res) => {
  const creds = await getCredentials();
  if (!creds) {
    res.status(400).json({ error: "Asana is not configured. Please add your PAT and Project ID in Settings." });
    return;
  }

  try {
    const tasks = await getProjectTasks(creds.pat, creds.projectId);
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
    const task = await createProjectTask(creds.pat, creds.projectId, parsed.data.name, parsed.data.due_on);
    res.status(201).json({ task });
  } catch (err: any) {
    const statusCode = err.statusCode ?? 500;
    const message =
      statusCode === 401 ? "Invalid Asana token — please update your PAT in Settings." :
      (err.message ?? "Failed to create task in Asana");
    res.status(statusCode < 500 ? statusCode : 502).json({ error: message });
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
