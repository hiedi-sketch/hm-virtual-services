import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { servicesTable, clientServicesTable, timeEntriesTable, tasksTable } from "@workspace/db";
import { eq, and, gte, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const ServiceTypeEnum = z.enum(["Bookkeeping", "Virtual Assistant"]);
const BillingTypeEnum = z.enum(["Flat Rate", "Hourly"]);

const CreateServiceBody = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  service_type: ServiceTypeEnum.default("Virtual Assistant"),
  price: z.number().min(0).default(0),
  billing_type: BillingTypeEnum.default("Flat Rate"),
  hourly_rate: z.number().min(0).nullable().optional(),
  budgeted_hours: z.number().min(0).nullable().optional(),
  active: z.boolean().optional().default(true),
});

const UpdateServiceBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  service_type: ServiceTypeEnum.optional(),
  price: z.number().min(0).optional(),
  billing_type: BillingTypeEnum.optional(),
  hourly_rate: z.number().min(0).nullable().optional(),
  budgeted_hours: z.number().min(0).nullable().optional(),
  active: z.boolean().optional(),
});

const AssignServiceBody = z.object({
  service_id: z.number(),
  custom_price: z.number().min(0).nullable().optional(),
  custom_hourly_rate: z.number().min(0).nullable().optional(),
  custom_budgeted_hours: z.number().min(0).nullable().optional(),
  monthly_hours_reset_day: z.number().int().min(1).max(31).nullable().optional(),
  allow_rollover: z.boolean().optional(),
  rollover_cap_hours: z.number().min(0).nullable().optional(),
});

const UpdateClientServiceBody = z.object({
  custom_price: z.number().min(0).nullable().optional(),
  custom_hourly_rate: z.number().min(0).nullable().optional(),
  custom_budgeted_hours: z.number().min(0).nullable().optional(),
  monthly_hours_reset_day: z.number().int().min(1).max(31).nullable().optional(),
  allow_rollover: z.boolean().optional(),
  rollover_cap_hours: z.number().min(0).nullable().optional(),
});

// ── Helper: compute reset window from a day-of-month ──────────────────────
function computeResetWindow(resetDay: number, refDate = new Date()) {
  const clampDay = (year: number, month: number, day: number): Date => {
    const maxDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(day, maxDay));
  };

  const todayDay = refDate.getDate();
  let lastResetDate: Date;
  let nextResetDate: Date;

  if (todayDay >= resetDay) {
    lastResetDate = clampDay(refDate.getFullYear(), refDate.getMonth(), resetDay);
    const nm = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1);
    nextResetDate = clampDay(nm.getFullYear(), nm.getMonth(), resetDay);
  } else {
    const lm = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
    lastResetDate = clampDay(lm.getFullYear(), lm.getMonth(), resetDay);
    nextResetDate = clampDay(refDate.getFullYear(), refDate.getMonth(), resetDay);
  }

  const todayMidnight = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate()).getTime();
  const daysUntilReset = Math.ceil((nextResetDate.getTime() - todayMidnight) / 86400000);

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return { lastResetDate: fmt(lastResetDate), nextResetDate: fmt(nextResetDate), daysUntilReset };
}

// ── List all services ─────────────────────────────────────────────────────
router.get("/services", requireAuth, async (_req, res) => {
  const rows = await db.select().from(servicesTable).orderBy(servicesTable.name);
  res.json(rows);
});

// ── Create a service ──────────────────────────────────────────────────────
router.post("/services", requireAdmin, async (req, res) => {
  const body = CreateServiceBody.parse(req.body);
  const [service] = await db.insert(servicesTable).values(body).returning();
  res.status(201).json(service);
  const actor = req.session.user;
  logAudit("service", service.id, "created", `Service "${service.name}" created (${service.billing_type})`, { id: actor?.id, name: actor?.name });
});

// ── Update a service ──────────────────────────────────────────────────────
router.patch("/services/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const body = UpdateServiceBody.parse(req.body);
  const [updated] = await db.update(servicesTable).set(body).where(eq(servicesTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Service not found" }); return; }
  res.json(updated);
  const actor = req.session.user;
  logAudit("service", id, "updated", `Service "${updated.name}" updated`, { id: actor?.id, name: actor?.name });
});

// ── Delete a service ──────────────────────────────────────────────────────
router.delete("/services/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db.delete(servicesTable).where(eq(servicesTable.id, id));
  res.status(204).send();
  const actor = req.session.user;
  logAudit("service", id, "deleted", `Service #${id} deleted`, { id: actor?.id, name: actor?.name });
});

