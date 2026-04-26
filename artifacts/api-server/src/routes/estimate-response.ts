import { Router, type IRouter } from "express";
import crypto from "crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import { invoicesTable, recurringInvoicesTable, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logAudit } from "../lib/audit";
import { notifyAdmins } from "../lib/notify";

const router: IRouter = Router();

// Helper to look up an estimate by action_token (public — no auth needed)
async function getEstimateByToken(token: string) {
  const [row] = await db
    .select({
      id: invoicesTable.id,
      client_id: invoicesTable.client_id,
      type: invoicesTable.type,
      status: invoicesTable.status,
      amount: invoicesTable.amount,
      description: invoicesTable.description,
      line_items: invoicesTable.line_items,
      notes: invoicesTable.notes,
      thank_you_message: invoicesTable.thank_you_message,
      due_date: invoicesTable.due_date,
      action_token: (invoicesTable as any).action_token,
      client_name: clientsTable.name,
      client_email: clientsTable.email,
    })
    .from(invoicesTable)
    .leftJoin(clientsTable, eq(invoicesTable.client_id, clientsTable.id))
    .where(eq((invoicesTable as any).action_token, token));
  return row ?? null;
}

// ── GET /api/estimate-response/:token ────────────────────────────────────────
// Public — returns the estimate details for display on the response page.
router.get("/estimate-response/:token", async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 32) { res.status(400).json({ error: "Invalid token" }); return; }

  const row = await getEstimateByToken(token);
  if (!row) { res.status(404).json({ error: "Estimate not found or link has expired" }); return; }
  if (row.type !== "estimate") { res.status(400).json({ error: "Not an estimate" }); return; }

  res.json({
    id: row.id,
    status: row.status,
    amount: row.amount,
    description: row.description,
    line_items: row.line_items,
    notes: row.notes,
    thank_you_message: row.thank_you_message,
    due_date: row.due_date,
    client_name: row.client_name,
  });
});

// ── POST /api/estimate-response/:token/start-services ───────────────────────
// Public — no auth required. Client accepts estimate and starts services.
const StartServicesBody = z.object({
  start_type: z.enum(["immediate", "future"]),
  start_date: z.string().optional(),
  payment: z.enum(["pay_now", "request_invoice"]),
});

