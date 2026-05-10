import { Router, type Request, type Response, type IRouter } from "express";
import { db } from "@workspace/db";
import { tasksTable, taskCommentsTable, clientsTable, usersTable } from "@workspace/db";
import { eq, ilike } from "drizzle-orm";

const router: IRouter = Router();

// ── POST /api/zapier-webhook ──────────────────────────────────────────────────
//
// Accepts a simple JSON payload from Zapier and creates a task in the system.
//
// Expected headers:
//   x-webhook-secret: <value matching WEBHOOK_SECRET env var>
//
// Expected body fields:
//   subject  (string, required) — becomes the task title
//   client   (string, optional) — client name or email used to look up the client
//   notes    (string, optional) — stored as the task description and as an initial comment
//   status   (string, optional) — defaults to "Not Started"
//   due_date (string, optional) — YYYY-MM-DD format

router.post("/zapier-webhook", async (req: Request, res: Response) => {

  // ── 1. Security ─────────────────────────────────────────────────────────────
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const provided = req.headers["x-webhook-secret"];
    console.log("[zapier-webhook] Auth check — header present:", !!provided);
    if (!provided || provided !== secret) {
      console.warn("[zapier-webhook] Rejected — invalid or missing x-webhook-secret");
      res.status(401).json({ success: false, error: "Unauthorized" });
      return;
    }
  } else {
    console.warn("[zapier-webhook] WARNING: WEBHOOK_SECRET env var is not set — endpoint is unprotected!");
  }

  // ── 2. Log incoming payload ──────────────────────────────────────────────────
  const body = req.body as Record<string, unknown>;
  console.log("[zapier-webhook] Incoming request body:", JSON.stringify(body, null, 2));

  // ── 3. Validate required fields ─────────────────────────────────────────────
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  if (!subject) {
    console.warn("[zapier-webhook] Rejected — missing required field: subject");
    res.status(400).json({ success: false, error: "Field 'subject' is required" });
    return;
  }

  // ── 4. Parse optional fields ─────────────────────────────────────────────────
  const clientRaw  = typeof body.client   === "string" ? body.client.trim()   : null;
  const notes      = typeof body.notes    === "string" ? body.notes.trim()    : null;
  const dueDateRaw = typeof body.due_date === "string" ? body.due_date.trim() : null;
  const statusRaw  = typeof body.status   === "string" ? body.status.trim()   : null;

  // Accepted status values — default to "Not Started" if absent or unrecognised
  const VALID_STATUSES = ["Not Started", "To Discuss", "Pending", "Awaiting Reply", "In Progress", "Needs SMR Review", "Confirmed", "Completed", "Blocked"];
  const status = statusRaw && VALID_STATUSES.includes(statusRaw) ? statusRaw : "Not Started";

  // Basic YYYY-MM-DD validation
  const due_date = dueDateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw) ? dueDateRaw : undefined;

  // ── 5. Resolve client ────────────────────────────────────────────────────────
  // client_id is required by the database (NOT NULL) — every task must belong
  // to a client. We require a match; if none is found we return 422.
  let clientId: number | null = null;
  let clientName: string | null = null;

  if (!clientRaw) {
    console.warn("[zapier-webhook] Rejected — 'client' field is required (tasks must belong to a client)");
    res.status(422).json({
      success: false,
      error: "Field 'client' is required. Provide the client's name or email address.",
    });
    return;
  }

  const isEmail = clientRaw.includes("@");
  const [match] = await db
    .select({ id: clientsTable.id, name: clientsTable.name })
    .from(clientsTable)
    .where(
      isEmail
        ? ilike(clientsTable.email, clientRaw)
        : ilike(clientsTable.name, `%${clientRaw}%`)
    )
    .limit(1);

  if (match) {
    clientId = match.id;
    clientName = match.name;
    console.log("[zapier-webhook] Client matched:", { id: clientId, name: clientName });
  } else {
    console.warn("[zapier-webhook] Rejected — no client found for:", clientRaw);
    res.status(422).json({
      success: false,
      error: `No client found matching '${clientRaw}'. Use the exact client name or email address as stored in your system.`,
    });
    return;
  }

  // ── 6. Resolve admin user to assign the task to ──────────────────────────────
  const [adminUser] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"))
    .limit(1);

  // ── 7. Insert task ────────────────────────────────────────────────────────────
  const [created] = await db
    .insert(tasksTable)
    .values({
      title:       subject,
      description: notes ?? undefined,
      client_id:   clientId ?? undefined,
      assigned_to: adminUser?.name ?? undefined,
      status,
      due_date,
    })
    .returning({ id: tasksTable.id, title: tasksTable.title });

  console.log("[zapier-webhook] Task created:", {
    id:     created?.id,
    title:  created?.title,
    client: clientName,
    status,
  });

  // ── 8. Add notes as an initial comment ───────────────────────────────────────
  if (created?.id && notes && notes.length > 0) {
    try {
      await db.insert(taskCommentsTable).values({
        task_id:     created.id,
        user_id:     adminUser?.id ?? null,
        author_name: adminUser?.name ?? "Zapier",
        author_role: "admin",
        comment:     `📋 Via Zapier:\n\n${notes.slice(0, 2000)}`,
      });
    } catch (err) {
      console.warn("[zapier-webhook] Could not save notes as comment:", err);
    }
  }

  // ── 9. Respond ────────────────────────────────────────────────────────────────
  res.status(200).json({
    success:  true,
    task_id:  created?.id ?? null,
    title:    created?.title ?? subject,
    client:   clientName,
    status,
  });
});

export default router;
