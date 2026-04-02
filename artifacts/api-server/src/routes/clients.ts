import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { clientsTable, timeEntriesTable, clientServicesTable, servicesTable, tasksTable } from "@workspace/db";
import { eq, and, gte, lt, sql, inArray, or, isNull } from "drizzle-orm";
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

  // Compute monthly fees from assigned services so the list stays in sync with the detail page
  const clientIds = clients.map(c => c.id);
  const assignedServices = clientIds.length > 0
    ? await db
        .select({
          client_id: clientServicesTable.client_id,
          service_type: servicesTable.service_type,
          billing_type: servicesTable.billing_type,
          price: servicesTable.price,
          hourly_rate: servicesTable.hourly_rate,
          budgeted_hours: servicesTable.budgeted_hours,
          custom_price: clientServicesTable.custom_price,
          custom_hourly_rate: clientServicesTable.custom_hourly_rate,
          custom_budgeted_hours: clientServicesTable.custom_budgeted_hours,
        })
        .from(clientServicesTable)
        .leftJoin(servicesTable, eq(clientServicesTable.service_id, servicesTable.id))
        .where(inArray(clientServicesTable.client_id, clientIds))
    : [];

  // Build per-client monthly fee map using the same logic as the detail page
  const feeByClient = new Map<number, { monthly_fee: number; bk_fee: number | null }>();
  for (const svc of assignedServices) {
    const clientId = svc.client_id;
    const cur = feeByClient.get(clientId) ?? { monthly_fee: 0, bk_fee: null };

    const effPrice = svc.custom_price ?? svc.price ?? 0;
    const effRate = svc.custom_hourly_rate ?? svc.hourly_rate;
    const effHours = svc.custom_budgeted_hours ?? svc.budgeted_hours;
    const isFlat = svc.billing_type === "Flat Rate";
    const isHourly = svc.billing_type === "Hourly";

    const hourlyComputed = isHourly && effRate != null && effHours != null && effHours > 0
      ? effRate * effHours
      : 0;
    const svcValue = isFlat ? effPrice : hourlyComputed > 0 ? hourlyComputed : effPrice;

    cur.monthly_fee += svcValue;
    if (svc.service_type === "Bookkeeping") {
      cur.bk_fee = (cur.bk_fee ?? 0) + svcValue;
    }
    feeByClient.set(clientId, cur);
  }

  // Merge computed fees into client records
  const enriched = clients.map(c => ({
    ...c,
    monthly_fee: feeByClient.get(c.id)?.monthly_fee ?? c.monthly_fee,
    bk_fee: feeByClient.has(c.id) ? (feeByClient.get(c.id)!.bk_fee ?? null) : c.bk_fee,
  }));

  const parsed = ListClientsResponse.parse(enriched);
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
  const clients = await db.select().from(clientsTable)
    .where(isNull(clientsTable.parent_id))
    .orderBy(clientsTable.name);

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