// ── List services assigned to a client ────────────────────────────────────
router.get("/clients/:clientId/services", requireAuth, async (req, res) => {
  const clientId = Number(req.params["clientId"]);
  if (!clientId || isNaN(clientId)) { res.status(400).json({ error: "Invalid clientId" }); return; }

  const rows = await db
    .select({
      id: clientServicesTable.id,
      client_id: clientServicesTable.client_id,
      service_id: clientServicesTable.service_id,
      custom_price: clientServicesTable.custom_price,
      custom_hourly_rate: clientServicesTable.custom_hourly_rate,
      custom_budgeted_hours: clientServicesTable.custom_budgeted_hours,
      monthly_hours_reset_day: clientServicesTable.monthly_hours_reset_day,
      created_at: clientServicesTable.created_at,
      name: servicesTable.name,
      description: servicesTable.description,
      service_type: servicesTable.service_type,
      price: servicesTable.price,
      billing_type: servicesTable.billing_type,
      hourly_rate: servicesTable.hourly_rate,
      budgeted_hours: servicesTable.budgeted_hours,
      active: servicesTable.active,
    })
    .from(clientServicesTable)
    .leftJoin(servicesTable, eq(clientServicesTable.service_id, servicesTable.id))
    .where(eq(clientServicesTable.client_id, clientId));

  res.json(rows);
});

// ── Assign a service to a client ──────────────────────────────────────────
router.post("/clients/:clientId/services", requireAdmin, async (req, res) => {
  const clientId = Number(req.params["clientId"]);
  if (!clientId || isNaN(clientId)) { res.status(400).json({ error: "Invalid clientId" }); return; }

  const body = AssignServiceBody.parse(req.body);

  const [existing] = await db
    .select()
    .from(clientServicesTable)
    .where(and(eq(clientServicesTable.client_id, clientId), eq(clientServicesTable.service_id, body.service_id)));

  if (existing) { res.status(409).json({ error: "Service already assigned" }); return; }

  const [row] = await db.insert(clientServicesTable).values({
    client_id: clientId,
    service_id: body.service_id,
    custom_price: body.custom_price ?? null,
    custom_hourly_rate: body.custom_hourly_rate ?? null,
    custom_budgeted_hours: body.custom_budgeted_hours ?? null,
    monthly_hours_reset_day: body.monthly_hours_reset_day ?? null,
    allow_rollover: body.allow_rollover ?? false,
    rollover_cap_hours: body.rollover_cap_hours ?? null,
  }).returning();
  res.status(201).json(row);
});

