import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { invoicesTable, clientsTable, tasksTable, timeEntriesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import PDFDocument from "pdfkit";
import {
  ListInvoicesQueryParams,
  CreateInvoiceBody,
  UpdateInvoiceParams,
  UpdateInvoiceBody,
  DeleteInvoiceParams,
  ConvertEstimateParams,
} from "@workspace/api-zod";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { logAudit } from "../lib/audit";
import { notifyAdmins, notifyClientUser } from "../lib/notify";

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

router.get("/invoices/:id/pdf", requireAuth, async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid invoice id" });
    return;
  }

  // ── Fetch invoice + client ─────────────────────────────────────────────
  const [row] = await db
    .select({
      id: invoicesTable.id,
      client_id: invoicesTable.client_id,
      amount: invoicesTable.amount,
      status: invoicesTable.status,
      due_date: invoicesTable.due_date,
      description: invoicesTable.description,
      client_name: clientsTable.name,
      client_email: clientsTable.email,
      monthly_fee: clientsTable.monthly_fee,
      monthly_hour_budget: clientsTable.monthly_hour_budget,
      service_type: clientsTable.service_type,
    })
    .from(invoicesTable)
    .leftJoin(clientsTable, eq(invoicesTable.client_id, clientsTable.id))
    .where(eq(invoicesTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  // ── Fetch tasks for this client ────────────────────────────────────────
  const tasks = await db
    .select({
      title: tasksTable.title,
      status: tasksTable.status,
      due_date: tasksTable.due_date,
    })
    .from(tasksTable)
    .where(eq(tasksTable.client_id, row.client_id))
    .orderBy(tasksTable.due_date);

  // ── Fetch total hours logged for this client ───────────────────────────
  const [hoursRow] = await db
    .select({ total_minutes: sql<number>`coalesce(sum(${timeEntriesTable.duration_minutes}), 0)` })
    .from(timeEntriesTable)
    .where(eq(timeEntriesTable.client_id, row.client_id));

  const totalMinutes = Number(hoursRow?.total_minutes ?? 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  // ── Helpers ───────────────────────────────────────────────────────────
  const fmtDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  const fmtAmount = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  // ── PDF setup ─────────────────────────────────────────────────────────
  const doc = new PDFDocument({ margin: 60, size: "LETTER" });
  const L = 60;    // left margin
  const R = 552;   // right edge
  const MID = 310; // mid column start

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="invoice-${row.id}.pdf"`);
  doc.pipe(res);

  // ── Header bar ────────────────────────────────────────────────────────
  doc.rect(L, 60, R - L, 50).fillColor("#1e293b").fill();
  doc.fontSize(22).font("Helvetica-Bold").fillColor("#ffffff")
    .text("INVOICE", L + 12, 73, { width: 220 });
  doc.fontSize(10).font("Helvetica").fillColor("#94a3b8")
    .text("HM Virtual Services Business Suite", MID, 73, { width: 230, align: "right" });
  doc.fontSize(10).fillColor("#cbd5e1")
    .text(`Invoice #${row.id}`, MID, 87, { width: 230, align: "right" });
  doc.moveDown(0);
  doc.y = 125;

  // ── Bill To  |  Invoice Meta ───────────────────────────────────────────
  const topY = doc.y;

  // Left: Bill To
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748b")
    .text("BILL TO", L, topY, { width: 220 });
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a")
    .text(row.client_name ?? "—", L, topY + 14, { width: 220 });
  doc.font("Helvetica").fontSize(10).fillColor("#475569")
    .text(row.client_email ?? "", L, topY + 29, { width: 220 });
  const serviceLabel = row.service_type
    ? capitalize(row.service_type) + " Services"
    : "";
  if (serviceLabel) {
    doc.fontSize(9).fillColor("#94a3b8")
      .text(serviceLabel, L, topY + 44, { width: 220 });
  }

  // Right: Invoice meta
  const metaX = MID;
  const metaW = R - MID;
  const metaLineH = 18;
  let metaY = topY;

  const metaRow = (label: string, value: string, bold = false) => {
    doc.font("Helvetica").fontSize(9).fillColor("#64748b")
      .text(label, metaX, metaY, { width: 100 });
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9)
      .fillColor(bold ? "#0f172a" : "#1e293b")
      .text(value, metaX + 105, metaY, { width: metaW - 105, align: "right" });
    metaY += metaLineH;
  };

  metaRow("Invoice #", `${row.id}`);
  metaRow("Due Date", fmtDate(row.due_date));
  metaRow("Status", row.status.toUpperCase(), true);
  metaRow("Monthly Rate", fmtAmount(row.monthly_fee ?? 0));

  doc.y = Math.max(doc.y, metaY) + 20;

  // ── Divider ───────────────────────────────────────────────────────────
  doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor("#e2e8f0").lineWidth(0.75).stroke();
  doc.moveDown(1);

  // ── Hours Summary ─────────────────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#64748b")
    .text("SERVICE HOURS", L, doc.y);
  doc.moveDown(0.5);

  const hoursY = doc.y;
  // Hours box
  doc.rect(L, hoursY, R - L, 36).fillColor("#f8fafc").fill();
  doc.rect(L, hoursY, R - L, 36).strokeColor("#e2e8f0").lineWidth(0.5).stroke();

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#0f172a")
    .text(totalHours, L + 12, hoursY + 7, { width: 100 });
  doc.font("Helvetica").fontSize(10).fillColor("#64748b")
    .text("total hours logged", L + 60, hoursY + 12, { width: 200 });
  doc.font("Helvetica").fontSize(9).fillColor("#94a3b8")
    .text(`${totalMinutes} minutes  ·  Budget: ${row.monthly_hour_budget ?? 0}h/mo`,
      MID, hoursY + 12, { width: metaW, align: "right" });

  doc.y = hoursY + 50;

  // ── Task Summary ──────────────────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#64748b")
    .text("TASK SUMMARY", L, doc.y);
  doc.moveDown(0.5);

  if (tasks.length === 0) {
    doc.font("Helvetica").fontSize(10).fillColor("#94a3b8")
      .text("No tasks on record for this client.", L, doc.y);
    doc.moveDown(1);
  } else {
    // Table header
    const colTitle = L;
    const colStatus = 360;
    const colDue = 450;
    const tblHeaderY = doc.y;
    doc.rect(L, tblHeaderY, R - L, 18).fillColor("#f1f5f9").fill();
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#64748b")
      .text("TASK", colTitle + 6, tblHeaderY + 5, { width: 270 })
      .text("STATUS", colStatus, tblHeaderY + 5, { width: 80 })
      .text("DUE", colDue, tblHeaderY + 5, { width: 90, align: "right" });
    doc.y = tblHeaderY + 18;

    const maxTasks = 20; // cap so PDF doesn't overflow
    const shown = tasks.slice(0, maxTasks);
    shown.forEach((t, i) => {
      const rowY = doc.y;
      if (i % 2 === 1) {
        doc.rect(L, rowY, R - L, 16).fillColor("#fafafa").fill();
      }
      const statusColor = t.status === "Completed" ? "#16a34a" : "#d97706";
      doc.font("Helvetica").fontSize(9).fillColor("#1e293b")
        .text(t.title, colTitle + 6, rowY + 3, { width: 270, ellipsis: true });
      doc.font("Helvetica-Bold").fontSize(8).fillColor(statusColor)
        .text(t.status === "Completed" ? "Completed" : "Pending",
          colStatus, rowY + 4, { width: 80 });
      doc.font("Helvetica").fontSize(8).fillColor("#64748b")
        .text(t.due_date ? fmtDate(t.due_date) : "—",
          colDue, rowY + 4, { width: 90, align: "right" });
      doc.y = rowY + 16;
    });
    if (tasks.length > maxTasks) {
      doc.font("Helvetica").fontSize(8).fillColor("#94a3b8")
        .text(`… and ${tasks.length - maxTasks} more tasks`, L + 6, doc.y + 3);
      doc.moveDown(1);
    }
    doc.moveDown(0.5);
  }

  // ── Divider ───────────────────────────────────────────────────────────
  doc.moveTo(L, doc.y).lineTo(R, doc.y).strokeColor("#e2e8f0").lineWidth(0.75).stroke();
  doc.moveDown(1);

  // ── Description + Total ───────────────────────────────────────────────
  if (row.description) {
    doc.font("Helvetica").fontSize(10).fillColor("#475569")
      .text(row.description, L, doc.y, { width: R - L });
    doc.moveDown(1);
  }

  // Total box
  const totalBoxY = doc.y;
  doc.rect(L, totalBoxY, R - L, 44).fillColor("#0f172a").fill();
  doc.font("Helvetica").fontSize(10).fillColor("#94a3b8")
    .text("TOTAL DUE", L + 12, totalBoxY + 8, { width: 200 });
  doc.font("Helvetica-Bold").fontSize(20).fillColor("#ffffff")
    .text(fmtAmount(row.amount), L + 12, totalBoxY + 18, { width: R - L - 24, align: "right" });

  doc.y = totalBoxY + 58;

  // ── Footer ────────────────────────────────────────────────────────────
  doc.fontSize(8).fillColor("#94a3b8").font("Helvetica")
    .text(
      `Generated by HM Virtual Services Business Suite  ·  ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
      L, doc.y, { width: R - L, align: "center" }
    );

  doc.end();
});

router.post("/invoices", requireAdmin, async (req, res) => {
  const body = CreateInvoiceBody.parse(req.body);
  const [invoice] = await db.insert(invoicesTable).values(body).returning();
  res.status(201).json(invoice);
  const actor = req.session.user;
  logAudit("invoice", invoice.id, "created", `Invoice #${invoice.id} created ($${Number(invoice.amount).toFixed(2)})`, { id: actor?.id, name: actor?.name });

  // Notify all admins about the new invoice
  (async () => {
    try {
      const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, body.client_id));
      await notifyAdmins({
        type: "invoice_created",
        title: `Invoice #${invoice.id} created`,
        message: `$${Number(invoice.amount).toFixed(2)} invoice created${client?.name ? ` for ${client.name}` : ""}.`,
        entityType: "invoice",
        entityId: invoice.id,
      });
    } catch { /* ignore */ }
  })();
});

