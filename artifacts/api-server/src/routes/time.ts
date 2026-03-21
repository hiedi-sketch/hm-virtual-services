import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { timeEntriesTable, clientsTable, tasksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateTimeEntryBody,
  ListTimeEntriesQueryParams,
  ListTimeEntriesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/time", async (req, res) => {
  const query = ListTimeEntriesQueryParams.parse(req.query);

  let rows;
  if (query.clientId) {
    rows = await db
      .select({
        id: timeEntriesTable.id,
        client_id: timeEntriesTable.client_id,
        task_id: timeEntriesTable.task_id,
        duration_minutes: timeEntriesTable.duration_minutes,
        date: timeEntriesTable.date,
        client_name: clientsTable.name,
        task_title: tasksTable.title,
      })
      .from(timeEntriesTable)
      .leftJoin(clientsTable, eq(timeEntriesTable.client_id, clientsTable.id))
      .leftJoin(tasksTable, eq(timeEntriesTable.task_id, tasksTable.id))
      .where(eq(timeEntriesTable.client_id, query.clientId))
      .orderBy(timeEntriesTable.date);
  } else {
    rows = await db
      .select({
        id: timeEntriesTable.id,
        client_id: timeEntriesTable.client_id,
        task_id: timeEntriesTable.task_id,
        duration_minutes: timeEntriesTable.duration_minutes,
        date: timeEntriesTable.date,
        client_name: clientsTable.name,
        task_title: tasksTable.title,
      })
      .from(timeEntriesTable)
      .leftJoin(clientsTable, eq(timeEntriesTable.client_id, clientsTable.id))
      .leftJoin(tasksTable, eq(timeEntriesTable.task_id, tasksTable.id))
      .orderBy(timeEntriesTable.date);
  }

  const parsed = ListTimeEntriesResponse.parse(rows);
  res.json(parsed);
});

router.post("/time", async (req, res) => {
  const body = CreateTimeEntryBody.parse(req.body);
  const [entry] = await db.insert(timeEntriesTable).values(body).returning();
  res.status(201).json(entry);
});

export default router;
