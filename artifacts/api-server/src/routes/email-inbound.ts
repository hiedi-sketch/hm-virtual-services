import { Router, type IRouter, type Request, type Response } from "express";
import multer from "multer";
import { db } from "@workspace/db";
import { tasksTable, clientsTable, usersTable, appSettingsTable } from "@workspace/db";
import { eq, ilike } from "drizzle-orm";
import { logger } from "../lib/logger";
import { sendMail, isMailConfigured } from "../lib/mailer";

const router: IRouter = Router();

// multer — memory storage, no file uploads expected, just form fields
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const rows = await db
    .select({ value: appSettingsTable.value })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  const existing = await db
    .select({ key: appSettingsTable.key })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, key))
    .limit(1);
  if (existing.length > 0) {
    await db.update(appSettingsTable).set({ value }).where(eq(appSettingsTable.key, key));
  } else {
    await db.insert(appSettingsTable).values({ key, value });
  }
}

/** Extract plain email from "Display Name <email@address.com>" format */
function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim().toLowerCase();
  return from.trim().toLowerCase();
}

/** Extract display name from "Display Name <email@address.com>" format */
function extractDisplayName(from: string): string | null {
  const match = from.match(/^(.+?)\s*</);
  if (match?.[1]) return match[1].trim().replace(/^["']|["']$/g, "");
  return null;
}

/** Strip excessive whitespace and trim body text */
function cleanBody(text: string, maxLen = 2000): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxLen);
}

// ── POST /api/email/inbound ───────────────────────────────────────────────────
// Accepts Mailgun inbound route webhooks (multipart/form-data)
// Also accepts application/json with the same fields for flexibility.
// Security: caller must pass ?token=<EMAIL_INBOUND_SECRET> in the URL.

