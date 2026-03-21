import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  clientsTable,
  tasksTable,
  invoicesTable,
  timeEntriesTable,
  leadsTable,
} from "@workspace/db";
import { requireAdmin } from "../middleware/auth";

const router: IRouter = Router();

// ── helpers ──────────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    if (v == null) return "";
    const s = String(v);
    // wrap in quotes if the value contains a comma, newline, or quote
    if (s.includes(",") || s.includes("\n") || s.includes('"')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.join(","), ...rows.map(r => headers.map(h => escape(r[h])).join(","))];
  return lines.join("\n");
}

function filename(label: string, ext: string): string {
  const date = new Date().toISOString().split("T")[0];
  return `flowstate-${label}-${date}.${ext}`;
}

// ── JSON full export ──────────────────────────────────────────────────────────

router.get("/backup/json", requireAdmin, async (req, res) => {
  const [clients, tasks, invoices, timeEntries, leads] = await Promise.all([
    db.select().from(clientsTable).orderBy(clientsTable.name),
    db.select().from(tasksTable).orderBy(tasksTable.id),
    db.select().from(invoicesTable).orderBy(invoicesTable.id),
    db.select().from(timeEntriesTable).orderBy(timeEntriesTable.id),
    db.select().from(leadsTable).orderBy(leadsTable.id),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    version: "1",
    tables: { clients, tasks, invoices, time_entries: timeEntries, leads },
  };

  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="${filename("full-export", "json")}"`);
  res.json(payload);
});

// ── CSV exports ───────────────────────────────────────────────────────────────

const CSV_TABLES: Record<string, () => Promise<Record<string, unknown>[]>> = {
  clients: async () => {
    const rows = await db.select().from(clientsTable).orderBy(clientsTable.name);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      service_type: r.service_type,
      monthly_fee: r.monthly_fee,
      monthly_hour_budget: r.monthly_hour_budget,
      bk_fee: r.bk_fee ?? "",
      va_hourly_rate: r.va_hourly_rate ?? "",
      va_hour_limit: r.va_hour_limit ?? "",
    }));
  },
  tasks: async () => {
    const rows = await db.select().from(tasksTable).orderBy(tasksTable.id);
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description ?? "",
      client_id: r.client_id,
      assigned_to: r.assigned_to ?? "",
      status: r.status,
      due_date: r.due_date ?? "",
      recurrence: r.recurrence ?? "",
    }));
  },
  invoices: async () => {
    const rows = await db.select().from(invoicesTable).orderBy(invoicesTable.id);
    return rows.map(r => ({
      id: r.id,
      client_id: r.client_id,
      amount: r.amount,
      status: r.status,
      due_date: r.due_date,
      description: r.description ?? "",
    }));
  },
};

router.get("/backup/csv/:table", requireAdmin, async (req, res) => {
  const table = req.params.table;
  const builder = CSV_TABLES[table];
  if (!builder) {
    res.status(400).json({ error: `Unknown table '${table}'. Supported: ${Object.keys(CSV_TABLES).join(", ")}` });
    return;
  }
  const rows = await builder();
  const csv = toCSV(rows as Record<string, unknown>[]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename(table, "csv")}"`);
  res.send(csv);
});

export default router;
