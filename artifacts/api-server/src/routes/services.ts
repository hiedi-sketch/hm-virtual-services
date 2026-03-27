import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { servicesTable, clientServicesTable, timeEntriesTable, tasksTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
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
});

const UpdateClientServiceBody = z.object({
  custom_price: z.number().min(0).nullable().optional(),
  custom_hourly_rate: z.number().min(0).nullable().optional(),
  custom_budgeted_hours: z.number().min(0).nullable().optional(),
});

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
  const [updated] = await db
    .update(servicesTable)
    .set(body)
    .where(eq(servicesTable.id, id))
    .returning();

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

  // Prevent duplicates
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

// ── VA hours usage summary for a client's assigned services ───────────────
// Returns hours tracked per service (task-scoped time entries)
router.get("/clients/:clientId/services-hours", requireAuth, async (req, res) => {
  const clientId = Number(req.params["clientId"]);
  if (!clientId || isNaN(clientId)) { res.status(400).json({ error: "Invalid clientId" }); return; }

  // Get all assigned services for client (with custom overrides)
  const assignedServices = await db
    .select({
      service_id: clientServicesTable.service_id,
      custom_price: clientServicesTable.custom_price,
      custom_hourly_rate: clientServicesTable.custom_hourly_rate,
      custom_budgeted_hours: clientServicesTable.custom_budgeted_hours,
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

  // Get total hours tracked per service (via tasks tagged with service_type matching service)
  const timeByServiceType = await db
    .select({
      service_type: tasksTable.service_type,
      total_minutes: sql<number>`coalesce(sum(${timeEntriesTable.duration_minutes}), 0)`.as("total_minutes"),
    })
    .from(timeEntriesTable)
    .leftJoin(tasksTable, eq(timeEntriesTable.task_id, tasksTable.id))
    .where(eq(timeEntriesTable.client_id, clientId))
    .groupBy(tasksTable.service_type);

  const minutesByType: Record<string, number> = {};
  for (const row of timeByServiceType) {
    if (row.service_type) {
      minutesByType[row.service_type] = row.total_minutes;
    }
  }

  const result = assignedServices.map(svc => ({
    service_id: svc.service_id,
    name: svc.name,
    service_type: svc.service_type,
    billing_type: svc.billing_type,
    // Use custom overrides if set, else fall back to library defaults
    hourly_rate: svc.custom_hourly_rate ?? svc.hourly_rate,
    budgeted_hours: svc.custom_budgeted_hours ?? svc.budgeted_hours,
    price: svc.custom_price ?? svc.price,
    hours_used: svc.service_type ? (minutesByType[svc.service_type] ?? 0) / 60 : 0,
  }));

  res.json(result);
});

export default router;
