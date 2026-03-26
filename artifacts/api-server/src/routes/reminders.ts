import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { invoiceRemindersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth";
import { sendReminderForInvoice } from "../lib/invoice-scheduler";
import type { ReminderType } from "@workspace/db";

const router: IRouter = Router();

const VALID_TYPES: ReminderType[] = ["due", "day3", "day5", "day10"];

// ── List reminders sent for an invoice ───────────────────────────────────────
router.get("/invoices/:id/reminders", requireAdmin, async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid invoice id" }); return; }

  const reminders = await db
    .select()
    .from(invoiceRemindersTable)
    .where(eq(invoiceRemindersTable.invoice_id, id))
    .orderBy(invoiceRemindersTable.sent_at);

  res.json(reminders);
});

// ── Manually send a reminder for an invoice ───────────────────────────────────
router.post("/invoices/:id/send-reminder", requireAdmin, async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid invoice id" }); return; }

  const type = req.body?.type as ReminderType;
  if (!VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(", ")}` });
    return;
  }

  const result = await sendReminderForInvoice(id, type);

  if (!result.sent) {
    res.status(400).json({ error: result.reason ?? "Could not send reminder" });
    return;
  }

  res.json({ sent: true });
});

export default router;
