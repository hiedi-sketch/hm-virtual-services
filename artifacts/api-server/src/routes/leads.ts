import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { leadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateLeadBody,
  UpdateLeadBody,
  UpdateLeadParams,
  DeleteLeadParams,
  ListLeadsResponse,
  UpdateLeadResponse,
} from "@workspace/api-zod";
import { requireAdmin, requireRole } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

router.get("/leads", requireRole("admin", "team_member"), async (req, res) => {
  const leads = await db.select().from(leadsTable).orderBy(leadsTable.id);
  const parsed = ListLeadsResponse.parse(leads);
  res.json(parsed);
});

router.post("/leads", requireRole("admin", "team_member"), async (req, res) => {
  const body = CreateLeadBody.parse(req.body);
  const [lead] = await db.insert(leadsTable).values(body).returning();
  res.status(201).json(lead);
  const actor = req.session.user;
  logAudit("lead", lead.id, "created", `Lead "${lead.name}" created`, { id: actor?.id, name: actor?.name });
});

router.patch("/leads/:id", requireRole("admin", "team_member"), async (req, res) => {
  const { id } = UpdateLeadParams.parse(req.params);
  const body = UpdateLeadBody.parse(req.body);

  const [updated] = await db
    .update(leadsTable)
    .set(body)
    .where(eq(leadsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const parsed = UpdateLeadResponse.parse(updated);
  res.json(parsed);
  const actor = req.session.user;
  logAudit("lead", id, "updated", `Lead "${updated.name}" status → ${updated.status}`, { id: actor?.id, name: actor?.name });
});

router.delete("/leads/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteLeadParams.parse(req.params);
  const [deleted] = await db.delete(leadsTable).where(eq(leadsTable.id, id)).returning();
  res.status(204).send();
  if (deleted) {
    const actor = req.session.user;
    logAudit("lead", id, "deleted", `Lead "${deleted.name}" deleted`, { id: actor?.id, name: actor?.name });
  }
});

export default router;
