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

const router: IRouter = Router();

router.get("/leads", async (req, res) => {
  const leads = await db.select().from(leadsTable).orderBy(leadsTable.id);
  const parsed = ListLeadsResponse.parse(leads);
  res.json(parsed);
});

router.post("/leads", async (req, res) => {
  const body = CreateLeadBody.parse(req.body);
  const [lead] = await db.insert(leadsTable).values(body).returning();
  res.status(201).json(lead);
});

router.patch("/leads/:id", async (req, res) => {
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
});

router.delete("/leads/:id", async (req, res) => {
  const { id } = DeleteLeadParams.parse(req.params);
  await db.delete(leadsTable).where(eq(leadsTable.id, id));
  res.status(204).send();
});

export default router;
