/**
 * ClickUp integration routes
 *
 * GET    /api/clickup/settings              – stored config (token masked)
 * POST   /api/clickup/settings              – save API token + default list
 * GET    /api/clickup/workspaces            – list accessible teams
 * GET    /api/clickup/spaces/:teamId        – list spaces in a team
 * GET    /api/clickup/lists/:spaceId        – list all lists in a space
 * GET    /api/clickup/import/preview        – preview tasks in configured list
 * POST   /api/clickup/import               – import selected tasks
 * POST   /api/clickup/sync                 – push all linked tasks to ClickUp
 * GET    /api/clickup/sync/status          – last sync timestamp + linked count
 * POST   /api/clickup/webhook              – receive webhook events (no auth, signed)
 * POST   /api/clickup/webhook/register     – register webhook with ClickUp
 * DELETE /api/clickup/webhook              – delete registered webhook
 */

import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { appSettingsTable, tasksTable, taskCommentsTable } from "@workspace/db";
import { eq, isNotNull, and, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { z } from "zod";
import {
  getAuthorizedUser,
  getTeams,
  getSpaces,
  getSpaceLists,
  getListTasks,
  createTask,
  updateTask,
  getTaskComments,
  createComment,
  registerWebhook,
  deleteWebhook,
  cuStatusToLocal,
  localStatusToCU,
  dateToMs,
  msToDate,
} from "../services/clickup";

const router: IRouter = Router();

// ─── Settings helpers ─────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const existing = await db
    .select({ id: appSettingsTable.id })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, key))
    .limit(1);
  if (existing.length > 0) {
    await db.update(appSettingsTable).set({ value }).where(eq(appSettingsTable.key, key));
  } else {
    await db.insert(appSettingsTable).values({ key, value });
  }
}

async function getToken(): Promise<string | null> {
  return getSetting("clickup_token");
}

async function getDefaultListId(): Promise<string | null> {
  return getSetting("clickup_list_id");
}

async function getCredentials(): Promise<{ token: string; listId: string } | null> {
  const token = await getToken();
  const listId = await getDefaultListId();
  if (!token || !listId) return null;
  return { token, listId };
}

// ─── GET /api/clickup/settings ────────────────────────────────────────────────

router.get("/clickup/settings", requireAuth, requireRole("admin"), async (_req, res) => {
  const token = await getToken();
  const listId = await getDefaultListId();
  const listName = await getSetting("clickup_list_name");
  const lastSyncAt = await getSetting("clickup_last_sync_at");
  const webhookId = await getSetting("clickup_webhook_id");
  const teamId = await getSetting("clickup_team_id");

  let cuUser = null;
  if (token) {
    try { cuUser = await getAuthorizedUser(token); } catch { /* invalid token */ }
  }

  const listIdsRaw = await getSetting("clickup_list_ids");
  const listIds: Array<{ id: string; name: string }> = listIdsRaw
    ? (() => { try { return JSON.parse(listIdsRaw); } catch { return []; } })()
    : (listId && listName ? [{ id: listId, name: listName }] : listId ? [{ id: listId, name: listId }] : []);

  res.json({
    configured: !!(token && listId),
    token_masked: token ? `${token.slice(0, 6)}${"•".repeat(Math.max(0, token.length - 6))}` : null,
    list_id: listId,
    list_name: listName,
    list_ids: listIds,
    last_sync_at: lastSyncAt,
    webhook_id: webhookId,
    team_id: teamId,
    clickup_user: cuUser,
  });
});

// ─── POST /api/clickup/settings ──────────────────────────────────────────────