router.post(
  "/email/inbound",
  upload.any(),
  async (req: Request, res: Response) => {
    // ── 1. Verify secret token ─────────────────────────────────────────────
    const secret = process.env.EMAIL_INBOUND_SECRET;
    if (secret) {
      const provided = req.query["token"] ?? req.headers["x-webhook-secret"];
      if (!provided || provided !== secret) {
        logger.warn("Email inbound: rejected — invalid token");
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
    }

    // ── 2. Parse fields (multipart OR json) ───────────────────────────────
    // multer puts form fields into req.body when content-type is multipart/form-data
    // express.json() handles application/json
    const body = req.body as Record<string, string | undefined>;

    const rawFrom: string =
      body["sender"] ?? body["from"] ?? body["From"] ?? "";
    const subject: string =
      (body["subject"] ?? body["Subject"] ?? "").trim() || "(no subject)";
    const bodyText: string =
      body["stripped-text"] ??     // Mailgun removes quoted text
      body["body-plain"] ??         // Mailgun full plain text
      body["text"] ??               // SendGrid
      body["plain"] ?? "";
    const bodyHtml: string =
      body["body-html"] ?? body["html"] ?? "";

    const senderEmail = extractEmail(rawFrom);
    const senderName = extractDisplayName(rawFrom) ?? senderEmail;

    logger.info({ senderEmail, subject }, "Email inbound: received");

    if (!rawFrom) {
      res.status(422).json({ error: "Missing sender field" });
      return;
    }

    // ── 3. Identify client by sender email ────────────────────────────────
    let clientId: number | null = null;
    let clientName: string | null = null;

    // Try matching against clients table
    const matchedClients = await db
      .select({ id: clientsTable.id, name: clientsTable.name, email: clientsTable.email })
      .from(clientsTable)
      .where(ilike(clientsTable.email, senderEmail))
      .limit(1);

    if (matchedClients.length > 0) {
      clientId = matchedClients[0]!.id;
      clientName = matchedClients[0]!.name;
    } else {
      // Check if a user account with that email exists and has a client_id
      const matchedUsers = await db
        .select({ client_id: usersTable.client_id, name: usersTable.name })
        .from(usersTable)
        .where(ilike(usersTable.email, senderEmail))
        .limit(1);
      if (matchedUsers.length > 0 && matchedUsers[0]!.client_id) {
        clientId = matchedUsers[0]!.client_id;
        const cl = await db
          .select({ name: clientsTable.name })
          .from(clientsTable)
          .where(eq(clientsTable.id, clientId))
          .limit(1);
        clientName = cl[0]?.name ?? senderName;
      }
    }

    // If still no client, try the configured default client
    if (!clientId) {
      const defaultId = await getSetting("email_task_default_client_id");
      if (defaultId) {
        const cl = await db
          .select({ id: clientsTable.id, name: clientsTable.name })
          .from(clientsTable)
          .where(eq(clientsTable.id, Number(defaultId)))
          .limit(1);
        if (cl.length > 0) {
          clientId = cl[0]!.id;
          clientName = cl[0]!.name;
        }
      }
    }

    // Last resort: pick the first client in the DB
    if (!clientId) {
      const first = await db
        .select({ id: clientsTable.id, name: clientsTable.name })
        .from(clientsTable)
        .orderBy(clientsTable.id)
        .limit(1);
      if (first.length > 0) {
        clientId = first[0]!.id;
        clientName = first[0]!.name;
      }
    }

    if (!clientId) {
      logger.warn({ senderEmail }, "Email inbound: no clients exist, cannot create task");
      res.status(422).json({ error: "No clients configured" });
      return;
    }

    // ── 4. Find admin user to assign task to ──────────────────────────────
    const admins = await db
      .select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"))
      .limit(1);
    const assignTo = admins[0]?.name ?? null;

    // ── 5. Build task description ─────────────────────────────────────────
    const senderLine = `From: ${senderName} <${senderEmail}>`;
    const rawDescription = cleanBody(bodyText || bodyHtml.replace(/<[^>]+>/g, " "));
    const description = [senderLine, rawDescription].filter(Boolean).join("\n\n");

    // ── 6. Create task ────────────────────────────────────────────────────
    const [created] = await db.insert(tasksTable).values({
      title: subject,
      description,
      client_id: clientId,
      assigned_to: assignTo,
      status: "Pending",
    }).returning({ id: tasksTable.id });

    logger.info(
      { taskId: created?.id, clientId, clientName, senderEmail },
      "Email inbound: task created"
    );

    // ── 7. Notify admin by email ──────────────────────────────────────────
    if (isMailConfigured() && admins[0]?.email) {
      const adminEmail = admins[0].email;
      await sendMail(
        adminEmail,
        `New task from email: ${subject}`,
        `
          <p>A new task was created from an incoming email.</p>
          <table style="border-collapse:collapse;width:100%;font-size:14px;">
            <tr><td style="padding:6px 12px;font-weight:600;color:#266b75;width:140px">From</td><td style="padding:6px 12px">${senderName} &lt;${senderEmail}&gt;</td></tr>
            <tr style="background:#f8fafc"><td style="padding:6px 12px;font-weight:600;color:#266b75">Subject</td><td style="padding:6px 12px">${subject}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:600;color:#266b75">Client</td><td style="padding:6px 12px">${clientName ?? "Unknown"}</td></tr>
            <tr style="background:#f8fafc"><td style="padding:6px 12px;font-weight:600;color:#266b75">Task ID</td><td style="padding:6px 12px">#${created?.id}</td></tr>
          </table>
          ${rawDescription ? `<p style="margin-top:16px;color:#475569;font-size:13px;border-left:3px solid #266b75;padding-left:12px;">${rawDescription.replace(/\n/g, "<br>")}</p>` : ""}
        `
      );
    }

    res.status(200).json({ ok: true, task_id: created?.id, client: clientName });
  }
);

// ── GET /api/email/inbound/settings ──────────────────────────────────────────
// Returns the current default client setting (admin only)
import { requireAuth, requireRole } from "../middleware/auth";

router.get("/email/inbound/settings", requireAuth, requireRole("admin"), async (_req, res) => {
  const defaultClientId = await getSetting("email_task_default_client_id");
  const secret = process.env.EMAIL_INBOUND_SECRET ?? null;
  res.json({
    default_client_id: defaultClientId ? Number(defaultClientId) : null,
    has_secret: !!secret,
  });
});

router.post("/email/inbound/settings", requireAuth, requireRole("admin"), async (req, res) => {
  const { default_client_id } = req.body as { default_client_id?: number | null };
  if (default_client_id != null) {
    await setSetting("email_task_default_client_id", String(default_client_id));
  } else {
    // clear it
    await db.delete(appSettingsTable).where(eq(appSettingsTable.key, "email_task_default_client_id"));
  }
  res.json({ ok: true });
});

export default router;
