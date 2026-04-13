import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { timeEntriesTable, clientsTable, tasksTable, usersTable } from "@workspace/db";
import { eq, isNull, and, isNotNull } from "drizzle-orm";
import {
  CreateTimeEntryBody,
  ListTimeEntriesQueryParams,
  ListTimeEntriesResponse,
  DeleteTimeEntryParams,
  UpdateTimeEntryParams,
  UpdateTimeEntryBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const withJoins = {
  id: timeEntriesTable.id,
  client_id: timeEntriesTable.client_id,
  task_id: timeEntriesTable.task_id,
  user_id: timeEntriesTable.user_id,
  duration_minutes: timeEntriesTable.duration_minutes,
  date: timeEntriesTable.date,
  started_at: timeEntriesTable.started_at,
  ended_at: timeEntriesTable.ended_at,
  service_type: timeEntriesTable.service_type,
  notes: timeEntriesTable.notes,
  client_name: clientsTable.name,
  task_title: tasksTable.title,
  logged_by: usersTable.name,
};

router.get("/time", requireAuth, async (req, res) => {
  const query = ListTimeEntriesQueryParams.parse(req.query);
  const user = req.session.user!;

  // Clients see only their own client's entries
  // Team members see only entries they personally logged
  // Admins see everything (optionally filtered by client)
  let whereClause;
  if (user.role === "client") {
    const clientId = user.client_id ?? -1;
    whereClause = eq(timeEntriesTable.client_id, clientId);
  } else if (user.role === "team_member") {
    whereClause = eq(timeEntriesTable.user_id, user.id);
  } else {
    // admin
    whereClause = query.clientId ? eq(timeEntriesTable.client_id, query.clientId) : undefined;
  }

  const rows = await db
    .select(withJoins)
    .from(timeEntriesTable)
    .leftJoin(clientsTable, eq(timeEntriesTable.client_id, clientsTable.id))
    .leftJoin(tasksTable, eq(timeEntriesTable.task_id, tasksTable.id))
    .leftJoin(usersTable, eq(timeEntriesTable.user_id, usersTable.id))
    .where(whereClause)
    .orderBy(timeEntriesTable.id);

  const parsed = ListTimeEntriesResponse.parse(rows);
  res.json(parsed);
});

router.post("/time", requireRole("admin", "team_member"), async (req, res) => {
  const body = CreateTimeEntryBody.parse(req.body);
  const user = req.session.user!;

  // Inherit service_type from linked task when not explicitly set
  let serviceType = body.service_type ?? null;
  if (!serviceType && body.task_id) {
    const [task] = await db
      .select({ service_type: tasksTable.service_type })
      .from(tasksTable)
      .where(eq(tasksTable.id, body.task_id));
    if (task?.service_type) serviceType = task.service_type as typeof serviceType;
  }

  const [entry] = await db
    .insert(timeEntriesTable)
    .values({ ...body, user_id: user.id, service_type: serviceType ?? body.service_type })
    .returning();

  res.status(201).json(entry);
  logAudit("time_entry", entry.id, "created", `Time entry logged: ${entry.duration_minutes} min on ${entry.date}`, { id: user.id, name: user.name });
});

router.patch("/time/:id", requireRole("admin", "team_member"), async (req, res) => {
  const { id } = UpdateTimeEntryParams.parse(req.params);
  const body = UpdateTimeEntryBody.parse(req.body);
  const user = req.session.user!;

  // Team members may only edit their own entries
  if (user.role === "team_member") {
    const [existing] = await db
      .select({ user_id: timeEntriesTable.user_id })
      .from(timeEntriesTable)
      .where(eq(timeEntriesTable.id, id));

    if (!existing) {
      res.status(404).json({ error: "Time entry not found" });
      return;
    }
    if (existing.user_id !== user.id) {
      res.status(403).json({ error: "You can only edit your own time entries" });
      return;
    }
  }

  const [updated] = await db
    .update(timeEntriesTable)
    .set(body)
    .where(eq(timeEntriesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Time entry not found" });
    return;
  }

  const [row] = await db
    .select(withJoins)
    .from(timeEntriesTable)
    .leftJoin(clientsTable, eq(timeEntriesTable.client_id, clientsTable.id))
    .leftJoin(tasksTable, eq(timeEntriesTable.task_id, tasksTable.id))
    .leftJoin(usersTable, eq(timeEntriesTable.user_id, usersTable.id))
    .where(eq(timeEntriesTable.id, id));

  res.json(row ?? updated);
  logAudit("time_entry", id, "updated", `Time entry #${id} updated: ${updated.duration_minutes} min`, { id: user.id, name: user.name });
});

router.delete("/time/:id", requireRole("admin", "team_member"), async (req, res) => {
  const { id } = DeleteTimeEntryParams.parse(req.params);
  const user = req.session.user!;

  // Team members may only delete their own entries
  if (user.role === "team_member") {
    const [existing] = await db
      .select({ user_id: timeEntriesTable.user_id })
      .from(timeEntriesTable)
      .where(eq(timeEntriesTable.id, id));

    if (!existing) {
      res.status(404).json({ error: "Time entry not found" });
      return;
    }
    if (existing.user_id !== user.id) {
      res.status(403).json({ error: "You can only delete your own time entries" });
      return;
    }
  }

  await db.delete(timeEntriesTable).where(eq(timeEntriesTable.id, id));
  res.status(204).send();
  logAudit("time_entry", id, "deleted", `Time entry #${id} deleted`, { id: user.id, name: user.name });
});

// ── Admin backfill: set service_type on entries that have none but whose task does ────────────────
router.post("/time/backfill-service-types", requireRole("admin"), async (_req, res) => {
  // Find entries with no service_type that are linked to a task that has one
  const orphans = await db
    .select({
      entry_id: timeEntriesTable.id,
      task_service_type: tasksTable.service_type,
    })
    .from(timeEntriesTable)
    .innerJoin(tasksTable, and(
      eq(timeEntriesTable.task_id, tasksTable.id),
      isNotNull(tasksTable.service_type),
    ))
    .where(isNull(timeEntriesTable.service_type));

  let fixed = 0;
  for (const row of orphans) {
    if (!row.task_service_type) continue;
    await db
      .update(timeEntriesTable)
      .set({ service_type: row.task_service_type as "Virtual Assistant" | "Bookkeeping" })
      .where(eq(timeEntriesTable.id, row.entry_id));
    fixed++;
  }

  res.json({ fixed, total_checked: orphans.length });
});

export default router;
