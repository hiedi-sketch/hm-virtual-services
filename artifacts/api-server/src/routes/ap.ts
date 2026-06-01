import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { db } from "@workspace/db";
import { apBillsTable, apClientSettingsTable, clientsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import * as zod from "zod";

const router = Router();

const AP_BILL_STATUSES = ["upcoming", "due_soon", "sent_for_approval", "approved", "snoozed", "rejected", "paid"] as const;

const CreateApBillBody = zod.object({
  client_id: zod.number(),
  vendor: zod.string().min(1),
  invoice_number: zod.string().optional().nullable(),
  invoice_date: zod.string().optional().nullable(),
  due_date: zod.string(),
  amount: zod.number(),
  category: zod.string().optional().nullable(),
  notes: zod.string().optional().nullable(),
  attachment_url: zod.string().optional().nullable(),
});

const UpdateApBillBody = zod.object({
  vendor: zod.string().optional(),
  invoice_number: zod.string().optional().nullable(),
  invoice_date: zod.string().optional().nullable(),
  due_date: zod.string().optional(),
  amount: zod.number().optional(),
  category: zod.string().optional().nullable(),
  status: zod.enum(AP_BILL_STATUSES).optional(),
  notes: zod.string().optional().nullable(),
  attachment_url: zod.string().optional().nullable(),
  snooze_until: zod.string().optional().nullable(),
  client_response_note: zod.string().optional().nullable(),
});

const UpsertApSettingsBody = zod.object({
  cycle_window_days: zod.number().int().min(1).optional(),
  payment_day: zod.string().optional(),
  approval_send_day: zod.string().optional(),
  snooze_auto: zod.boolean().optional(),
});

/** Compute next cycle payment date from today based on settings */
function nextCycleDate(paymentDay: string): string {
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const targetDow = days.indexOf(paymentDay.toLowerCase());
  const now = new Date();
  let daysAhead = (targetDow - now.getDay() + 7) % 7;
  if (daysAhead === 0) daysAhead = 7; // next week if today
  const next = new Date(now);
  next.setDate(next.getDate() + daysAhead);
  return next.toISOString().split("T")[0];
}

/** Auto-transition bills: upcoming→due_soon, snoozed→due_soon */
async function runAutoTransitions(clientIds?: number[]) {
  const today = new Date().toISOString().split("T")[0];

  // Get all relevant settings
  const allSettings = await db.select().from(apClientSettingsTable);
  const settingsMap = new Map(allSettings.map(s => [s.client_id, s]));

  // upcoming → due_soon
  const upcoming = await db.select().from(apBillsTable).where(eq(apBillsTable.status, "upcoming"));
  for (const bill of upcoming) {
    if (clientIds && !clientIds.includes(bill.client_id)) continue;
    const settings = settingsMap.get(bill.client_id);
    const windowDays = settings?.cycle_window_days ?? 14;
    const dueDate = new Date(bill.due_date);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + windowDays);
    if (dueDate <= cutoff) {
      await db.update(apBillsTable)
        .set({ status: "due_soon", updated_at: new Date() })
        .where(eq(apBillsTable.id, bill.id));
    }
  }

  // snoozed → due_soon (if snooze_until <= today)
  const snoozed = await db.select().from(apBillsTable).where(eq(apBillsTable.status, "snoozed"));
  for (const bill of snoozed) {
    if (clientIds && !clientIds.includes(bill.client_id)) continue;
    if (bill.snooze_until && bill.snooze_until <= today) {
      await db.update(apBillsTable)
        .set({ status: "due_soon", snooze_until: null, updated_at: new Date() })
        .where(eq(apBillsTable.id, bill.id));
    }
  }
}

// GET /ap/bills
router.get("/ap/bills", requireAuth, async (req, res) => {
  await runAutoTransitions();

  const clientId = req.query.client_id ? Number(req.query.client_id) : undefined;
  const statusFilter = req.query.status ? String(req.query.status).split(",") : undefined;

  let bills = await db
    .select({
      bill: apBillsTable,
      client_name: clientsTable.name,
    })
    .from(apBillsTable)
    .leftJoin(clientsTable, eq(apBillsTable.client_id, clientsTable.id));

  if (clientId) bills = bills.filter(r => r.bill.client_id === clientId);
  if (statusFilter?.length) bills = bills.filter(r => statusFilter.includes(r.bill.status));

  const result = bills.map(r => ({ ...r.bill, client_name: r.client_name }));
  res.json(result);
});

// POST /ap/bills
router.post("/ap/bills", requireAuth, async (req, res) => {
  const body = CreateApBillBody.parse(req.body);
  const [bill] = await db.insert(apBillsTable).values({
    ...body,
    status: "upcoming",
  }).returning();
  res.status(201).json(bill);
});

// PATCH /ap/bills/:id
router.patch("/ap/bills/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const body = UpdateApBillBody.parse(req.body);
  const [updated] = await db.update(apBillsTable)
    .set({ ...body, updated_at: new Date() })
    .where(eq(apBillsTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Bill not found" });
  res.json(updated);
});

// DELETE /ap/bills/:id
router.delete("/ap/bills/:id", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(apBillsTable).where(eq(apBillsTable.id, id));
  res.json({ ok: true });
});

// GET /ap/settings/:clientId
router.get("/ap/settings/:clientId", requireAuth, async (req, res) => {
  const clientId = Number(req.params.clientId);
  const [settings] = await db.select().from(apClientSettingsTable)
    .where(eq(apClientSettingsTable.client_id, clientId));
  if (!settings) {
    return res.json({
      client_id: clientId,
      cycle_window_days: 14,
      payment_day: "tuesday",
      approval_send_day: "wednesday",
      snooze_auto: true,
    });
  }
  res.json(settings);
});

// PUT /ap/settings/:clientId
router.put("/ap/settings/:clientId", requireAuth, async (req, res) => {
  const clientId = Number(req.params.clientId);
  const body = UpsertApSettingsBody.parse(req.body);
  const existing = await db.select().from(apClientSettingsTable)
    .where(eq(apClientSettingsTable.client_id, clientId));

  if (existing.length === 0) {
    const [created] = await db.insert(apClientSettingsTable).values({
      client_id: clientId,
      cycle_window_days: body.cycle_window_days ?? 14,
      payment_day: body.payment_day ?? "tuesday",
      approval_send_day: body.approval_send_day ?? "wednesday",
      snooze_auto: body.snooze_auto ?? true,
    }).returning();
    return res.json(created);
  }

  const [updated] = await db.update(apClientSettingsTable)
    .set({ ...body, updated_at: new Date() })
    .where(eq(apClientSettingsTable.client_id, clientId))
    .returning();
  res.json(updated);
});

// POST /ap/bills/:id/snooze — calculate and apply snooze date
router.post("/ap/bills/:id/snooze", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const { snooze_until, manual } = req.body as { snooze_until?: string; manual?: boolean };

  const [bill] = await db.select().from(apBillsTable).where(eq(apBillsTable.id, id));
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  let snoozeDate = snooze_until;
  if (!snoozeDate || !manual) {
    const [settings] = await db.select().from(apClientSettingsTable)
      .where(eq(apClientSettingsTable.client_id, bill.client_id));
    const payDay = settings?.payment_day ?? "tuesday";
    snoozeDate = nextCycleDate(payDay);
  }

  const [updated] = await db.update(apBillsTable)
    .set({ status: "snoozed", snooze_until: snoozeDate, updated_at: new Date() })
    .where(eq(apBillsTable.id, id))
    .returning();
  res.json(updated);
});

export default router;
