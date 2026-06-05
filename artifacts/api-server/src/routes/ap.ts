import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { requireAdmin } from "../middleware/auth";
import { db } from "@workspace/db";
import { apBillsTable, apClientSettingsTable, clientsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import * as zod from "zod";
import { sendMail, template } from "../lib/mailer";
import { notifyAdmins } from "../lib/notify";

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

// ── Email helper ─────────────────────────────────────────────────────────────
function fmtCurrency(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function buildApprovalEmailBody(
  firstName: string,
  bills: typeof apBillsTable.$inferSelect[],
  portalLink: string,
): string {
  const billRowsHtml = bills.map(b => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#475569;">${fmtDate(b.due_date)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;font-weight:500;">${b.vendor}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#475569;">${b.category ?? "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;font-weight:600;text-align:right;">${fmtCurrency(b.amount)}</td>
    </tr>`).join("");

  const totalAmt = bills.reduce((s, b) => s + b.amount, 0);
  const count = bills.length;
  const notesHtml = bills.some(b => b.notes)
    ? `<div style="margin-bottom:24px;">${bills.filter(b => b.notes).map(b =>
        `<p style="margin:0 0 8px;padding:12px 14px;background:#f1f5f9;border-left:3px solid #266b75;border-radius:4px;font-size:13px;color:#475569;"><strong>${b.vendor}:</strong> ${b.notes}</p>`
      ).join("")}</div>`
    : "";

  return `
    <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#1e293b;">Hi ${firstName},</p>
    <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
      You have <strong>${count} bill${count === 1 ? "" : "s"}</strong> pending your approval.
      Please review the details below and reply with your approval, or contact us with any questions.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;border-bottom:1px solid #e2e8f0;">Due Date</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;border-bottom:1px solid #e2e8f0;">Vendor</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;border-bottom:1px solid #e2e8f0;">Category</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;border-bottom:1px solid #e2e8f0;">Amount</th>
        </tr>
      </thead>
      <tbody>${billRowsHtml}</tbody>
      <tfoot>
        <tr style="background:#f8fafc;">
          <td colspan="3" style="padding:10px 12px;font-size:13px;font-weight:600;color:#1e293b;border-top:2px solid #e2e8f0;">Total</td>
          <td style="padding:10px 12px;font-size:15px;font-weight:700;color:#1e293b;text-align:right;border-top:2px solid #e2e8f0;">${fmtCurrency(totalAmt)}</td>
        </tr>
      </tfoot>
    </table>
    ${notesHtml}
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;">
      Simply reply to this email with <strong>"Approved"</strong> or log into your portal to manage your bills.
    </p>
    <p style="margin:0 0 32px;text-align:center;">
      <a href="${portalLink}" style="display:inline-block;background:#266b75;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:-0.2px;">
        View Your Portal →
      </a>
    </p>
    <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6;">
      Thank you,<br>
      <strong style="color:#1e293b;">Hiedi</strong><br>
      HM Virtual Services
    </p>`;
}

// POST /ap/bills/:id/send-approval — send approval email for a single bill
router.post("/ap/bills/:id/send-approval", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .select({ bill: apBillsTable, client_name: clientsTable.name, email: clientsTable.email, contact_name: clientsTable.contact_name })
    .from(apBillsTable)
    .leftJoin(clientsTable, eq(apBillsTable.client_id, clientsTable.id))
    .where(eq(apBillsTable.id, id));

  if (!row) return res.status(404).json({ error: "Bill not found" });

  const firstName = ((row.contact_name ?? row.client_name) ?? "").split(" ")[0] || "there";
  const portalLink = "https://hmvirtualservices.com/client/ap";
  const now = new Date();
  const monthYear = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Update status
  await db.update(apBillsTable)
    .set({ status: "sent_for_approval", updated_at: now })
    .where(eq(apBillsTable.id, id));

  let emailSent = false;
  let emailError = "";
  if (row.email) {
    try {
      await sendMail(
        row.email,
        `Bill Approval Needed — ${monthYear}`,
        template(buildApprovalEmailBody(firstName, [row.bill], portalLink)),
      );
      emailSent = true;
    } catch (err: any) {
      emailError = err?.message ?? "Email send failed";
    }
  }

  res.json({ ok: true, emailSent, emailAddress: row.email ?? null, emailError: emailError || undefined });
});

// POST /ap/bills/batch-send-approval — send approval emails for multiple bills (grouped by client)
router.post("/ap/bills/batch-send-approval", requireAdmin, async (req, res) => {
  const { bill_ids } = req.body as { bill_ids?: number[] };
  if (!Array.isArray(bill_ids) || bill_ids.length === 0) {
    return res.status(400).json({ error: "bill_ids required" });
  }

  const rows = await db
    .select({ bill: apBillsTable, client_name: clientsTable.name, email: clientsTable.email, contact_name: clientsTable.contact_name })
    .from(apBillsTable)
    .leftJoin(clientsTable, eq(apBillsTable.client_id, clientsTable.id))
    .where(inArray(apBillsTable.id, bill_ids));

  if (rows.length === 0) return res.status(404).json({ error: "No bills found" });

  // Group by client_id
  const byClient = new Map<number, typeof rows>();
  for (const row of rows) {
    const cid = row.bill.client_id;
    if (!byClient.has(cid)) byClient.set(cid, []);
    byClient.get(cid)!.push(row);
  }

  const now = new Date();
  const monthYear = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const portalLink = "https://hmvirtualservices.com/client/ap";
  const results: { clientId: number; emailSent: boolean; emailAddress: string | null; emailError?: string }[] = [];

  for (const [clientId, clientRows] of byClient) {
    // Update all bills for this client
    await db.update(apBillsTable)
      .set({ status: "sent_for_approval", updated_at: now })
      .where(inArray(apBillsTable.id, clientRows.map(r => r.bill.id)));

    const { email, contact_name, client_name } = clientRows[0];
    const firstName = ((contact_name ?? client_name) ?? "").split(" ")[0] || "there";
    let emailSent = false;
    let emailError = "";
    if (email) {
      try {
        await sendMail(
          email,
          `Bills Pending Your Approval — ${monthYear}`,
          template(buildApprovalEmailBody(firstName, clientRows.map(r => r.bill), portalLink)),
        );
        emailSent = true;
      } catch (err: any) {
        emailError = err?.message ?? "Email send failed";
      }
    }
    results.push({ clientId, emailSent, emailAddress: email ?? null, emailError: emailError || undefined });
  }

  res.json({ ok: true, results });
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

// POST /ap/bills/:id/client-snooze — client snoozes a bill (ownership-checked)
router.post("/ap/bills/:id/client-snooze", requireAuth, async (req, res) => {
  const user = (req as any).session?.user;
  if (!user?.client_id) return res.status(403).json({ error: "Client access only" });

  const id = Number(req.params.id);
  const { snooze_option, custom_date } = req.body as {
    snooze_option: "next_cycle" | "due_date" | "custom";
    custom_date?: string;
  };

  const [bill] = await db.select().from(apBillsTable)
    .where(and(eq(apBillsTable.id, id), eq(apBillsTable.client_id, user.client_id)));

  if (!bill) return res.status(404).json({ error: "Bill not found" });
  if (!["sent_for_approval", "snoozed"].includes(bill.status)) {
    return res.status(409).json({ error: "Bill cannot be snoozed in its current state" });
  }

  let snoozeDate: string;
  if (snooze_option === "due_date") {
    snoozeDate = bill.due_date;
  } else if (snooze_option === "custom" && custom_date) {
    snoozeDate = custom_date;
  } else {
    const [settings] = await db.select().from(apClientSettingsTable)
      .where(eq(apClientSettingsTable.client_id, user.client_id));
    const payDay = settings?.payment_day ?? "tuesday";
    snoozeDate = nextCycleDate(payDay);
  }

  const [updated] = await db.update(apBillsTable)
    .set({ status: "snoozed", snooze_until: snoozeDate, updated_at: new Date() })
    .where(eq(apBillsTable.id, id))
    .returning();

  // Notify admins
  notifyAdmins({
    type: "ap_bill_response",
    title: "AP Bill Snoozed",
    message: `Client snoozed "${bill.vendor}" (${bill.amount}) — status updated to Snoozed.`,
    entityType: "ap_bill",
    entityId: id,
  });

  res.json(updated);
});

// GET /ap/bills/my-bills — client-facing: returns this client's non-upcoming bills
router.get("/ap/bills/my-bills", requireAuth, async (req, res) => {
  const user = (req as any).session?.user;
  if (!user?.client_id) return res.status(403).json({ error: "Client access only" });

  await runAutoTransitions([user.client_id]);

  const bills = await db
    .select()
    .from(apBillsTable)
    .where(and(
      eq(apBillsTable.client_id, user.client_id),
    ));

  // Only show bills that have been sent for approval or beyond (not internal "upcoming")
  const visible = bills.filter(b =>
    ["sent_for_approval", "approved", "snoozed", "rejected", "paid"].includes(b.status)
  );

  res.json(visible.sort((a, b) => a.due_date.localeCompare(b.due_date)));
});

// POST /ap/bills/:id/client-respond — client approves or rejects a bill
router.post("/ap/bills/:id/client-respond", requireAuth, async (req, res) => {
  const user = (req as any).session?.user;
  if (!user?.client_id) return res.status(403).json({ error: "Client access only" });

  const id = Number(req.params.id);
  const { action, note } = req.body as { action: "approve" | "reject"; note?: string };

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "action must be 'approve' or 'reject'" });
  }

  const [bill] = await db.select().from(apBillsTable)
    .where(and(eq(apBillsTable.id, id), eq(apBillsTable.client_id, user.client_id)));

  if (!bill) return res.status(404).json({ error: "Bill not found" });
  if (bill.status !== "sent_for_approval") {
    return res.status(409).json({ error: "Bill is not awaiting approval" });
  }

  const newStatus = action === "approve" ? "approved" : "rejected";
  const [updated] = await db.update(apBillsTable)
    .set({
      status: newStatus,
      client_response_note: note ?? null,
      updated_at: new Date(),
    })
    .where(eq(apBillsTable.id, id))
    .returning();

  // Notify admins
  notifyAdmins({
    type: "ap_bill_response",
    title: action === "approve" ? "AP Bill Approved" : "AP Bill Rejected",
    message: action === "approve"
      ? `Client approved "${bill.vendor}" (${bill.amount}).`
      : `Client rejected "${bill.vendor}" (${bill.amount})${note ? `: "${note}"` : "."}`,
    entityType: "ap_bill",
    entityId: id,
  });

  res.json(updated);
});

// PATCH /ap/bills/:id/client-status — client changes a rejected/snoozed bill status
router.patch("/ap/bills/:id/client-status", requireAuth, async (req, res) => {
  const user = (req as any).session?.user;
  if (!user?.client_id) return res.status(403).json({ error: "Client access only" });

  const id = Number(req.params.id);
  const { new_status, note } = req.body as {
    new_status: "sent_for_approval" | "approved";
    note?: string;
  };

  if (!["sent_for_approval", "approved"].includes(new_status)) {
    return res.status(400).json({ error: "new_status must be 'sent_for_approval' or 'approved'" });
  }

  const [bill] = await db.select().from(apBillsTable)
    .where(and(eq(apBillsTable.id, id), eq(apBillsTable.client_id, user.client_id)));

  if (!bill) return res.status(404).json({ error: "Bill not found" });
  if (!["rejected", "snoozed"].includes(bill.status)) {
    return res.status(409).json({ error: "Only rejected or snoozed bills can be updated" });
  }

  const [updated] = await db.update(apBillsTable)
    .set({
      status: new_status,
      client_response_note: note ?? null,
      snooze_until: new_status === "approved" ? null : bill.snooze_until,
      updated_at: new Date(),
    })
    .where(eq(apBillsTable.id, id))
    .returning();

  // Notify admins of the status change
  notifyAdmins({
    type: "ap_bill_status_changed",
    title: "AP Bill Status Updated by Client",
    message: new_status === "approved"
      ? `Client approved "${bill.vendor}" (${bill.amount}) — previously ${bill.status}.`
      : `Client re-submitted "${bill.vendor}" (${bill.amount}) for approval — previously ${bill.status}.`,
    entityType: "ap_bill",
    entityId: id,
  });

  res.json(updated);
});

export default router;
