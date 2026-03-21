import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientsTable, timeEntriesTable } from "@workspace/db";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import {
  CreateClientBody,
  GetClientParams,
  UpdateClientParams,
  UpdateClientBody,
  ListClientsResponse,
  GetDashboardResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/clients", async (req, res) => {
  const clients = await db.select().from(clientsTable).orderBy(clientsTable.name);
  const parsed = ListClientsResponse.parse(clients);
  res.json(parsed);
});

router.post("/clients", async (req, res) => {
  const body = CreateClientBody.parse(req.body);
  const [client] = await db.insert(clientsTable).values(body).returning();
  res.status(201).json(client);
});

router.get("/clients/:id", async (req, res) => {
  const { id } = GetClientParams.parse(req.params);
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json(client);
});

router.patch("/clients/:id", async (req, res) => {
  const { id } = UpdateClientParams.parse(req.params);
  const body = UpdateClientBody.parse(req.body);
  const [updated] = await db
    .update(clientsTable)
    .set(body)
    .where(eq(clientsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json(updated);
});

router.get("/dashboard", async (req, res) => {
  const clients = await db.select().from(clientsTable).orderBy(clientsTable.name);

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

  const timeByClient = await db
    .select({
      client_id: timeEntriesTable.client_id,
      total_minutes: sql<number>`sum(${timeEntriesTable.duration_minutes})`,
    })
    .from(timeEntriesTable)
    .where(and(gte(timeEntriesTable.date, monthStart), lt(timeEntriesTable.date, monthEnd)))
    .groupBy(timeEntriesTable.client_id);

  const minuteMap: Record<number, number> = {};
  for (const row of timeByClient) {
    minuteMap[row.client_id] = Number(row.total_minutes) || 0;
  }

  const dashboard = clients.map((c) => {
    const minutes = minuteMap[c.id] || 0;
    const hours_used = Math.round((minutes / 60) * 10) / 10;
    const hours_remaining = Math.round((c.monthly_hour_budget - hours_used) * 10) / 10;
    return {
      ...c,
      hours_used_this_month: hours_used,
      hours_remaining,
    };
  });

  const parsed = GetDashboardResponse.parse(dashboard);
  res.json(parsed);
});

export default router;