router.patch("/invoices/:id", requireAdmin, async (req, res) => {
  const { id } = UpdateInvoiceParams.parse(req.params);
  const body = UpdateInvoiceBody.parse(req.body);
  const [updated] = await db
    .update(invoicesTable)
    .set({ ...body, updated_at: new Date() })
    .where(eq(invoicesTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  res.json(updated);
  const actor = req.session.user;
  const statusNote = body.status ? ` → ${body.status}` : "";
  logAudit("invoice", id, "updated", `Invoice #${id} updated${statusNote}`, { id: actor?.id, name: actor?.name });

  // Notify admins on meaningful status changes
  if (body.status) {
    (async () => {
      try {
        const [client] = await db
          .select({ name: clientsTable.name })
          .from(clientsTable)
          .where(eq(clientsTable.id, updated.client_id));
        const statusLabel = body.status === "paid" ? "marked as paid" : body.status === "void" ? "voided" : `updated to ${body.status}`;
        await notifyAdmins({
          type: "invoice_updated",
          title: `Invoice #${id} ${statusLabel}`,
          message: `$${Number(updated.amount).toFixed(2)} invoice${client?.name ? ` for ${client.name}` : ""} was ${statusLabel}.`,
          entityType: "invoice",
          entityId: id,
        });
      } catch { /* ignore */ }
    })();
  }
});

router.delete("/invoices/:id", requireAdmin, async (req, res) => {
  const { id } = DeleteInvoiceParams.parse(req.params);
  await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
  res.status(204).send();
  const actor = req.session.user;
  logAudit("invoice", id, "deleted", `Invoice #${id} deleted`, { id: actor?.id, name: actor?.name });
});

// ── Convert estimate → invoice ─────────────────────────────────────────────
router.post("/invoices/:id/convert", requireAdmin, async (req, res) => {
  const { id } = ConvertEstimateParams.parse(req.params);
  const [row] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, id));
  if (!row) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (row.type !== "estimate") { res.status(400).json({ error: "Only estimates can be converted" }); return; }
  const [updated] = await db
    .update(invoicesTable)
    .set({ type: "invoice", status: "unpaid", updated_at: new Date() })
    .where(eq(invoicesTable.id, id))
    .returning();
  res.json(updated);
  const actor = req.session.user;
  logAudit("invoice", id, "converted", `Estimate #${id} converted to invoice`, { id: actor?.id, name: actor?.name });
});

