import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientsTable, timeEntriesTable, clientServicesTable, servicesTable } from "@workspace/db";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import {
  CreateClientBody,
  GetClientParams,
  UpdateClientParams,
  UpdateClientBody,
  ListClientsResponse,
  GetDashboardResponse,
} from "@workspace/api-zod";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { computeResetWindow } from "./services";

const router: IRouter = Router();

router.get("/clients", requireAdmin, async (req, res) => {
  const clients = await db.select().from(clientsTable).orderBy(clientsTable.name);
  const parsed = ListClientsResponse.parse(clients);
  res.json(parsed);
});

router.post("/clients", requireAdmin, async (req, res) => {
  const body = CreateClientBody.parse(req.body);
  const [client] = await db.insert(clientsTable).values(body).returning();
  res.status(201).json(client);
});

router.get("/clients/:id", requireAuth, async (req, res) => {
  const { id } = GetClientParams.parse(req.params);
  const user = req.session.user!;
  if (user.role === "client" && user.client_id !== id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }
  res.json(client);
});

router.patch("/clients/:id", requireAdmin, async (req, res) => {
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

router.get("/dashboard", requireAdmin, async (req, res) => {
  const clients = await db.select().from(clientsTable).orderBy(clientsTable.name);

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  const monthStart = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const nextMonthDate = new Date(Date.UTC(y, m + 1, 1));
  const monthEnd = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}-01`;

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

  // Fetch VA service reset days per client
  const vaResetRows = await db
    .select({
      client_id: clientServicesTable.client_id,
      monthly_hours_reset_day: clientServicesTable.monthly_hours_reset_day,
    })
    .from(clientServicesTable)
    .leftJoin(servicesTable, eq(clientServicesTable.service_id, servicesTable.id))
    .where(eq(servicesTable.service_type, "Virtual Assistant"));

  const vaResetDayByClient: Record<number, number> = {};
  for (const row of vaResetRows) {
    if (row.monthly_hours_reset_day && !vaResetDayByClient[row.client_id]) {
      vaResetDayByClient[row.client_id] = row.monthly_hours_reset_day;
    }
  }

  const dashboard = clients.map((c) => {
    const minutes = minuteMap[c.id] || 0;
    const hours_used = Math.round((minutes / 60) * 10) / 10;
    const hours_remaining = Math.round((c.monthly_hour_budget - hours_used) * 10) / 10;

    const vaResetDay = vaResetDayByClient[c.id] ?? null;
    let va_next_reset_date: string | null = null;
    let days_until_va_reset: number | null = null;
    if (vaResetDay) {
      const window = computeResetWindow(vaResetDay);
      va_next_reset_date = window.nextResetDate;
      days_until_va_reset = window.daysUntilReset;
    }

    return {
      ...c,
      hours_used_this_month: hours_used,
      hours_remaining,
      va_next_reset_date,
      days_until_va_reset,
    };
  });

  const parsed = GetDashboardResponse.parse(dashboard);
  res.json(parsed);
});

export default router;