router.post("/clickup/settings", requireAuth, requireRole("admin"), async (req, res) => {
  const schema = z.object({
    token: z.string().min(1, "API token is required"),
    list_id: z.string().optional(),
    list_name: z.string().optional(),
    team_id: z.string().optional(),
    list_ids: z.array(z.object({ id: z.string(), name: z.string() })).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }

  const { token, list_id, list_name, team_id, list_ids } = parsed.data;

  let effectiveToken = token;
  if (token === "__keep__") {
    const existing = await getToken();
    if (!existing) {
      res.status(400).json({ error: "No existing token saved. Please enter your ClickUp API token." });
      return;
    }
    effectiveToken = existing;
  }

  let cuUser;
  try {
    cuUser = await getAuthorizedUser(effectiveToken);
  } catch (err: any) {
    const msg = err.statusCode === 401
      ? "Invalid ClickUp token — please check and try again."
      : (err.message ?? "Could not connect to ClickUp");
    res.status(400).json({ error: msg });
    return;
  }

  await setSetting("clickup_token", effectiveToken);
  if (team_id) await setSetting("clickup_team_id", team_id);

  // Multi-list support: save both the array (list_ids) and the first list as primary (list_id)
  if (list_ids && list_ids.length > 0) {
    await setSetting("clickup_list_ids", JSON.stringify(list_ids));
    // Keep single-list fields in sync with the first list for backward compat
    await setSetting("clickup_list_id", list_ids[0]!.id);
    await setSetting("clickup_list_name", list_ids[0]!.name);
  } else if (list_id) {
    await setSetting("clickup_list_id", list_id);
    if (list_name) await setSetting("clickup_list_name", list_name);
    // Rewrite list_ids array to match single selection
    await setSetting("clickup_list_ids", JSON.stringify([{ id: list_id, name: list_name ?? list_id }]));
  }

  const savedListIds = await getSetting("clickup_list_ids");
  res.json({ ok: true, clickup_user: cuUser, list_ids: savedListIds ? JSON.parse(savedListIds) : [] });
});

// ─── GET /api/clickup/workspaces ─────────────────────────────────────────────

router.get("/clickup/workspaces", requireAuth, requireRole("admin"), async (_req, res) => {
  const token = await getToken();
  if (!token) {
    res.status(400).json({ error: "ClickUp token not configured." });
    return;
  }
  try {
    const teams = await getTeams(token);
    res.json({ teams });
  } catch (err: any) {
    res.status(err.statusCode ?? 502).json({ error: err.message ?? "Failed to fetch workspaces" });
  }
});

// ─── GET /api/clickup/spaces/:teamId ─────────────────────────────────────────

router.get("/clickup/spaces/:teamId", requireAuth, requireRole("admin"), async (req, res) => {
  const token = await getToken();
  if (!token) {
    res.status(400).json({ error: "ClickUp token not configured." });
    return;
  }
  try {
    const spaces = await getSpaces(token, req.params.teamId!);
    res.json({ spaces });
  } catch (err: any) {
    res.status(err.statusCode ?? 502).json({ error: err.message ?? "Failed to fetch spaces" });
  }
});

// ─── GET /api/clickup/lists/:spaceId ─────────────────────────────────────────

router.get("/clickup/lists/:spaceId", requireAuth, requireRole("admin"), async (req, res) => {
  const token = await getToken();
  if (!token) {
    res.status(400).json({ error: "ClickUp token not configured." });
    return;
  }
  try {
    const lists = await getSpaceLists(token, req.params.spaceId!);
    res.json({ lists });
  } catch (err: any) {
    res.status(err.statusCode ?? 502).json({ error: err.message ?? "Failed to fetch lists" });
  }
});

// ─── GET /api/clickup/import/preview ─────────────────────────────────────────

router.get("/clickup/import/preview", requireAuth, requireRole("admin"), async (req, res) => {
  const token = await getToken();
  if (!token) {
    res.status(400).json({ error: "ClickUp is not configured. Please add your token and choose a list." });
    return;
  }
  // Allow caller to override which list to preview; fall back to the primary list
  const listId = (req.query["list_id"] as string | undefined) || await getDefaultListId();
  if (!listId) {
    res.status(400).json({ error: "No list configured. Please complete ClickUp setup." });
    return;
  }
  try {
    const tasks = await getListTasks(token, listId);
    res.json({
      tasks: tasks.map(t => ({
        id: t.id,
        name: t.name,
        status: t.status?.status ?? "",
        due_date: msToDate(t.due_date),
        assignee_name: t.assignees?.[0]?.username ?? null,
        tags: (t.tags ?? []).map(tag => tag.name).join(", "),
      })),
    });
  } catch (err: any) {
    res.status(err.statusCode ?? 502).json({ error: err.message ?? "Failed to fetch tasks from ClickUp" });
  }
});

// ─── POST /api/clickup/import ────────────────────────────────────────────────

router.post("/clickup/import", requireAuth, requireRole("admin"), async (req, res) => {
  const schema = z.object({
    client_id: z.number().int().positive(),
    tasks: z.array(z.object({
      id: z.string(),
      name: z.string(),
      status: z.string(),
      due_date: z.string().nullable().optional(),
      assignee_name: z.string().nullable().optional(),
      tags: z.string().optional(),
    })),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }

  const { client_id, tasks } = parsed.data;
  let created = 0;
  let skipped = 0;

  for (const t of tasks) {
    // Already linked — skip
    const byId = await db
      .select({ id: tasksTable.id })
      .from(tasksTable)
      .where(eq(tasksTable.clickup_task_id, t.id))
      .limit(1);
    if (byId.length > 0) { skipped++; continue; }

    // Same title in same client — backfill clickup_task_id
    const byTitle = await db
      .select({ id: tasksTable.id, clickup_task_id: tasksTable.clickup_task_id })
      .from(tasksTable)
      .where(and(
        sql`LOWER(TRIM(${tasksTable.title})) = LOWER(TRIM(${t.name}))`,
        eq(tasksTable.client_id, client_id),
      ))
      .limit(1);
    if (byTitle.length > 0) {
      const match = byTitle[0]!;
      if (!match.clickup_task_id) {
        await db.update(tasksTable).set({ clickup_task_id: t.id, tags: t.tags ?? null }).where(eq(tasksTable.id, match.id));
      }
      skipped++;
      continue;
    }

    // Brand-new task
    await db.insert(tasksTable).values({
      title: t.name,
      client_id,
      clickup_task_id: t.id,
      status: cuStatusToLocal(t.status),
      due_date: t.due_date ?? null,
      assigned_to: t.assignee_name ?? null,
      tags: t.tags ?? null,
    });
    created++;
  }

  res.json({ created, skipped });
});

// ─── Core push logic (exported for cron) ─────────────────────────────────────

export async function runClickUpPush(): Promise<{ pushed: number; errors: number; pushedAt: string }> {
  const creds = await getCredentials();
  if (!creds) throw new Error("ClickUp is not configured.");

  const linked = await db
    .select({
      id: tasksTable.id,
      clickup_task_id: tasksTable.clickup_task_id,
      title: tasksTable.title,
      status: tasksTable.status,
      due_date: tasksTable.due_date,
      description: tasksTable.description,
      tags: tasksTable.tags,
    })
    .from(tasksTable)
    .where(isNotNull(tasksTable.clickup_task_id));

  let pushed = 0;
  let errors = 0;

  await Promise.all(linked.map(async task => {
    try {
      await updateTask(creds.token, task.clickup_task_id!, {
        name: task.title,
        description: task.description ?? undefined,
        due_date: dateToMs(task.due_date),
        status: localStatusToCU(task.status),
        tags: task.tags ? task.tags.split(",").map(t => t.trim()).filter(Boolean) : [],
      });
      pushed++;
    } catch {
      errors++;
    }
  }));

  const pushedAt = new Date().toISOString();
  await setSetting("clickup_last_sync_at", pushedAt);
  return { pushed, errors, pushedAt };
}

// ─── GET /api/clickup/sync/status ────────────────────────────────────────────

router.get("/clickup/sync/status", requireAuth, requireRole("admin"), async (_req, res) => {
  const lastSyncAt = await getSetting("clickup_last_sync_at");
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
    .from(tasksTable)
    .where(isNotNull(tasksTable.clickup_task_id));
  res.json({ last_sync_at: lastSyncAt, linked_count: count });
});

// ─── POST /api/clickup/sync ───────────────────────────────────────────────────

router.post("/clickup/sync", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const result = await runClickUpPush();
    res.json(result);
  } catch (err: any) {
    res.status(502).json({ error: err.message ?? "Sync failed" });
  }
});

