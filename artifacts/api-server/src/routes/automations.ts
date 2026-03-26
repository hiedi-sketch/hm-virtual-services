import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tasksTable, clientsTable, timeEntriesTable } from "@workspace/db";
import { eq, lt, and, gte, lte, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { spawnRecurringTasks } from "../lib/spawn-recurring";

const router: IRouter = Router();

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

function monthBounds(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed
  const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

// ── POST /api/automations/run ─────────────────────────────────────────────
// Runs all page-load automations in one round trip:
//   1. Spawns any due recurring tasks
//   2. Returns overdue task count
//   3. Returns clients at or over their monthly hour budget
router.post("/automations/run", requireAuth, async (req, res) => {
  const today = todayStr();
  const { start, end } = monthBounds();

  // 1. Spawn recurring tasks
  const spawned = await spawnRecurringTasks();

  // 2. Overdue task count (pending tasks past due date)
  const overdueTasks = await db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(and(eq(tasksTable.status, "Pending"), lt(tasksTable.due_date, today)));

  // 3. Budget status per client (this month)
  //    Sum time entries grouped by client, compare to monthly_hour_budget
  const usageRows = await db
    .select({
      client_id: timeEntriesTable.client_id,
      minutes_used: sql<number>`sum(${timeEntriesTable.duration_minutes})`.as("minutes_used"),
    })
    .from(timeEntriesTable)
    .where(and(gte(timeEntriesTable.date, start), lte(timeEntriesTable.date, end)))
    .groupBy(timeEntriesTable.client_id);

  const clients = await db
    .select({ id: clientsTable.id, name: clientsTable.name, budget: clientsTable.monthly_hour_budget })
    .from(clientsTable);

  const overBudget: { name: string; hoursUsed: number; budget: number }[] = [];
  const nearBudget: { name: string; hoursUsed: number; budget: number }[] = [];

  for (const client of clients) {
    const usage = usageRows.find(u => u.client_id === client.id);
    const hoursUsed = Math.round(((usage?.minutes_used ?? 0) / 60) * 10) / 10;
    const budget = client.budget ?? 0;
    if (budget <= 0) continue;
    if (hoursUsed >= budget) {
      overBudget.push({ name: client.name, hoursUsed, budget });
    } else if (hoursUsed >= budget * 0.9) {
      nearBudget.push({ name: client.name, hoursUsed, budget });
    }
  }

  res.json({
    recurringTasksSpawned: spawned.length,
    overdueTaskCount: overdueTasks.length,
    overBudgetClients: overBudget,
    nearBudgetClients: nearBudget,
  });
});

// ── GET /api/automations/budget-status?client_id=X ────────────────────────
// Called after logging a time entry to check if the client has hit their budget.
// Returns the current-month hours used vs. the budget so the frontend can warn.
router.get("/automations/budget-status", requireAuth, async (req, res) => {
  const clientId = Number(req.query["client_id"]);
  if (!clientId) {
    res.status(400).json({ error: "client_id is required" });
    return;
  }

  const { start, end } = monthBounds();

  const [client] = await db
    .select({ name: clientsTable.name, budget: clientsTable.monthly_hour_budget })
    .from(clientsTable)
    .where(eq(clientsTable.id, clientId));

  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  const [usage] = await db
    .select({ minutes: sql<number>`coalesce(sum(${timeEntriesTable.duration_minutes}), 0)`.as("minutes") })
    .from(timeEntriesTable)
    .where(
      and(
        eq(timeEntriesTable.client_id, clientId),
        gte(timeEntriesTable.date, start),
        lte(timeEntriesTable.date, end)
      )
    );

  const hoursUsed = Math.round(((usage?.minutes ?? 0) / 60) * 10) / 10;
  const budget = client.budget ?? 0;

  let status: "ok" | "near" | "over" = "ok";
  if (budget > 0) {
    if (hoursUsed >= budget) status = "over";
    else if (hoursUsed >= budget * 0.9) status = "near";
  }

  res.json({ clientName: client.name, hoursUsed, budget, status });
});

export default router;
