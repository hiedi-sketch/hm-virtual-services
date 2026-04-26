import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db } from "@workspace/db";
import { invoicesTable, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getSquareAppConfig,
  createOrGetSquareCustomer,
  saveCardOnFile,
  processNoncePayment,
} from "../lib/squareClient";
import { sendMail, template } from "../lib/mailer";

const router: IRouter = Router();

function fmtAmount(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function fmtDate(s: string | null) {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

async function getInvoiceByPayToken(token: string) {
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
      due_date: invoicesTable.due_date,
      action_token: (invoicesTable as any).action_token,
      client_name: clientsTable.name,
      client_email: clientsTable.email,
      square_customer_id: (clientsTable as any).square_customer_id,
      square_card_id: (clientsTable as any).square_card_id,
      autopay_enabled: (clientsTable as any).autopay_enabled,
    })
    .from(invoicesTable)
    .leftJoin(clientsTable, eq(invoicesTable.client_id, clientsTable.id))
    .where(eq((invoicesTable as any).action_token, token));
  return row ?? null;
}

// ── GET /api/pay/:token — public — return invoice details + Square config ─────
router.get("/pay/:token", async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 32) { res.status(400).json({ error: "Invalid token" }); return; }

  const row = await getInvoiceByPayToken(token);
  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (row.type !== "invoice") { res.status(400).json({ error: "Not an invoice" }); return; }
  if (row.status === "paid" || row.status === "void") {
    res.json({ already_paid: true, status: row.status });
    return;
  }

  let squareConfig = null;
  try { squareConfig = await getSquareAppConfig(); } catch { /* not configured */ }

  res.json({
    id: row.id,
    status: row.status,
    amount: row.amount,
    description: row.description,
    line_items: row.line_items,
    notes: row.notes,
    due_date: row.due_date,
    client_name: row.client_name,
    autopay_enabled: row.autopay_enabled ?? false,
    has_card_on_file: !!(row.square_card_id),
    square: squareConfig,
  });
});

// ── POST /api/pay/:token — public — process payment + optionally save card ───
router.post("/pay/:token", async (req, res) => {
  const { token } = req.params;
  if (!token || token.length < 32) { res.status(400).json({ error: "Invalid token" }); return; }

  const row = await getInvoiceByPayToken(token);
  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (row.type !== "invoice") { res.status(400).json({ error: "Not an invoice" }); return; }
  if (row.status === "paid" || row.status === "void") {
    res.status(409).json({ error: "Invoice is already paid" });
    return;
  }
  if (!row.client_id || !row.client_email) {
    res.status(400).json({ error: "Invoice has no associated client" });
    return;
  }

  const { nonce, saveAutopay } = req.body as { nonce: string; saveAutopay?: boolean };
  if (!nonce) { res.status(400).json({ error: "Payment nonce is required" }); return; }

  const idempotencyKey = `pay-${row.id}-${crypto.randomBytes(8).toString("hex")}`;
  const amountCents = Math.round(row.amount * 100);

  // Process the payment
  let paymentId: string;
  let receiptUrl: string | null = null;
  try {
    const result = await processNoncePayment({
      nonce,
      amountCents,
      note: `Invoice #${row.id} — ${row.description ?? row.client_name ?? ""}`.trim(),
      idempotencyKey,
    });
    paymentId = result.paymentId;
    receiptUrl = result.receiptUrl;
  } catch (err: any) {
    res.status(402).json({ error: err.message ?? "Payment failed" });
    return;
  }

  // Mark invoice paid
  const paidAt = new Date().toISOString().slice(0, 10);
  await db
    .update(invoicesTable)
    .set({ status: "paid", paid_at: paidAt, payment_method: "square_card" })
    .where(eq(invoicesTable.id, row.id));

  // Save card on file if requested
  let autopayActivated = false;
  if (saveAutopay && row.client_email) {
    try {
      const customerId = await createOrGetSquareCustomer(
        row.client_id,
        row.client_name ?? row.client_email,
        row.client_email
      );
      const cardId = await saveCardOnFile(customerId, nonce);

      await db
        .update(clientsTable)
        .set({
          square_customer_id: customerId,
          square_card_id: cardId,
          autopay_enabled: true,
        } as any)
        .where(eq(clientsTable.id, row.client_id));

      autopayActivated = true;
    } catch (cardErr: any) {
      // Autopay setup failed — payment went through, just log it
      console.error("Failed to save card on file:", cardErr?.message);
    }
  }

  // Send receipt email
  try {
    const lineItemsHtml = Array.isArray(row.line_items) && row.line_items.length > 0
      ? `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin:16px 0;">
          <thead><tr style="background:#f8fafc;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#64748b;font-weight:600;">Item</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:#64748b;font-weight:600;">Amount</th>
          </tr></thead>
          <tbody>${(row.line_items as any[]).map((li: any) => `
            <tr style="border-top:1px solid #e2e8f0;">
              <td style="padding:8px 12px;color:#1e293b;">${li.name}</td>
              <td style="padding:8px 12px;text-align:right;color:#1e293b;">${fmtAmount(li.qty * li.unit_price)}</td>
            </tr>`).join("")}
          </tbody>
        </table>`
      : "";

    const receiptBody = `
      <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Payment Received</h2>
      <p style="margin:0 0 20px;color:#475569;">Hi ${row.client_name ?? "there"},</p>
      <p style="color:#475569;">Thank you — your payment for Invoice #${row.id} has been received.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
        <tr><td style="color:#64748b;font-size:13px;padding:4px 0;">Invoice</td>
            <td style="text-align:right;font-weight:600;color:#1e293b;font-size:13px;">#${row.id}</td></tr>
        ${row.description ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;">Description</td>
            <td style="text-align:right;color:#1e293b;font-size:13px;">${row.description}</td></tr>` : ""}
        <tr><td style="color:#64748b;font-size:13px;padding:4px 0;">Date Paid</td>
            <td style="text-align:right;font-weight:600;color:#1e293b;font-size:13px;">${fmtDate(paidAt)}</td></tr>
      </table>
      ${lineItemsHtml}
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:8px;margin:16px 0;">
        <tr>
          <td style="padding:16px 20px;color:#94a3b8;font-size:13px;">Amount Paid</td>
          <td style="padding:16px 20px;text-align:right;color:#ffffff;font-size:22px;font-weight:700;">${fmtAmount(row.amount)}</td>
        </tr>
      </table>
      ${receiptUrl ? `<p style="text-align:center;margin:16px 0;"><a href="${receiptUrl}" style="color:#266b75;font-size:14px;">View Square Receipt</a></p>` : ""}
      ${autopayActivated ? `<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;margin:16px 0;">
        <p style="margin:0;color:#15803d;font-size:14px;font-weight:600;">✓ Autopay Activated</p>
        <p style="margin:4px 0 0;color:#166534;font-size:13px;">Your card has been saved. Future recurring invoices will be charged automatically — no action needed.</p>
      </div>` : ""}
      ${row.notes ? `<p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:16px;">${row.notes}</p>` : ""}
    `;

    await sendMail(
      row.client_email,
      `Payment Confirmed — Invoice #${row.id}`,
      template(receiptBody)
    );
  } catch { /* receipt email failure is non-fatal */ }

  res.json({ success: true, receipt_url: receiptUrl, autopay_activated: autopayActivated });
});

export default router;