// ── Update custom fields for a client service ──────────────────────────────
router.patch("/clients/:clientId/services/:serviceId", requireAdmin, async (req, res) => {
  const clientId = Number(req.params["clientId"]);
  const serviceId = Number(req.params["serviceId"]);
  if (!clientId || !serviceId) { res.status(400).json({ error: "Invalid ids" }); return; }

  const body = UpdateClientServiceBody.parse(req.body);

  const [updated] = await db
    .update(clientServicesTable)
    .set(body)
    .where(and(eq(clientServicesTable.client_id, clientId), eq(clientServicesTable.service_id, serviceId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Client service not found" }); return; }
  res.json(updated);
});

// ── Remove a service from a client ────────────────────────────────────────
router.delete("/clients/:clientId/services/:serviceId", requireAdmin, async (req, res) => {
  const clientId = Number(req.params["clientId"]);
  const serviceId = Number(req.params["serviceId"]);
  if (!clientId || !serviceId) { res.status(400).json({ error: "Invalid ids" }); return; }

  await db
    .delete(clientServicesTable)
    .where(and(eq(clientServicesTable.client_id, clientId), eq(clientServicesTable.service_id, serviceId)));

  res.status(204).send();
});

// ── VA/BK hours usage per assigned service (reset-date-aware) ─────────────
router.get("/clients/:clientId/services-hours", requireAuth, async (req, res) => {
  const clientId = Number(req.params["clientId"]);
  if (!clientId || isNaN(clientId)) { res.status(400).json({ error: "Invalid clientId" }); return; }

  const assignedServices = await db
    .select({
      service_id: clientServicesTable.service_id,
      custom_price: clientServicesTable.custom_price,
      custom_hourly_rate: clientServicesTable.custom_hourly_rate,
      custom_budgeted_hours: clientServicesTable.custom_budgeted_hours,
      monthly_hours_reset_day: clientServicesTable.monthly_hours_reset_day,
      allow_rollover: clientServicesTable.allow_rollover,
      rollover_cap_hours: clientServicesTable.rollover_cap_hours,
      name: servicesTable.name,
      service_type: servicesTable.service_type,
      billing_type: servicesTable.billing_type,
      hourly_rate: servicesTable.hourly_rate,
      budgeted_hours: servicesTable.budgeted_hours,
      price: servicesTable.price,
    })
    .from(clientServicesTable)
    .leftJoin(servicesTable, eq(clientServicesTable.service_id, servicesTable.id))
    .where(eq(clientServicesTable.client_id, clientId));

  // Compute reset windows per service type
  const vaService = assignedServices.find(s => s.service_type === "Virtual Assistant");
  const vaResetDay = vaService?.monthly_hours_reset_day ?? null;

  let vaLastReset: string | null = null;
  let vaNextReset: string | null = null;
  let vaDaysUntilReset: number | null = null;
  let vaPrevLastReset: string | null = null;

  if (vaResetDay) {
    const window = computeResetWindow(vaResetDay);
    vaLastReset = window.lastResetDate;
    vaNextReset = window.nextResetDate;
    vaDaysUntilReset = window.daysUntilReset;
    // Previous period: one day before the current period start
    const prevRefDate = new Date(window.lastResetDate + "T00:00:00");
    prevRefDate.setDate(prevRefDate.getDate() - 1);
    const prevWindow = computeResetWindow(vaResetDay, prevRefDate);
    vaPrevLastReset = prevWindow.lastResetDate;
  }

  // Helper: sum minutes for a given service type within an optional date range
  async function sumMinutes(serviceType: string, since: string | null, before: string | null = null): Promise<number> {
    const baseWhere = and(
      eq(timeEntriesTable.client_id, clientId),
      or(
        eq(timeEntriesTable.service_type, serviceType),
        eq(tasksTable.service_type, serviceType)
      )
    );
    let whereClause = baseWhere;
    if (since && before) {
      whereClause = and(baseWhere, gte(timeEntriesTable.date, since), lt(timeEntriesTable.date, before));
    } else if (since) {
      whereClause = and(baseWhere, gte(timeEntriesTable.date, since));
    }

    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${timeEntriesTable.duration_minutes}), 0)`.as("total") })
      .from(timeEntriesTable)
      .leftJoin(tasksTable, eq(timeEntriesTable.task_id, tasksTable.id))
      .where(whereClause);
    return Number(row?.total ?? 0);
  }

  // Build minutes cache per service type for the current period
  const minutesByType: Record<string, number> = {};
  const serviceTypes = [...new Set(assignedServices.map(s => s.service_type).filter(Boolean))];

  for (const st of serviceTypes) {
    if (!st) continue;
    const since = st === "Virtual Assistant" ? vaLastReset : null;
    minutesByType[st] = await sumMinutes(st, since);
  }

  // Compute rollover hours per service (VA only, previous period unused)
  const rolloverByServiceId: Record<number, number> = {};
  for (const svc of assignedServices) {
    if (!svc.allow_rollover || svc.service_type !== "Virtual Assistant") continue;
    if (!vaPrevLastReset || !vaLastReset) continue;

    const budgeted = svc.custom_budgeted_hours ?? svc.budgeted_hours ?? 0;
    if (budgeted <= 0) continue;

    const prevMinutes = await sumMinutes("Virtual Assistant", vaPrevLastReset, vaLastReset);
    const prevUsed = prevMinutes / 60;
    const unused = Math.max(0, budgeted - prevUsed);
    const capped = svc.rollover_cap_hours != null ? Math.min(unused, svc.rollover_cap_hours) : unused;
    rolloverByServiceId[svc.service_id] = Math.round(capped * 100) / 100;
  }

  const result = assignedServices.map(svc => {
    const svcResetDay = svc.service_type === "Virtual Assistant" ? vaResetDay : null;
    const nextReset = svc.service_type === "Virtual Assistant" ? vaNextReset : null;
    const daysUntilReset = svc.service_type === "Virtual Assistant" ? vaDaysUntilReset : null;
    const rolloverHours = rolloverByServiceId[svc.service_id] ?? 0;
    const baseBudget = svc.custom_budgeted_hours ?? svc.budgeted_hours ?? null;
    const effectiveBudget = baseBudget != null ? baseBudget + rolloverHours : null;

    return {
      service_id: svc.service_id,
      name: svc.name,
      service_type: svc.service_type,
      billing_type: svc.billing_type,
      hourly_rate: svc.custom_hourly_rate ?? svc.hourly_rate,
      budgeted_hours: effectiveBudget,
      base_budgeted_hours: baseBudget,
      rollover_hours: rolloverHours,
      allow_rollover: svc.allow_rollover,
      rollover_cap_hours: svc.rollover_cap_hours,
      price: svc.custom_price ?? svc.price,
      hours_used: svc.service_type ? parseFloat(((minutesByType[svc.service_type] ?? 0) / 60).toFixed(2)) : 0,
      monthly_hours_reset_day: svcResetDay,
      next_reset_date: nextReset,
      days_until_reset: daysUntilReset,
    };
  });

  res.json(result);
});

// ── Helper export for dashboard route ─────────────────────────────────────
export { computeResetWindow };
export default router;
