import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { recurringInvoicesTable, invoicesTable, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  CreateRecurringInvoiceBody,
  UpdateRecurringInvoiceParams,
  UpdateRecurringInvoiceBody,
  DeleteRecurringInvoiceParams,
  GenerateRecurringInvoiceParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middleware/auth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

// ── List all recurring invoices ───────────────────────────────────────────────
router.get("/recurring-invoices", requireAdmin, async (req, res) => {
  const rows = await db.select().from(recurringInvoicesTable).orderBy(recurringInvoicesTable.id);
  res.json(rows);
});

// ── Create a recurring invoice ────────────────────────────────────────────────
router.post("/recurring-invoices", requireAdmin, async (req, res) => {
  const body = CreateRecurringInvoiceBody.parse(req.body);
  const [created] = await db.insert(recurringInvoicesTable).values(body).returning();
  res.status(201).json(created);
  const actor = req.session.user;
  logAudit("recurring_invoice", created.id, "created",
    `Recurring invoice #${created.id} created (${body.frequency}) for client #${body.client_id}`,
    { id: actor?.id, name: actor?.name });
});

// ── Update a recurring invoice ────────────────────────────────────────────────
router.patch("/recurring-invoices/:id", requireAdmin, async (req, res) => {
  const { id } = UpdateRecurringInvoiceParams.parse(req.params);
  const body = UpdateRecurringInvoiceBody.parse(req.body);
  const [updated] = await db
    .update(recurringInvoicesTable)
    .set(body)
    .where(eq(recurringInvoicesTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Recurring invoice not found" });
    return;
  }
  res.json(updated);
  const actor = req.session.user;
  logAudit("recurring_invoice", id, "updated", `Recurring invoice #${id} updated`,
    { id: actor?.id, name: actor?.name });
});

// ── Delete a recurring invoice ────────────────────────────────────────────────
router.delete("/recurring-invoices/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteRecurringInvoiceParams.parse(req.params);
  await db.delete(recurringInvoicesTable).where(eq(recurringInvoicesTable.id, id));
  res.status(204).send();
  const actor = req.session.user;
  logAudit("recurring_invoice", id, "deleted", `Recurring invoice #${id} deleted`,
    { id: actor?.id, name: actor?.name });
});

// ── Manually generate the next invoice from a recurring template ──────────────
router.post("/recurring-invoices/:id/generate", requireAdmin, async (req, res) => {
  const { id } = GenerateRecurringInvoiceParams.parse(req.params);

  const [template] = await db
    .select()
    .from(recurringInvoicesTable)
    .where(eq(recurringInvoicesTable.id, id));

  if (!template) {
    res.status(404).json({ error: "Recurring invoice not found" });
    return;
  }

  if (!template.active) {
    res.status(400).json({ error: "Recurring invoice is not active" });
    return;
  }

  const nextDue = computeNextDueDate(template.frequency, template.interval_days);

  // Advance service period for next template cycle
  const nextServiceStart = template.service_period_start
    ? advancePeriod(template.service_period_start, template.frequency, template.interval_days)
    : null;
  const nextServiceEnd = template.service_period_end
    ? advancePeriod(template.service_period_end, template.frequency, template.interval_days)
    : null;

  const [invoice] = await db
    .insert(invoicesTable)
    .values({
      client_id: template.client_id,
      amount: template.amount,
      status: "unpaid",
      due_date: template.next_due_date,
      description: template.description,
      line_items: template.line_items,
      notes: template.notes,
      thank_you_message: template.thank_you_message,
      recurring_id: template.id,
      service_period_start: template.service_period_start,
      service_period_end: template.service_period_end,
    })
    .returning();

  // Advance next_due_date and service period on the template
  await db
    .update(recurringInvoicesTable)
    .set({
      next_due_date: nextDue,
      service_period_start: nextServiceStart,
      service_period_end: nextServiceEnd,
    })
    .where(eq(recurringInvoicesTable.id, id));

  res.status(201).json(invoice);
  const actor = req.session.user;
  logAudit("invoice", invoice.id, "created",
    `Invoice #${invoice.id} generated from recurring template #${id}`,
    { id: actor?.id, name: actor?.name });
});

function computeNextDueDate(frequency: string, intervalDays: number | null): string {
  const today = new Date();
  if (frequency === "weekly") {
    today.setDate(today.getDate() + 7);
  } else if (frequency === "monthly") {
    today.setMonth(today.getMonth() + 1);
  } else if (frequency === "custom" && intervalDays) {
    today.setDate(today.getDate() + intervalDays);
  } else {
    today.setMonth(today.getMonth() + 1);
  }
  return today.toISOString().split("T")[0]!;
}

function advancePeriod(dateStr: string, frequency: string, intervalDays: number | null): string {
  const d = new Date(dateStr + "T00:00:00");
  if (frequency === "weekly") {
    d.setDate(d.getDate() + 7);
  } else if (frequency === "monthly") {
    d.setMonth(d.getMonth() + 1);
  } else if (frequency === "custom" && intervalDays) {
    d.setDate(d.getDate() + intervalDays);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().split("T")[0]!;
}

export default router;