// ─── POST /api/clickup/webhook/register ──────────────────────────────────────

router.post("/clickup/webhook/register", requireAuth, requireRole("admin"), async (req, res) => {
  const schema = z.object({ endpoint: z.string().url().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid endpoint URL." });
    return;
  }

  const token = await getToken();
  if (!token) {
    res.status(400).json({ error: "ClickUp token not configured." });
    return;
  }

  const teamId = await getSetting("clickup_team_id");
  if (!teamId) {
    res.status(400).json({ error: "ClickUp team/workspace not configured." });
    return;
  }

  // Build the endpoint URL — prefer the caller-supplied override, otherwise derive
  // from REPLIT_DEV_DOMAIN (development) or HOST env var (production).
  let endpoint = parsed.data.endpoint;
  if (!endpoint) {
    const replitDomain = process.env["REPLIT_DEV_DOMAIN"];
    const host = process.env["HOST"] ?? process.env["RAILWAY_STATIC_URL"];
    if (replitDomain) {
      endpoint = `https://${replitDomain}/api/clickup/webhook`;
    } else if (host) {
      endpoint = `${host.startsWith("http") ? host : `https://${host}`}/api/clickup/webhook`;
    } else {
      res.status(400).json({ error: "Could not determine public webhook URL. Please supply an endpoint URL manually." });
      return;
    }
  }

  try {
    // Delete existing webhook if any
    const existingId = await getSetting("clickup_webhook_id");
    if (existingId) {
      try { await deleteWebhook(token, existingId); } catch { /* ignore */ }
    }

    const result = await registerWebhook(token, teamId, endpoint);
    await setSetting("clickup_webhook_id", result.id);
    if (result.secret) await setSetting("clickup_webhook_secret", result.secret);

    res.json({ ok: true, webhook_id: result.id, endpoint, secret_saved: !!result.secret });
  } catch (err: any) {
    res.status(err.statusCode ?? 502).json({ error: err.message ?? "Failed to register webhook" });
  }
});

// ─── DELETE /api/clickup/webhook ─────────────────────────────────────────────

router.delete("/clickup/webhook", requireAuth, requireRole("admin"), async (_req, res) => {
  const token = await getToken();
  const webhookId = await getSetting("clickup_webhook_id");
  if (!token || !webhookId) {
    res.status(400).json({ error: "No webhook configured." });
    return;
  }
  try {
    await deleteWebhook(token, webhookId);
    await setSetting("clickup_webhook_id", "");
    res.json({ ok: true });
  } catch (err: any) {
    res.status(err.statusCode ?? 502).json({ error: err.message ?? "Failed to delete webhook" });
  }
});

// ─── POST /api/clickup/webhook ───────────────────────────────────────────────
// Receives real-time events from ClickUp. No session auth — verified by signature.

router.post("/clickup/webhook", async (req: Request, res: Response) => {
  // Verify signature if we have a secret stored
  const webhookSecret = await getSetting("clickup_webhook_secret");
  if (webhookSecret) {
    const signature = req.headers["x-signature"] as string | undefined;
    if (signature) {
      const expected = crypto
        .createHmac("sha256", webhookSecret)
        .update(JSON.stringify(req.body))
        .digest("hex");
      if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) {
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
    }
  }

  // Acknowledge immediately
  res.status(200).json({ received: true });

  // Process asynchronously
  const event = req.body as {
    event: string;
    task_id?: string;
    history_items?: Array<{
      field: string;
      before: unknown;
      after: unknown;
    }>;
  };

  if (!event.task_id) return;

  // Find the local task linked to this ClickUp task
  const [localTask] = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      status: tasksTable.status,
      due_date: tasksTable.due_date,
      tags: tasksTable.tags,
    })
    .from(tasksTable)
    .where(eq(tasksTable.clickup_task_id, event.task_id))
    .limit(1);

  if (!localTask) return;

  const updates: Partial<{
    title: string;
    status: "Not Started" | "Pending" | "Confirmed" | "In Progress" | "Completed";
    due_date: string | null;
    tags: string | null;
  }> = {};

  switch (event.event) {
    case "taskNameUpdated": {
      const after = event.history_items?.[0]?.after as string | undefined;
      if (after && after !== localTask.title) updates.title = after;
      break;
    }

    case "taskStatusUpdated": {
      const afterObj = event.history_items?.[0]?.after as { status: string } | undefined;
      if (afterObj?.status) {
        const mapped = cuStatusToLocal(afterObj.status) as typeof updates.status;
        if (mapped !== localTask.status) updates.status = mapped;
      }
      break;
    }

    case "taskDueDateUpdated": {
      const afterMs = event.history_items?.[0]?.after as string | number | null | undefined;
      const newDate = msToDate(afterMs);
      if (newDate !== localTask.due_date) updates.due_date = newDate;
      break;
    }

    case "taskUpdated": {
      // Generic update — look through all history items
      for (const item of event.history_items ?? []) {
        if (item.field === "name" && typeof item.after === "string") {
          updates.title = item.after;
        }
        if (item.field === "status") {
          const afterObj = item.after as { status: string } | null;
          if (afterObj?.status) {
            updates.status = cuStatusToLocal(afterObj.status) as typeof updates.status;
          }
        }
        if (item.field === "due_date") {
          updates.due_date = msToDate(item.after as string | number | null);
        }
      }
      break;
    }

    case "taskTagUpdated": {
      // Tags are not detailed in history — refetch from ClickUp
      try {
        const token = await getToken();
        if (token) {
          const tasks = await getListTasks(token, await getDefaultListId() ?? "");
          const cuTask = tasks.find(t => t.id === event.task_id);
          if (cuTask) {
            const tagStr = (cuTask.tags ?? []).map(t => t.name).join(", ") || null;
            if (tagStr !== localTask.tags) updates.tags = tagStr;
          }
        }
      } catch { /* best-effort */ }
      break;
    }

    case "taskCommentPosted": {
      // Pull latest comment from ClickUp and store it locally if not already present
      try {
        const token = await getToken();
        if (!token) break;
        const cuComments = await getTaskComments(token, event.task_id);
        if (cuComments.length === 0) break;
        const latest = cuComments[cuComments.length - 1]!;
        // Skip if already imported
        const existing = await db
          .select({ id: taskCommentsTable.id })
          .from(taskCommentsTable)
          .where(eq(taskCommentsTable.clickup_comment_id, latest.id))
          .limit(1);
        if (existing.length > 0) break;

        await db.insert(taskCommentsTable).values({
          task_id: localTask.id,
          author_name: latest.user?.username ?? "ClickUp User",
          author_role: "team_member",
          comment: latest.comment_text,
          clickup_comment_id: latest.id,
        });
      } catch { /* best-effort */ }
      break;
    }
  }

  if (Object.keys(updates).length > 0) {
    // Auto-set completed_date when status becomes Completed
    const extra: Record<string, unknown> = {};
    if (updates.status === "Completed") {
      extra["completed_date"] = new Date().toISOString().split("T")[0]!;
    } else if (updates.status && updates.status !== "Completed") {
      extra["completed_date"] = null;
    }

    await db
      .update(tasksTable)
      .set({ ...updates, ...extra })
      .where(eq(tasksTable.id, localTask.id));
  }
});

export default router;