// ── Send invoice to client ────────────────────────────────────────────────────
router.post("/invoices/:id/send", requireAdmin, async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id || isNaN(id)) {
    res.status(400).json({ error: "Invalid invoice id" });
    return;
  }

  const [row] = await db
    .select({
      id: invoicesTable.id,
      client_id: invoicesTable.client_id,
      amount: invoicesTable.amount,
      type: invoicesTable.type,
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
    .where(eq(invoicesTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }

  if (!row.client_email) {
    res.status(400).json({ error: "Client has no email address on file" });
    return;
  }

  // Build email body
  const isEstimate = row.type === "estimate";
  const docLabel = isEstimate ? "Estimate" : "Invoice";
  const fmtDate = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric",
    });
  const fmtAmount = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  const lineItemsHtml = row.line_items && row.line_items.length > 0
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
          ${row.line_items.map(li => `
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

  // Try to generate a Stripe checkout URL for the Pay Now button
  let stripePayUrl: string | null = null;
  try {
    const { getUncachableStripeClient } = await import("../lib/stripeClient");
    const stripe = await getUncachableStripeClient();
    const origin = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(row.amount * 100),
            product_data: {
              name: `Invoice #${row.id}`,
              description: row.description ?? `Payment due ${fmtDate(row.due_date)}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { invoice_id: String(row.id) },
      success_url: `${origin}/invoices?payment=success&invoice=${row.id}`,
      cancel_url: `${origin}/invoices?payment=cancelled&invoice=${row.id}`,
    });
    stripePayUrl = session.url;
  } catch {
    // Stripe not configured or failed — email sent without pay button
  }

  const payButtonHtml = stripePayUrl
    ? `<div style="text-align:center;margin:28px 0;">
        <a href="${stripePayUrl}"
          style="display:inline-block;background:#266b75;color:#ffffff;font-size:16px;font-weight:700;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:0.01em;">
          Pay Now — ${fmtAmount(row.amount)}
        </a>
        <p style="margin:10px 0 0;font-size:12px;color:#94a3b8;">Secure payment powered by Stripe. Cards accepted.</p>
      </div>`
    : "";

  const emailBody = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">${docLabel} #${row.id}</h2>
    <p style="margin:0 0 20px;color:#475569;">Hi ${row.client_name ?? "there"},</p>
    <p style="color:#475569;">Please find your ${docLabel.toLowerCase()} details below.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      <tr>
        <td style="color:#64748b;font-size:13px;padding:4px 0;">${isEstimate ? "Valid Until" : "Due Date"}</td>
        <td style="text-align:right;font-weight:600;color:#1e293b;font-size:13px;">${fmtDate(row.due_date)}</td>
      </tr>
      ${row.description ? `
      <tr>
        <td style="color:#64748b;font-size:13px;padding:4px 0;">Description</td>
        <td style="text-align:right;color:#1e293b;font-size:13px;">${row.description}</td>
      </tr>` : ""}
    </table>

    ${lineItemsHtml}

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;border-radius:8px;margin:20px 0;">
      <tr>
        <td style="padding:16px 20px;color:#94a3b8;font-size:13px;">Total Due</td>
        <td style="padding:16px 20px;text-align:right;color:#ffffff;font-size:22px;font-weight:700;">${fmtAmount(row.amount)}</td>
      </tr>
    </table>

    ${payButtonHtml}

    ${row.notes ? `<p style="color:#64748b;font-size:13px;border-top:1px solid #e2e8f0;padding-top:16px;margin-top:16px;">${row.notes}</p>` : ""}
    ${row.thank_you_message ? `<p style="color:#475569;font-size:14px;margin-top:16px;font-style:italic;">${row.thank_you_message}</p>` : ""}
  `;

  const { sendMail, template, isMailConfigured } = await import("../lib/mailer");
  const mailConfigured = isMailConfigured();

  try {
    await sendMail(
      row.client_email,
      isEstimate
        ? `Estimate #${row.id} — ${fmtAmount(row.amount)}`
        : `Invoice #${row.id} — ${fmtAmount(row.amount)} due ${fmtDate(row.due_date)}`,
      template(emailBody)
    );
  } catch (err) {
    if (mailConfigured) {
      res.status(500).json({ error: "Failed to send email", detail: String(err) });
      return;
    }
    // If mail not configured, still mark as sent but warn
  }

  // Update invoice status to "sent"
  const [updated] = await db
    .update(invoicesTable)
    .set({ status: "sent", updated_at: new Date() })
    .where(eq(invoicesTable.id, id))
    .returning();

  res.json({ ...updated, emailSent: mailConfigured });
  const actor = req.session.user;
  logAudit("invoice", id, "sent", `${docLabel} #${id} sent to ${row.client_email}`, { id: actor?.id, name: actor?.name });

  // Fire-and-forget: in-app notification
  (async () => {
    try {
      const amountStr = fmtAmount(row.amount);
      const notifOpts = {
        type: "invoice_sent" as const,
        title: `${docLabel} #${id} sent — ${amountStr}`,
        message: `${docLabel} sent to ${row.client_name ?? row.client_email}.`,
        entityType: "invoice" as const,
        entityId: id,
      };
      await notifyAdmins(notifOpts);
      if (row.client_id) {
        await notifyClientUser(row.client_id, {
          ...notifOpts,
          title: `${docLabel} #${id} — ${amountStr}`,
          message: isEstimate
            ? `You have a new estimate for ${amountStr}.`
            : `You have a new invoice for ${amountStr} due on ${fmtDate(row.due_date)}.`,
        });
      }
    } catch { /* ignore */ }
  })();
});

export default router;
