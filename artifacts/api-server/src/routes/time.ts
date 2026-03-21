import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { timeEntriesTable, clientsTable, tasksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateTimeEntryBody,
  ListTimeEntriesQueryParams,
  ListTimeEntriesResponse,
  DeleteTimeEntryParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middleware/auth";

const router: IRouter = Router();

const withJoins = {
  id: timeEntriesTable.id,
  client_id: timeEntriesTable.client_id,
  task_id: timeEntriesTable.task_id,
  duration_minutes: timeEntriesTable.duration_minutes,
  date: timeEntriesTable.date,
  started_at: timeEntriesTable.started_at,
  ended_at: timeEntriesTable.ended_at,
  client_name: clientsTable.name,
  task_title: tasksTable.title,
};

router.get("/time", requireAuth, async (req, res) => {
  const query = ListTimeEntriesQueryParams.parse(req.query);
  const user = req.session.user!;
  const effectiveClientId = user.role === "client" ? (user.client_id ?? undefined) : query.clientId;

  const rows = await db
    .select(withJoins)
    .from(timeEntriesTable)
    .leftJoin(clientsTable, eq(timeEntriesTable.client_id, clientsTable.id))
    .leftJoin(tasksTable, eq(timeEntriesTable.task_id, tasksTable.id))
    .where(effectiveClientId ? eq(timeEntriesTable.client_id, effectiveClientId) : undefined)
    .orderBy(timeEntriesTable.id);

  const parsed = ListTimeEntriesResponse.parse(rows);
  res.json(parsed);
});

router.post("/time", requireRole("admin", "team_member"), async (req, res) => {
  const body = CreateTimeEntryBody.parse(req.body);
  const [entry] = await db.insert(timeEntriesTable).values(body).returning();
  res.status(201).json(entry);
});

router.delete("/time/:id", requireRole("admin", "team_member"), async (req, res) => {
  const { id } = DeleteTimeEntryParams.parse(req.params);
  await db.delete(timeEntriesTable).where(eq(timeEntriesTable.id, id));
  res.status(204).send();
});

export default router;
