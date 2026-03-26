import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { servicesTable, clientServicesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const CreateServiceBody = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  price: z.number().min(0),
  billing_type: z.enum(["one_time", "recurring"]).default("one_time"),
  active: z.boolean().optional().default(true),
});

const UpdateServiceBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  price: z.number().min(0).optional(),
  billing_type: z.enum(["one_time", "recurring"]).optional(),
  active: z.boolean().optional(),
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
  logAudit("service", service.id, "created", `Service "${service.name}" created ($${service.price})`, { id: actor?.id, name: actor?.name });
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
      created_at: clientServicesTable.created_at,
      name: servicesTable.name,
      description: servicesTable.description,
      price: servicesTable.price,
      billing_type: servicesTable.billing_type,
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

  const { service_id } = z.object({ service_id: z.number() }).parse(req.body);

  // Prevent duplicates
  const [existing] = await db
    .select()
    .from(clientServicesTable)
    .where(and(eq(clientServicesTable.client_id, clientId), eq(clientServicesTable.service_id, service_id)));

  if (existing) { res.status(409).json({ error: "Service already assigned" }); return; }

  const [row] = await db.insert(clientServicesTable).values({ client_id: clientId, service_id }).returning();
  res.status(201).json(row);
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

export default router;
