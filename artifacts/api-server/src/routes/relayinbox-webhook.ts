import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { tasksTable, taskCommentsTable, usersTable, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function getSetting(key: string): Promise<string | null> {
  const rows = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

async function upsertSetting(key: string, value: string): Promise<void> {
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

// GET /api/settings/relayinbox — check whether a secret is configured (admin only)
router.get("/settings/relayinbox", requireAuth, requireRole("admin"), async (_req, res) => {
  const secret = await getSetting("relayinbox_secret");
  res.json({ hasSecret: !!secret });
});

// PUT /api/settings/relayinbox — save the secret (admin only)
router.put("/settings/relayinbox", requireAuth, requireRole("admin"), async (req, res) => {
  const { secret } = req.body as { secret?: string };
  if (!secret || typeof secret !== "string" || secret.trim().length < 8) {
    res.status(400).json({ error: "Secret must be at least 8 characters." });
    return;
  }
  await upsertSetting("relayinbox_secret", secret.trim());
  res.json({ ok: true });
});

// POST /api/webhooks/relayinbox — receive a task pushed from RelayInbox
router.post("/webhooks/relayinbox", async (req: Request, res: Response) => {
  // 1. Validate Bearer token
  const storedSecret = await getSetting("relayinbox_secret");
  if (storedSecret) {
    const authHeader = (req.headers["authorization"] as string) ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (token !== storedSecret) {
      logger.warn("[relayinbox] Rejected — invalid or missing Bearer token");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } else {
    logger.warn("[relayinbox] WARNING: no secret configured — endpoint is unprotected");
  }

  // 2. Parse the RelayInbox payload
  const body = req.body as Record<string, any>;
  const task = body?.task as { title?: string; description?: string; link?: string } | undefined;
  const email = body?.email as {
    subject?: string; snippet?: string;
    from?: { name?: string; email?: string }; date?: string;
  } | undefined;

  const title = task?.title?.trim() || email?.subject?.trim() || "Task from RelayInbox";

  // Build a rich description from available fields
  const descParts: string[] = [];
  if (task?.description) descParts.push(task.description.trim());
  if (email?.from) {
    const sender = [email.from.name, email.from.email ? `<${email.from.email}>` : ""].filter(Boolean).join(" ");
    if (sender) descParts.push(`From: ${sender}`);
  }
  if (email?.snippet) descParts.push(`\n${email.snippet.trim()}`);
  if (task?.link) descParts.push(`\nOriginal email: ${task.link}`);
  const description = descParts.length > 0 ? descParts.join("\n") : undefined;

  // 3. Resolve the admin user to assign the task to
  const [adminUser] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .limit(1);

  // 4. Insert the task (no client_id — admin assigns it later)
  const [created] = await db
    .insert(tasksTable)
    .values({
      title,
      description,
      status: "Not Started",
      assigned_to: adminUser?.name ?? undefined,
    })
    .returning({ id: tasksTable.id, title: tasksTable.title });

  logger.info({ id: created?.id, title: created?.title }, "[relayinbox] Task created");

  // 5. Save email context as a comment for easy reference
  if (created?.id) {
    const fromLine = email?.from?.email
      ? ` — from ${[email.from.name, `<${email.from.email}>`].filter(Boolean).join(" ")}`
      : "";
    const body = [
      task?.description || email?.snippet || "",
      task?.link ? `\nOriginal: ${task.link}` : "",
    ].filter(Boolean).join("");

    if (body) {
      try {
        await db.insert(taskCommentsTable).values({
          task_id: created.id,
          user_id: adminUser?.id ?? null,
          author_name: adminUser?.name ?? "RelayInbox",
          author_role: "admin",
          comment: `📧 Via RelayInbox${fromLine}\n\n${body}`,
        });
      } catch (err) {
        logger.warn({ err }, "[relayinbox] Could not save email comment");
      }
    }
  }

  // 6. Respond — return { id, url } so RelayInbox can link back to the task
  res.status(200).json({
    id: created?.id ?? null,
    url: `${req.protocol}://${req.get("host")}/tasks`,
  });
});

export default router;