router.post("/estimate-response/:token/start-services", async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 32) { res.status(400).json({ error: "Invalid token" }); return; }

  const body = StartServicesBody.parse(req.body);
  const row = await getEstimateByToken(token);

  if (!row) { res.status(404).json({ error: "Estimate not found or link has expired" }); return; }
  if (row.type !== "estimate") { res.status(400).json({ error: "Not an estimate" }); return; }
  if (row.status !== "sent" && row.status !== "accepted") {
    res.status(400).json({ error: "Estimate is no longer available for response" }); return;
  }
  if (!row.client_id) { res.status(400).json({ error: "Estimate has no associated client" }); return; }

  function addDays(dateStr: string, n: number): string {
    const d = new Date(dateStr + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().split("T")[0]!;
  }
  function addOneMonth(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split("T")[0]!;
  }

  const todayStr = new Date().toISOString().split("T")[0]!;
  const effectiveStartDate = body.start_type === "immediate"
    ? addDays(todayStr, 1)
    : (body.start_date ?? addDays(todayStr, 1));

  // Mark estimate as accepted and clear token (consumed)
  await db
    .update(invoicesTable)
    .set({ status: "accepted", updated_at: new Date() } as any)
    .where(eq(invoicesTable.id, row.id));

  // Create recurring invoice series
  const [recurringRow] = await db.insert(recurringInvoicesTable).values({
    client_id: row.client_id,
    frequency: "monthly",
    start_date: effectiveStartDate,
    next_due_date: addOneMonth(effectiveStartDate),
    description: row.description ?? null,
    line_items: row.line_items ?? null,
    notes: row.notes ?? null,
    thank_you_message: row.thank_you_message ?? null,
    amount: row.amount,
    active: true,
    auto_send: true,
  }).returning();

  // Create first invoice
  const [firstInvoice] = await db.insert(invoicesTable).values({
    client_id: row.client_id,
    amount: row.amount,
    type: "invoice",
    status: "unpaid",
    billing_type: "recurring",
    due_date: effectiveStartDate,
    description: row.description ?? null,
    line_items: row.line_items ?? null,
    notes: row.notes ?? null,
    thank_you_message: row.thank_you_message ?? null,
    recurring_id: recurringRow.id,
    updated_at: new Date(),
  }).returning();

  logAudit("invoice", row.id, "start_services", `Services started from estimate #${row.id} via email link — recurring series #${recurringRow.id} created`, { id: 0, name: row.client_name ?? "client" });

  // Notify admins
  try {
    await notifyAdmins({
      type: "invoice_updated",
      title: `Estimate #${row.id} accepted — services starting`,
      message: `${row.client_name ?? "Client"} accepted estimate #${row.id} and is starting services on ${effectiveStartDate}. Recurring series #${recurringRow.id} created.`,
      entityType: "invoice",
      entityId: row.id,
    });
  } catch { /* ignore */ }

  if (body.payment === "pay_now") {
    let paymentUrl: string | null = null;
    try {
      const { createSquarePaymentLink } = await import("../lib/squareClient");
      const origin = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
      paymentUrl = await createSquarePaymentLink({
        amountDollars: row.amount,
        name: `Invoice #${firstInvoice.id} — Services starting ${effectiveStartDate}`,
        invoiceId: firstInvoice.id,
        successUrl: `${origin}/estimate-response?token=${token}&payment=success`,
      });
    } catch { /* Square not configured */ }

    res.json({ success: true, first_invoice_id: firstInvoice.id, recurring_id: recurringRow.id, payment_url: paymentUrl });
  } else {
    // Send first invoice email
    try {
      const { sendMail, template: mailTemplate, isMailConfigured } = await import("../lib/mailer");
      if (isMailConfigured() && row.client_email) {
        const fmtAmount = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
        const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
        let payUrl: string | null = null;
        try {
          const { createSquarePaymentLink } = await import("../lib/squareClient");
          const origin = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
          payUrl = await createSquarePaymentLink({
            amountDollars: row.amount,
            name: `Invoice #${firstInvoice.id}`,
            invoiceId: firstInvoice.id,
            successUrl: `${origin}/portal?payment=success&invoice=${firstInvoice.id}`,
          });
        } catch { /* ignore */ }

        const payBtnHtml = payUrl
          ? `<div style="text-align:center;margin:24px 0;"><a href="${payUrl}" style="display:inline-block;background:#266b75;color:#fff;font-size:16px;font-weight:700;padding:14px 36px;border-radius:8px;text-decoration:none;">Pay Now — ${fmtAmount(row.amount)}</a></div>`
          : "";

        const emailBody = `
          <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Invoice #${firstInvoice.id}</h2>
          <p style="margin:0 0 20px;color:#475569;">Hi ${row.client_name ?? "there"},</p>
          <p style="color:#475569;">Thank you for accepting our proposal! Your services are scheduled to begin on <strong>${fmtDate(effectiveStartDate)}</strong>. Please find your first invoice below.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
            <tr><td style="color:#64748b;font-size:13px;padding:4px 0;">Due Date</td><td style="text-align:right;font-weight:600;color:#1e293b;font-size:13px;">${fmtDate(effectiveStartDate)}</td></tr>
            ${row.description ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;">Description</td><td style="text-align:right;color:#1e293b;font-size:13px;">${row.description}</td></tr>` : ""}
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:8px;margin:20px 0;">
            <tr><td style="padding:16px 20px;color:#94a3b8;font-size:13px;">Total Due</td><td style="padding:16px 20px;text-align:right;color:#ffffff;font-size:22px;font-weight:700;">${fmtAmount(row.amount)}</td></tr>
          </table>
          ${payBtnHtml}
        `;
        await sendMail(row.client_email, `Invoice #${firstInvoice.id} — ${fmtAmount(row.amount)} due ${fmtDate(effectiveStartDate)}`, mailTemplate(emailBody));
        await db.update(invoicesTable).set({ status: "sent", updated_at: new Date() }).where(eq(invoicesTable.id, firstInvoice.id));
      }
    } catch { /* ignore */ }

    res.json({ success: true, first_invoice_id: firstInvoice.id, recurring_id: recurringRow.id, payment_url: null });
  }
});

// ── POST /api/estimate-response/:token/decline ───────────────────────────────
// Public — no auth required. Client declines/requests changes.
const DeclineFeedbackBody = z.object({
  reason: z.string().min(1),
});

router.post("/estimate-response/:token/decline", async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 32) { res.status(400).json({ error: "Invalid token" }); return; }

  const { reason } = DeclineFeedbackBody.parse(req.body);
  const row = await getEstimateByToken(token);

  if (!row) { res.status(404).json({ error: "Estimate not found or link has expired" }); return; }
  if (row.type !== "estimate") { res.status(400).json({ error: "Not an estimate" }); return; }

  const [updated] = await db
    .update(invoicesTable)
    .set({ status: "declined", decline_reason: reason, updated_at: new Date() } as any)
    .where(eq(invoicesTable.id, row.id))
    .returning();

  res.json({ success: true, id: updated.id, status: updated.status });
  logAudit("invoice", row.id, "declined", `Estimate #${row.id} declined via email link`, { id: 0, name: row.client_name ?? "client" });

  try {
    await notifyAdmins({
      type: "invoice_updated",
      title: `Estimate #${row.id} — Changes Requested`,
      message: `${row.client_name ?? "Client"} requested changes to estimate #${row.id}: "${reason}"`,
      entityType: "invoice",
      entityId: row.id,
    });
  } catch { /* ignore */ }
});

export default router;
