import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { invoicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListInvoicesQueryParams,
  CreateInvoiceBody,
  UpdateInvoiceParams,
  UpdateInvoiceBody,
  DeleteInvoiceParams,
} from "@workspace/api-zod";
import { requireAdmin, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

router.get("/invoices", requireAuth, async (req, res) => {
  const { clientId } = ListInvoicesQueryParams.parse(req.query);
  const user = req.session.user!;
  const effectiveClientId = user.role === "client" ? (user.client_id ?? undefined) : clientId;
  const rows = effectiveClientId
    ? await db.select().from(invoicesTable).where(eq(invoicesTable.client_id, effectiveClientId))
    : await db.select().from(invoicesTable);
  res.json(rows);
});

router.post("/invoices", requireAdmin, async (req, res) => {
  const body = CreateInvoiceBody.parse(req.body);
  const [invoice] = await db.insert(invoicesTable).values(body).returning();
  res.status(201).json(invoice);
});

router.patch("/invoices/:id", requireAdmin, async (req, res) => {
  const { id } = UpdateInvoiceParams.parse(req.params);
  const body = UpdateInvoiceBody.parse(req.body);
  const [updated] = await db
    .update(invoicesTable)
    .set(body)
    .where(eq(invoicesTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json(updated);
});

router.delete("/invoices/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteInvoiceParams.parse(req.params);
  await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
  res.status(204).send();
});

export default router;
