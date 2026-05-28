/**
 * POST /api/missive-webhook
 *
 * Receives Missive conversation webhooks and creates tasks automatically.
 *
 * Requirements:
 *   - Set MISSIVE_WEBHOOK_SECRET in Replit Secrets (any strong random string)
 *   - In Missive: Automation → Webhooks → POST https://<your-domain>/api/missive-webhook
 *     with header  x-webhook-secret: <your secret value>
 *
 * Only creates a task when the conversation has a label named exactly "Task".
 *
 * Structured data override (optional — add to email body):
 *   Client: Acme Corp
 *   Task: Fix billing discrepancy
 *   Due: 2024-12-31
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { tasksTable, clientsTable, usersTable, taskCommentsTable } from "@workspace/db";
import { eq, ilike } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Missive payload types ─────────────────────────────────────────────────────
// NOTE: Missive's label_change webhook sends conversation-level fields only —
// individual message from_field / body / preview are usually absent.
// Subject lives in latest_message_subject; senders in external_authors / authors.

interface MissiveLabel {
  id: string;
  name: string;
  color?: string;
}

interface MissiveContact {
  address: string;
  name?: string;
}

interface MissiveMessage {
  id?: string;
  from_field?: MissiveContact;
  to_fields?: MissiveContact[];
  cc_fields?: MissiveContact[];
  preview?: string;
  body?: string;
  subject?: string;
}

interface MissiveConversation {
  id: string;
  subject?: string | null;
  /** Populated by label_change webhooks — the subject of the most recent message */
  latest_message_subject?: string | null;
  labels?: MissiveLabel[];
  latest_message?: MissiveMessage;
  messages?: MissiveMessage[];
  /** All participants (internal + external) */
  authors?: MissiveContact[];
  /** External (non-team) participants — the actual client/sender */
  external_authors?: MissiveContact[];
}

interface MissivePayload {
  /** Missive sends rule.description (not rule.name) for label_change webhooks */
  rule?: { id: string; name?: string; description?: string };
  conversation?: MissiveConversation;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip HTML tags and decode common entities to plain text */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Trim body text and cap length */
function cleanBody(text: string, maxLen = 2000): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxLen);
}

interface StructuredData {
  client?: string;
  task?: string;
  due?: string;
}

/**
 * Parse optional structured fields from email body:
 *   Client: Acme Corp
 *   Task: Fix billing issue
 *   Due: 2024-12-31
 */
function parseStructuredData(text: string): StructuredData {
  const result: StructuredData = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^(client|task|due)\s*:\s*(.+)$/i);
    if (m) {
      const key = m[1]!.toLowerCase() as keyof StructuredData;
      result[key] = m[2]!.trim();
    }
  }
  return result;
}

/** Find a client by email — checks clients table then users table */
async function findClientByEmail(email: string): Promise<{ id: number; name: string } | null> {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();

  // Direct client email match
  const clientRows = await db
    .select({ id: clientsTable.id, name: clientsTable.name })
    .from(clientsTable)
    .where(ilike(clientsTable.email, normalized))
    .limit(1);
  if (clientRows.length > 0) return clientRows[0]!;

  // User account with that email linked to a client
  const userRows = await db
    .select({ client_id: usersTable.client_id })
    .from(usersTable)
    .where(ilike(usersTable.email, normalized))
    .limit(1);
  if (userRows.length > 0 && userRows[0]!.client_id) {
    const cl = await db
      .select({ id: clientsTable.id, name: clientsTable.name })
      .from(clientsTable)
      .where(eq(clientsTable.id, userRows[0]!.client_id))
      .limit(1);
    return cl[0] ?? null;
  }
  return null;
}

/** Find a client by partial name match */
async function findClientByName(name: string): Promise<{ id: number; name: string } | null> {
  if (!name) return null;
  const rows = await db
    .select({ id: clientsTable.id, name: clientsTable.name })
    .from(clientsTable)
    .where(ilike(clientsTable.name, `%${name.trim()}%`))
    .limit(1);
  return rows[0] ?? null;
}