// ── Subclients: list subclients of a parent client with VA hours data ───────
router.get("/clients/:id/subclients", requireAuth, async (req, res) => {
  const parentId = Number(req.params["id"]);
  if (!parentId || isNaN(parentId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const subclients = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.parent_id, parentId))
    .orderBy(clientsTable.name);

  if (subclients.length === 0) { res.json([]); return; }

  const subclientIds = subclients.map(c => c.id);

  // Fetch VA services for all subclients in one query
  const vaServices = await db
    .select({
      client_id: clientServicesTable.client_id,
      service_id: clientServicesTable.service_id,
      custom_budgeted_hours: clientServicesTable.custom_budgeted_hours,
      custom_hourly_rate: clientServicesTable.custom_hourly_rate,
      monthly_hours_reset_day: clientServicesTable.monthly_hours_reset_day,
      budgeted_hours: servicesTable.budgeted_hours,
      hourly_rate: servicesTable.hourly_rate,
    })
    .from(clientServicesTable)
    .leftJoin(servicesTable, eq(clientServicesTable.service_id, servicesTable.id))
    .where(and(
      inArray(clientServicesTable.client_id, subclientIds),
      eq(servicesTable.service_type, "Virtual Assistant")
    ));

  const vaServiceByClient: Record<number, typeof vaServices[0]> = {};
  for (const svc of vaServices) {
    if (!vaServiceByClient[svc.client_id]) vaServiceByClient[svc.client_id] = svc;
  }

  // Compute reset windows and build date filters per client
  const dateFilterByClient: Record<number, string> = {};
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const resetWindowByClient: Record<number, { nextResetDate: string; daysUntilReset: number } | null> = {};
  for (const sc of subclients) {
    const svc = vaServiceByClient[sc.id];
    const resetDay = svc?.monthly_hours_reset_day ?? null;
    if (resetDay) {
      const window = computeResetWindow(resetDay);
      dateFilterByClient[sc.id] = window.lastResetDate;
      resetWindowByClient[sc.id] = { nextResetDate: window.nextResetDate, daysUntilReset: window.daysUntilReset };
    } else {
      dateFilterByClient[sc.id] = monthStart;
      resetWindowByClient[sc.id] = null;
    }
  }

  // Fetch VA hours used per subclient (grouped) using the minimum date filter
  const minDate = Object.values(dateFilterByClient).sort()[0] ?? monthStart;

  const rawHours = await db
    .select({
      client_id: timeEntriesTable.client_id,
      total_minutes: sql<number>`coalesce(sum(${timeEntriesTable.duration_minutes}), 0)`.as("total_minutes"),
    })
    .from(timeEntriesTable)
    .leftJoin(tasksTable, eq(timeEntriesTable.task_id, tasksTable.id))
    .where(and(
      inArray(timeEntriesTable.client_id, subclientIds),
      gte(timeEntriesTable.date, minDate),
      or(
        eq(timeEntriesTable.service_type, "Virtual Assistant"),
        eq(tasksTable.service_type, "Virtual Assistant")
      )
    ))
    .groupBy(timeEntriesTable.client_id);

  // Per-client hours (re-filtered to their actual date cutoff)
  // Note: since clients may have different reset days, we fetch from min date and then
  // filter per client. For most cases this is fine; for strict accuracy we query individually.
  const rawByClient: Record<number, number> = {};
  for (const row of rawHours) {
    rawByClient[row.client_id] = Number(row.total_minutes) || 0;
  }

  // For clients whose reset date differs from minDate, do a per-client query
  const clientsNeedingExactQuery = subclients.filter(sc => {
    const d = dateFilterByClient[sc.id];
    return d && d !== minDate;
  });

  for (const sc of clientsNeedingExactQuery) {
    const since = dateFilterByClient[sc.id];
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${timeEntriesTable.duration_minutes}), 0)`.as("total") })
      .from(timeEntriesTable)
      .leftJoin(tasksTable, eq(timeEntriesTable.task_id, tasksTable.id))
      .where(and(
        eq(timeEntriesTable.client_id, sc.id),
        gte(timeEntriesTable.date, since),
        or(
          eq(timeEntriesTable.service_type, "Virtual Assistant"),
          eq(tasksTable.service_type, "Virtual Assistant")
        )
      ));
    rawByClient[sc.id] = Number(row?.total ?? 0);
  }

  const result = subclients.map(sc => {
    const svc = vaServiceByClient[sc.id];
    const budgetedHours = svc ? (svc.custom_budgeted_hours ?? svc.budgeted_hours ?? 0) : 0;
    const vaHoursUsed = Math.round(((rawByClient[sc.id] ?? 0) / 60) * 10) / 10;
    const hoursRemaining = Math.max(0, Math.round((budgetedHours - vaHoursUsed) * 10) / 10);
    const pct = budgetedHours > 0 ? Math.round((hoursRemaining / budgetedHours) * 100) : null;
    const resetWindow = resetWindowByClient[sc.id];
    return {
      id: sc.id,
      name: sc.name,
      email: sc.email,
      service_type: sc.service_type,
      monthly_va_budget: budgetedHours,
      va_hours_used: vaHoursUsed,
      hours_remaining: hoursRemaining,
      hours_remaining_pct: pct,
      monthly_hours_reset_day: svc?.monthly_hours_reset_day ?? null,
      next_reset_date: resetWindow?.nextResetDate ?? null,
      days_until_reset: resetWindow?.daysUntilReset ?? null,
      va_hourly_rate: svc ? (svc.custom_hourly_rate ?? svc.hourly_rate ?? null) : null,
    };
  });

  res.json(result);
});

export default router;
