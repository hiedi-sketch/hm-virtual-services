import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientsTable, tasksTable, timeEntriesTable, invoicesTable, leadsTable } from "@workspace/db";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth";

const router: IRouter = Router();

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells
    .map(c => {
      const s = c == null ? "" : String(c);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    })
    .join(",");
}

function csvResponse(
  res: import("express").Response,
  filename: string,
  rows: string[]
) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(rows.join("\r\n") + "\r\n");
}

// ── Client Hours ───────────────────────────────────────────────────────────
router.get("/reports/client-hours", requireAdmin, async (req, res) => {
  const clients = await db.select().from(clientsTable).orderBy(clientsTable.name);

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const monthStart = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(Date.UTC(y, m + 1, 1));
  const monthEnd = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`;

  const timeByClient = await db
    .select({
      client_id: timeEntriesTable.client_id,
      total_minutes: sql<number>`coalesce(sum(${timeEntriesTable.duration_minutes}), 0)`,
    })
    .from(timeEntriesTable)
    .where(and(gte(timeEntriesTable.date, monthStart), lt(timeEntriesTable.date, monthEnd)))
    .groupBy(timeEntriesTable.client_id);

  const minuteMap: Record<number, number> = {};
  for (const row of timeByClient) minuteMap[row.client_id] = Number(row.total_minutes) || 0;

  const header = csvRow(["Client Name", "Service Type", "Package Hours/mo", "Hours Used", "Hours Remaining", "Monthly Fee ($)", "Month"]);
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const rows = [
    header,
    ...clients.map(c => {
      const mins = minuteMap[c.id] || 0;
      const used = Math.round((mins / 60) * 10) / 10;
      const remaining = Math.round((c.monthly_hour_budget - used) * 10) / 10;
      return csvRow([c.name, c.service_type, c.monthly_hour_budget, used, remaining, c.monthly_fee.toFixed(2), monthLabel]);
    }),
  ];

  csvResponse(res, `client-hours-${monthStart.slice(0, 7)}.csv`, rows);
});

// ── Tasks ──────────────────────────────────────────────────────────────────
router.get("/reports/tasks", requireAdmin, async (req, res) => {
  const tasks = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      status: tasksTable.status,
      due_date: tasksTable.due_date,
      assigned_to: tasksTable.assigned_to,
      recurrence: tasksTable.recurrence,
      client_name: clientsTable.name,
    })
    .from(tasksTable)
    .leftJoin(clientsTable, eq(tasksTable.client_id, clientsTable.id))
    .orderBy(clientsTable.name, tasksTable.due_date);

  const header = csvRow(["Task ID", "Title", "Client", "Status", "Due Date", "Assigned To", "Recurrence"]);
  const rows = [
    header,
    ...tasks.map(t =>
      csvRow([t.id, t.title, t.client_name ?? "", t.status, t.due_date ?? "", t.assigned_to ?? "", t.recurrence ?? ""])
    ),
  ];

  const date = new Date().toISOString().split("T")[0];
  csvResponse(res, `tasks-${date}.csv`, rows);
});

// ── Invoices ───────────────────────────────────────────────────────────────
router.get("/reports/invoices", requireAdmin, async (req, res) => {
  const invoices = await db
    .select({
      id: invoicesTable.id,
      amount: invoicesTable.amount,
      status: invoicesTable.status,
      due_date: invoicesTable.due_date,
      description: invoicesTable.description,
      client_name: clientsTable.name,
    })
    .from(invoicesTable)
    .leftJoin(clientsTable, eq(invoicesTable.client_id, clientsTable.id))
    .orderBy(clientsTable.name, invoicesTable.due_date);

  const header = csvRow(["Invoice ID", "Client", "Amount ($)", "Status", "Due Date", "Description"]);
  const rows = [
    header,
    ...invoices.map(i =>
      csvRow([i.id, i.client_name ?? "", i.amount.toFixed(2), i.status, i.due_date, i.description ?? ""])
    ),
  ];

  const date = new Date().toISOString().split("T")[0];
  csvResponse(res, `invoices-${date}.csv`, rows);
});

// ── Time Entries ────────────────────────────────────────────────────────────
router.get("/reports/time-entries", requireAdmin, async (req, res) => {
  const entries = await db
    .select({
      id: timeEntriesTable.id,
      date: timeEntriesTable.date,
      client_name: clientsTable.name,
      task_title: tasksTable.title,
      duration_minutes: timeEntriesTable.duration_minutes,
      started_at: timeEntriesTable.started_at,
      ended_at: timeEntriesTable.ended_at,
    })
    .from(timeEntriesTable)
    .leftJoin(clientsTable, eq(timeEntriesTable.client_id, clientsTable.id))
    .leftJoin(tasksTable, eq(timeEntriesTable.task_id, tasksTable.id))
    .orderBy(timeEntriesTable.date, timeEntriesTable.id);

  const header = csvRow(["Entry ID", "Date", "Client", "Task", "Duration (min)", "Hours", "Started At", "Ended At"]);
  const rows = [
    header,
    ...entries.map(e =>
      csvRow([
        e.id,
        e.date,
        e.client_name ?? "",
        e.task_title ?? "",
        e.duration_minutes,
        Math.round((e.duration_minutes / 60) * 100) / 100,
        e.started_at ?? "",
        e.ended_at ?? "",
      ])
    ),
  ];

  const date = new Date().toISOString().split("T")[0];
  csvResponse(res, `time-entries-${date}.csv`, rows);
});

// ── Leads ──────────────────────────────────────────────────────────────────
router.get("/reports/leads", requireAdmin, async (req, res) => {
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
    .orderBy(leadsTable.status, leadsTable.name);

  const header = csvRow(["Lead ID", "Name", "Email", "Status", "Est. Value ($)", "Follow-up Date", "Notes"]);
  const rows = [
    header,
    ...leads.map(l =>
      csvRow([
        l.id,
        l.name,
        l.email ?? "",
        l.status,
        l.estimated_value != null ? l.estimated_value.toFixed(2) : "",
        l.follow_up_date ?? "",
        l.notes ?? "",
      ])
    ),
  ];

  const date = new Date().toISOString().split("T")[0];
  csvResponse(res, `leads-${date}.csv`, rows);
});

export default router;