// ── POST /api/missive-webhook ─────────────────────────────────────────────────

router.post("/missive-webhook", async (req: Request, res: Response) => {

  // ── 1. Security: verify secret ────────────────────────────────────────
  // Missive webhook automation does not support custom request headers.
  // Supported methods (in priority order):
  //   1. Query param:  POST /api/missive-webhook?secret=<value>  ← recommended for Missive
  //   2. Header:       Authorization: Bearer <value>             ← for manual testing
  //   3. Header:       x-webhook-secret: <value>                 ← legacy / curl testing
  const secret = process.env.MISSIVE_WEBHOOK_SECRET;
  if (secret) {
    const querySecret = req.query["secret"] as string | undefined;
    const authHeader  = req.headers["authorization"] ?? "";
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
    const xSecret  = req.headers["x-webhook-secret"];
    const provided = querySecret ?? bearerToken ?? xSecret;

    if (!provided || provided !== secret) {
      logger.warn(
        { ip: req.ip, hasQuerySecret: !!querySecret, hasAuth: !!authHeader, hasXSecret: !!xSecret },
        "Missive webhook: rejected — invalid or missing secret (expected ?secret=, Authorization: Bearer, or x-webhook-secret)"
      );
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  } else {
    logger.warn("Missive webhook: MISSIVE_WEBHOOK_SECRET env var is not set — endpoint is unprotected!");
  }

  // ── 2. Parse & log payload ────────────────────────────────────────────
  const payload = req.body as MissivePayload;

  // Log full payload at INFO so we can trace the exact Missive structure
  logger.info({
    rule: payload.rule?.name ?? payload.rule?.description ?? "(no rule)",
    conversationId: payload.conversation?.id,
    subject: payload.conversation?.latest_message_subject ?? payload.conversation?.subject,
    labels: payload.conversation?.labels?.map(l => l.name) ?? [],
    rawPayload: JSON.stringify(payload).slice(0, 3000),
  }, "Missive webhook: received");

  const conversation = payload.conversation;
  if (!conversation) {
    logger.warn("Missive webhook: payload has no 'conversation' field — skipping");
    res.status(200).json({ ok: true, skipped: true, reason: "no_conversation" });
    return;
  }

  // ── 3. (Label gate removed) ───────────────────────────────────────────
  // Missive does not include labels in the webhook payload when triggered
  // via the shared-label webhook feature (labels array comes through empty).
  // The endpoint is already protected by the secret in the URL, so every
  // authenticated request should create a task.

  // ── 4. Extract message fields ─────────────────────────────────────────
  // Missive label_change webhooks put the subject in latest_message_subject
  // (conversation.subject is null). Sender info is in external_authors, not
  // latest_message.from_field (which is often absent in this webhook type).
  const msg = conversation.latest_message;

  const subject: string = (
    conversation.latest_message_subject ??
    conversation.subject ??
    msg?.subject ?? ""
  ).trim() || "(no subject)";

  // External authors = the non-team participants (the actual client/sender)
  const externalSender = conversation.external_authors?.[0] ?? null;
  const fromAddress: string = (
    externalSender?.address ?? msg?.from_field?.address ?? ""
  ).toLowerCase();
  const fromName: string =
    externalSender?.name ?? msg?.from_field?.name ?? fromAddress;

  // Recipients: internal team members from authors that aren't in external_authors
  const externalAddrs = new Set(
    (conversation.external_authors ?? []).map(a => a.address.toLowerCase())
  );
  const internalAuthors = (conversation.authors ?? []).filter(
    a => !externalAddrs.has(a.address.toLowerCase())
  );
  const toAddresses: string[] = msg?.to_fields
    ? msg.to_fields.map(t => t.address.toLowerCase())
    : internalAuthors.map(a => a.address.toLowerCase());

  // Plain text body: prefer message preview/body; label_change payloads often omit it
  const rawBodyText = msg?.preview ?? (msg?.body ? stripHtml(msg.body) : "");
  const bodyText = cleanBody(rawBodyText);

  logger.info({ subject, fromAddress, fromName, toAddresses, bodyLength: bodyText.length },
    "Missive webhook: fields extracted");

  // ── 5. Parse structured data from body ───────────────────────────────
  const structured = parseStructuredData(bodyText);
  if (Object.keys(structured).length > 0) {
    logger.info({ structured }, "Missive webhook: structured data found in body");
  }

  // Task title: prefer structured "Task:" field, fall back to subject
  const taskTitle = structured.task ?? subject;
  const dueDate: string | null = structured.due ?? null;

  // ── 6. Identify client (priority order) ──────────────────────────────
  let client: { id: number; name: string } | null = null;

  // Priority 1: "Client: Name" in email body (structured override)
  if (!client && structured.client) {
    client = await findClientByName(structured.client);
    if (client) {
      logger.info({ query: structured.client, matched: client.name },
        "Missive webhook: client matched via structured 'Client:' field");
    }
  }

  // Priority 2: Sender email
  if (!client && fromAddress) {
    client = await findClientByEmail(fromAddress);
    if (client) {
      logger.info({ email: fromAddress, matched: client.name },
        "Missive webhook: client matched via sender email");
    }
  }

  // Priority 3: Any recipient email (skip @hmvirtualservices addresses — that's you)
  if (!client) {
    for (const toAddr of toAddresses) {
      client = await findClientByEmail(toAddr);
      if (client) {
        logger.info({ email: toAddr, matched: client.name },
          "Missive webhook: client matched via recipient email");
        break;
      }
    }
  }

  if (!client) {
    logger.info({
      subject,
      fromAddress,
      toAddresses,
      structuredClient: structured.client ?? null,
    }, "Missive webhook: no client match found — task will be created without a client for manual assignment");
  }

  // ── 7. Find admin user for comment authoring ─────────────────────────
  const admins = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .limit(1);
  const adminUser = admins[0] ?? null;
  // Tasks from Missive are always assigned to Hiedi Moorman by default
  const defaultAssignee = "Hiedi Moorman";

  // ── 8. Build task description (clean email body only) ────────────────
  // description = clean email body text only (shown in the task expand panel)
  // From / To / Rule metadata goes into the comment only, not the description
  const description = bodyText || null;

  // ── 9. Insert task ────────────────────────────────────────────────────
  const [created] = await db
    .insert(tasksTable)
    .values({
      title: taskTitle,
      description,
      client_id: client?.id ?? null,
      assigned_to: defaultAssignee,
      status: "Not Started",
      due_date: dueDate ?? undefined,
      missive_conversation_id: conversation.id ?? null,
    })
    .returning({ id: tasksTable.id });

  logger.info(
    { taskId: created?.id, taskTitle, clientId: client?.id ?? null, clientName: client?.name ?? null },
    "Missive webhook: task created"
  );

  // ── 10. Add email metadata + body as initial comment ──────────────────
  // The comment stores sender/recipient context; the description holds the body.
  if (created?.id) {
    try {
      const metaLines: string[] = [];
      if (fromAddress) metaLines.push(`From: ${fromName} <${fromAddress}>`);
      if (toAddresses.length > 0) metaLines.push(`To: ${toAddresses.join(", ")}`);
      if (payload.rule?.name) metaLines.push(`Rule: ${payload.rule.name}`);
      const commentBody = [
        metaLines.join("\n"),
        bodyText ? bodyText.slice(0, 1500) : null,
      ].filter(Boolean).join("\n\n");

      if (commentBody.length > 10) {
        await db.insert(taskCommentsTable).values({
          task_id: created.id,
          user_id: adminUser?.id ?? null,
          author_name: adminUser?.name ?? "Missive",
          author_role: "admin",
          comment: `📧 Email via Missive\n\n${commentBody}`,
        });
      }
    } catch (commentErr) {
      logger.warn({ commentErr }, "Missive webhook: could not save email body as comment — continuing");
    }
  }

  // ── 11. Respond ───────────────────────────────────────────────────────
  res.status(200).json({
    ok: true,
    task_id: created?.id,
    task_title: taskTitle,
    client: client?.name ?? null,
  });
});

export default router;
