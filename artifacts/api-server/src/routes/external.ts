import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { apiKeysTable, clientsTable, tasksTable, timeEntriesTable, leadsTable, invoicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// ── API key authentication middleware ────────────────────────────────────────
async function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const header = req.headers["x-api-key"] as string | undefined
    ?? (req.headers["authorization"]?.startsWith("Bearer ")
      ? req.headers["authorization"].slice(7)
      : undefined);

  if (!header) {
    res.status(401).json({ error: "Missing API key. Provide via X-API-Key header or Authorization: Bearer <key>." });
    return;
  }

  const row = await db
    .select({ id: apiKeysTable.id })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.key, header))
    .limit(1);

  if (row.length === 0) {
    res.status(401).json({ error: "Invalid API key." });
    return;
  }

  next();
}

// ── GET /api/external/tasks ──────────────────────────────────────────────────
router.get("/external/tasks", requireApiKey, async (_req, res) => {
  const tasks = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      status: tasksTable.status,
      due_date: tasksTable.due_date,
      assigned_to: tasksTable.assigned_to,
      recurrence: tasksTable.recurrence,
      client_id: tasksTable.client_id,
      client_name: clientsTable.name,
    })
    .from(tasksTable)
    .leftJoin(clientsTable, eq(tasksTable.client_id, clientsTable.id))
    .orderBy(tasksTable.due_date, tasksTable.id);

  res.json({ data: tasks, count: tasks.length });
});

// ── GET /api/external/clients ────────────────────────────────────────────────
router.get("/external/clients", requireApiKey, async (_req, res) => {
  const clients = await db
    .select({
      id: clientsTable.id,
      name: clientsTable.name,
      email: clientsTable.email,
      service_type: clientsTable.service_type,
      monthly_hour_budget: clientsTable.monthly_hour_budget,
      monthly_fee: clientsTable.monthly_fee,
      status: clientsTable.status,
    })
    .from(clientsTable)
    .orderBy(clientsTable.name);

  res.json({ data: clients, count: clients.length });
});

// ── GET /api/external/time ───────────────────────────────────────────────────
router.get("/external/time", requireApiKey, async (_req, res) => {
  const entries = await db
    .select({
      id: timeEntriesTable.id,
      date: timeEntriesTable.date,
      duration_minutes: timeEntriesTable.duration_minutes,
      started_at: timeEntriesTable.started_at,
      ended_at: timeEntriesTable.ended_at,
      client_id: timeEntriesTable.client_id,
      task_id: timeEntriesTable.task_id,
      user_id: timeEntriesTable.user_id,
      client_name: clientsTable.name,
    })
    .from(timeEntriesTable)
    .leftJoin(clientsTable, eq(timeEntriesTable.client_id, clientsTable.id))
    .orderBy(timeEntriesTable.date, timeEntriesTable.id);

  res.json({ data: entries, count: entries.length });
});

// ── GET /api/external/leads ──────────────────────────────────────────────────
router.get("/external/leads", requireApiKey, async (_req, res) => {
  const leads = await db
    .select({
      id: leadsTable.id,
      name: leadsTable.name,
      email: leadsTable.email,
      status: leadsTable.status,
      estimated_value: leadsTable.estimated_value,
      follow_up_date: leadsTable.follow_up_date,
      notes: leadsTable.notes,
    })
    .from(leadsTable)
    .orderBy(leadsTable.status, leadsTable.id);

  res.json({ data: leads, count: leads.length });
});

// ── GET /api/external/invoices ───────────────────────────────────────────────
router.get("/external/invoices", requireApiKey, async (_req, res) => {
  const invoices = await db
    .select({
      id: invoicesTable.id,
      amount: invoicesTable.amount,
      status: invoicesTable.status,
      due_date: invoicesTable.due_date,
      description: invoicesTable.description,
      client_id: invoicesTable.client_id,
      client_name: clientsTable.name,
    })
    .from(invoicesTable)
    .leftJoin(clientsTable, eq(invoicesTable.client_id, clientsTable.id))
    .orderBy(invoicesTable.due_date, invoicesTable.id);

  res.json({ data: invoices, count: invoices.length });
});

export default router;
