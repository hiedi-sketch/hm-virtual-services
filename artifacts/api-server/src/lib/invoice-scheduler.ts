import { db } from "@workspace/db";
import {
  invoicesTable,
  recurringInvoicesTable,
  invoiceRemindersTable,
  clientsTable,
} from "@workspace/db";
import { eq, and, lte, isNull, not, inArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import { sendMail, template, isMailConfigured } from "./mailer";
import type { ReminderType } from "@workspace/db";

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0]!;
}

function subtractDays(dateStr: string, days: number): string {
  return addDays(dateStr, -days);
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function fmtAmount(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

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

// ── Square payment link (optional) ───────────────────────────────────────────

async function tryCreateSquareUrl(invoiceId: number, amount: number, description: string | null, _dueDate: string): Promise<string | null> {
  try {
    const { createSquarePaymentLink } = await import("./squareClient");
    const origin = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    return await createSquarePaymentLink({
      amountDollars: amount,
      name: `Invoice #${invoiceId}`,
      invoiceId,
      successUrl: `${origin}/invoices?payment=success&invoice=${invoiceId}`,
    });
  } catch {
    return null;
  }
}

// ── Invoice email body ────────────────────────────────────────────────────────

function buildInvoiceEmail(params: {
  invoiceId: number;
  clientName: string;
  amount: number;
  dueDate: string;
  description: string | null;
  lineItems: { name: string; description?: string; qty: number; unit_price: number }[] | null;
  notes: string | null;
  thankYouMessage: string | null;
  payUrl: string | null;
  servicePeriodStart?: string | null;
  servicePeriodEnd?: string | null;
}): string {
  const lineItemsHtml = params.lineItems && params.lineItems.length > 0
    ? `<table width="100%" cellpadding="6" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-size:14px;">
        <thead>
          <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
            <th style="text-align:left;padding:8px 10px;color:#64748b;">Item</th>
            <th style="text-align:center;padding:8px 10px;color:#64748b;">Qty</th>
            <th style="text-align:right;padding:8px 10px;color:#64748b;">Unit Price</th>
            <th style="text-align:right;padding:8px 10px;color:#64748b;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${params.lineItems.map(li => `
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:8px 10px;color:#1e293b;">${li.name}${li.description ? `<br><span style="font-size:12px;color:#94a3b8;">${li.description}</span>` : ""}</td>
              <td style="padding:8px 10px;text-align:center;color:#475569;">${li.qty}</td>
              <td style="padding:8px 10px;text-align:right;color:#475569;">${fmtAmount(li.unit_price)}</td>
              <td style="padding:8px 10px;text-align:right;font-weight:600;color:#1e293b;">${fmtAmount(li.qty * li.unit_price)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>`
    : "";

  const payButtonHtml = params.payUrl
    ? `<div style="text-align:center;margin:28px 0;">
        <a href="${params.payUrl}" style="display:inline-block;background:#266b75;color:#ffffff;font-size:16px;font-weight:700;padding:14px 36px;border-radius:8px;text-decoration:none;">
          Pay Now — ${fmtAmount(params.amount)}
        </a>
        <p style="margin:10px 0 0;font-size:12px;color:#94a3b8;">Secure payment powered by Stripe.</p>
      </div>`
    : "";

  return `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Invoice #${params.invoiceId}</h2>
    <p style="margin:0 0 20px;color:#475569;">Hi ${params.clientName},</p>
    <p style="color:#475569;">Please find your invoice details below.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="color:#64748b;font-size:13px;padding:4px 0;">Due Date</td>
        <td style="text-align:right;font-weight:600;color:#1e293b;font-size:13px;">${fmtDate(params.dueDate)}</td>
      </tr>
      ${params.servicePeriodStart && params.servicePeriodEnd ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;">Service Period</td><td style="text-align:right;color:#1e293b;font-size:13px;">${fmtDate(params.servicePeriodStart)} – ${fmtDate(params.servicePeriodEnd)}</td></tr>` : ""}
      ${params.description ? `<tr><td style="color:#64748b;font-size:13px;padding:4px 0;">Description</td><td style="text-align:right;color:#1e293b;font-size:13px;">${params.description}</td></tr>` : ""}
    </table>
    ${lineItemsHtml}
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:8px;margin:20px 0;">
      <tr>
        <td style="padding:16px 20px;color:#94a3b8;font-size:13px;">Total Due</td>
        <td style="padding:16px 20px;text-align:right;color:#ffffff;font-size:22px;font-weight:700;">${fmtAmount(params.amount)}</td>
      </tr>
    </table>
    ${payButtonHtml}
    ${params.notes ? `<p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:16px;">${params.notes}</p>` : ""}
    ${params.thankYouMessage ? `<p style="color:#475569;font-size:14px;margin-top:16px;font-style:italic;">${params.thankYouMessage}</p>` : ""}
  `;
}

// ── Reminder email body ───────────────────────────────────────────────────────

function buildReminderEmail(params: {
  invoiceId: number;
  clientName: string;
  amount: number;
  dueDate: string;
  type: ReminderType;
  payUrl: string | null;
}): string {
  const messages: Record<ReminderType, string> = {
    due: "Your invoice is due today. Please arrange payment at your earliest convenience.",
    day3: "Your invoice is now <strong>3 days overdue</strong>. Please make payment as soon as possible.",
    day5: "Your invoice is <strong>5 days overdue</strong>. Please note that <strong>late fees will begin tomorrow</strong> if payment has not been received.",
    day10: "Your invoice is now <strong>10 days overdue</strong>. Please make payment immediately to avoid further action.",
  };

  const subjects: Record<ReminderType, string> = {
    due: `Payment Reminder — Invoice #${params.invoiceId} due today`,
    day3: `Invoice #${params.invoiceId} is 3 days overdue`,
    day5: `Invoice #${params.invoiceId} is 5 days overdue — late fees apply tomorrow`,
    day10: `Invoice #${params.invoiceId} is 10 days overdue — immediate action required`,
  };

  const urgencyColors: Record<ReminderType, string> = {
    due: "#f59e0b",
    day3: "#f97316",
    day5: "#ef4444",
    day10: "#991b1b",
  };

  const payButtonHtml = params.payUrl
    ? `<div style="text-align:center;margin:28px 0;">
        <a href="${params.payUrl}" style="display:inline-block;background:#266b75;color:#ffffff;font-size:16px;font-weight:700;padding:14px 36px;border-radius:8px;text-decoration:none;">
          Pay Now — ${fmtAmount(params.amount)}
        </a>
        <p style="margin:10px 0 0;font-size:12px;color:#94a3b8;">Secure payment powered by Stripe.</p>
      </div>`
    : "";

  return `
    <div style="border-left:4px solid ${urgencyColors[params.type]};padding:12px 16px;background:#fff7ed;border-radius:0 8px 8px 0;margin-bottom:20px;">
      <p style="margin:0;font-size:15px;color:#7c2d12;">${messages[params.type]}</p>
    </div>
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Invoice #${params.invoiceId}</h2>
    <p style="margin:0 0 20px;color:#475569;">Hi ${params.clientName},</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:8px;margin:20px 0;">
      <tr>
        <td style="padding:16px 20px;color:#94a3b8;font-size:13px;">Amount Due</td>
        <td style="padding:16px 20px;text-align:right;color:#ffffff;font-size:22px;font-weight:700;">${fmtAmount(params.amount)}</td>
      </tr>
      <tr>
        <td style="padding:0 20px 16px;color:#94a3b8;font-size:13px;">Due Date</td>
        <td style="padding:0 20px 16px;text-align:right;color:#94a3b8;font-size:13px;">${fmtDate(params.dueDate)}</td>
      </tr>
    </table>
    ${payButtonHtml}
    <p style="color:#94a3b8;font-size:12px;margin-top:20px;">If you have already made payment, please disregard this message.</p>
  `;
}

// ── Exported subject helper ───────────────────────────────────────────────────

export function getReminderSubject(type: ReminderType, invoiceId: number, amount: number): string {
  const subjects: Record<ReminderType, string> = {
    due: `Payment Reminder — Invoice #${invoiceId} due today`,
    day3: `Invoice #${invoiceId} is 3 days overdue`,
    day5: `Invoice #${invoiceId} is 5 days overdue — late fees apply tomorrow`,
    day10: `Invoice #${invoiceId} is 10 days overdue — immediate action required`,
  };
  return subjects[type];
}

// ── Core reminder sender ──────────────────────────────────────────────────────

export async function sendReminderForInvoice(
  invoiceId: number,
  type: ReminderType,
  skipDuplicateCheck = false,
): Promise<{ sent: boolean; reason?: string }> {
  // Load invoice + client
  const [row] = await db
    .select({
      id: invoicesTable.id,
      client_id: invoicesTable.client_id,
      amount: invoicesTable.amount,
      status: invoicesTable.status,
      due_date: invoicesTable.due_date,
      description: invoicesTable.description,
      line_items: invoicesTable.line_items,
      notes: invoicesTable.notes,
      thank_you_message: invoicesTable.thank_you_message,
      client_name: clientsTable.name,
      client_email: clientsTable.email,
    })
    .from(invoicesTable)
    .leftJoin(clientsTable, eq(invoicesTable.client_id, clientsTable.id))
    .where(eq(invoicesTable.id, invoiceId));

  if (!row) return { sent: false, reason: "Invoice not found" };
  if (!row.client_email) return { sent: false, reason: "Client has no email" };
  if (row.status === "paid" || row.status === "void") return { sent: false, reason: "Invoice is paid or void" };

  // Duplicate check
  if (!skipDuplicateCheck) {
    const existing = await db
      .select({ id: invoiceRemindersTable.id })
      .from(invoiceRemindersTable)
      .where(and(eq(invoiceRemindersTable.invoice_id, invoiceId), eq(invoiceRemindersTable.type, type)))
      .limit(1);
    if (existing.length > 0) return { sent: false, reason: "Already sent" };
  }

  const payUrl = await tryCreateSquareUrl(row.id, row.amount, row.description, row.due_date);

  const emailHtml = buildReminderEmail({
    invoiceId: row.id,
    clientName: row.client_name ?? "there",
    amount: row.amount,
    dueDate: row.due_date,
    type,
    payUrl,
  });

  await sendMail(
    row.client_email,
    getReminderSubject(type, row.id, row.amount),
    template(emailHtml),
  );

  // Record the reminder
  await db.insert(invoiceRemindersTable).values({ invoice_id: invoiceId, type });

  return { sent: true };
}

// ── Daily reminder runner ─────────────────────────────────────────────────────

export async function runDailyReminders(): Promise<void> {
  const today = todayStr();

  // Load all unpaid, non-void invoices
  const invoices = await db
    .select({
      id: invoicesTable.id,
      due_date: invoicesTable.due_date,
      status: invoicesTable.status,
      client_email: clientsTable.email,
    })
    .from(invoicesTable)
    .leftJoin(clientsTable, eq(invoicesTable.client_id, clientsTable.id))
    .where(
      and(
        not(eq(invoicesTable.status, "paid")),
        not(eq(invoicesTable.status, "void")),
      )
    );

  // Get already-sent reminders for these invoice IDs
  const invoiceIds = invoices.map(i => i.id);
  if (invoiceIds.length === 0) return;

  const sentReminders = await db
    .select({ invoice_id: invoiceRemindersTable.invoice_id, type: invoiceRemindersTable.type })
    .from(invoiceRemindersTable)
    .where(inArray(invoiceRemindersTable.invoice_id, invoiceIds));

  const sentSet = new Set(sentReminders.map(r => `${r.invoice_id}:${r.type}`));

  let sent = 0;

  for (const inv of invoices) {
    if (!inv.client_email) continue;

    const remindersToCheck: { type: ReminderType; targetDate: string }[] = [
      { type: "due", targetDate: inv.due_date },
      { type: "day3", targetDate: addDays(inv.due_date, 3) },
      { type: "day5", targetDate: addDays(inv.due_date, 5) },
      { type: "day10", targetDate: addDays(inv.due_date, 10) },
    ];

    for (const { type, targetDate } of remindersToCheck) {
      if (targetDate !== today) continue;
      if (sentSet.has(`${inv.id}:${type}`)) continue;

      const result = await sendReminderForInvoice(inv.id, type, true);
      if (result.sent) {
        sentSet.add(`${inv.id}:${type}`);
        sent++;
        logger.info({ invoiceId: inv.id, type }, "Reminder sent");
      }
    }
  }

  if (sent > 0) logger.info({ count: sent }, "Daily reminders sent");
}

// ── Daily recurring invoice generator ────────────────────────────────────────

export async function runDailyRecurringInvoices(): Promise<void> {
  const today = todayStr();

  const due = await db
    .select()
    .from(recurringInvoicesTable)
    .where(
      and(
        eq(recurringInvoicesTable.active, true),
        lte(recurringInvoicesTable.next_due_date, today),
      )
    );

  let generated = 0;

  for (const template_ of due) {
    // Skip if past end_date
    if (template_.end_date && template_.end_date < today) {
      await db.update(recurringInvoicesTable).set({ active: false }).where(eq(recurringInvoicesTable.id, template_.id));
      continue;
    }

    const nextDue = computeNextDueDate(template_.frequency, template_.interval_days);

    // Advance service period for next cycle
    const nextServiceStart = template_.service_period_start
      ? advancePeriod(template_.service_period_start, template_.frequency, template_.interval_days)
      : null;
    const nextServiceEnd = template_.service_period_end
      ? advancePeriod(template_.service_period_end, template_.frequency, template_.interval_days)
      : null;

    const [invoice] = await db.insert(invoicesTable).values({
      client_id: template_.client_id,
      amount: template_.amount,
      status: "unpaid",
      due_date: template_.next_due_date,
      description: template_.description,
      line_items: template_.line_items,
      notes: template_.notes,
      thank_you_message: template_.thank_you_message,
      recurring_id: template_.id,
      service_period_start: template_.service_period_start,
      service_period_end: template_.service_period_end,
    }).returning();

    // Advance next_due_date and service period
    await db.update(recurringInvoicesTable)
      .set({
        next_due_date: nextDue,
        service_period_start: nextServiceStart,
        service_period_end: nextServiceEnd,
      })
      .where(eq(recurringInvoicesTable.id, template_.id));

    generated++;
    logger.info({ invoiceId: invoice.id, recurringId: template_.id }, "Recurring invoice generated");

    // Auto-send if configured
    if (template_.auto_send) {
      try {
        // Load client email
        const [client] = await db.select({ email: clientsTable.email, name: clientsTable.name })
          .from(clientsTable)
          .where(eq(clientsTable.id, template_.client_id));

        if (client?.email) {
          const payUrl = await tryCreateSquareUrl(invoice.id, invoice.amount, invoice.description, invoice.due_date);
          const body = buildInvoiceEmail({
            invoiceId: invoice.id,
            clientName: client.name,
            amount: invoice.amount,
            dueDate: invoice.due_date,
            description: invoice.description,
            lineItems: invoice.line_items as any,
            notes: invoice.notes,
            thankYouMessage: invoice.thank_you_message,
            payUrl,
            servicePeriodStart: invoice.service_period_start,
            servicePeriodEnd: invoice.service_period_end,
          });
          await sendMail(
            client.email,
            `Invoice #${invoice.id} — ${fmtAmount(invoice.amount)} due ${fmtDate(invoice.due_date)}`,
            template(body),
          );
          await db.update(invoicesTable).set({ status: "sent" }).where(eq(invoicesTable.id, invoice.id));
          logger.info({ invoiceId: invoice.id }, "Recurring invoice auto-sent");
        }
      } catch (err) {
        logger.error({ err, invoiceId: invoice.id }, "Failed to auto-send recurring invoice");
      }
    }
  }

  if (generated > 0) logger.info({ count: generated }, "Recurring invoices generated");
}
