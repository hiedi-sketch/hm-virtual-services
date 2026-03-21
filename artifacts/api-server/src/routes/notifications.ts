import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tasksTable,
  clientsTable,
  invoicesTable,
  leadsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, lt, gte, ne } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth";
import { sendMail, isMailConfigured, template } from "../lib/mailer";

const router: IRouter = Router();

// Guard: return 503 if SMTP is not configured
router.use("/notifications", (_req, res, next) => {
  if (!isMailConfigured()) {
    res.status(503).json({ error: "SMTP not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS." });
    return;
  }
  next();
});

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

function in7DaysStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0]!;
}

function fmtDate(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ── Overdue Tasks ──────────────────────────────────────────────────────────
// Emails clients with their overdue tasks + all admins with a full summary
router.post("/notifications/overdue-tasks", requireAdmin, async (req, res) => {
  const today = todayStr();

  const overdueTasks = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      due_date: tasksTable.due_date,
      client_id: tasksTable.client_id,
      client_name: clientsTable.name,
      client_email: clientsTable.email,
    })
    .from(tasksTable)
    .leftJoin(clientsTable, eq(tasksTable.client_id, clientsTable.id))
    .where(
      and(
        eq(tasksTable.status, "pending"),
        lt(tasksTable.due_date, today)
      )
    );

  if (overdueTasks.length === 0) {
    res.json({ sent: 0, message: "No overdue tasks found." });
    return;
  }

  let sent = 0;

  // Group tasks by client and notify each client
  const byClient = new Map<number, typeof overdueTasks>();
  for (const t of overdueTasks) {
    if (!t.client_id) continue;
    const existing = byClient.get(t.client_id) ?? [];
    existing.push(t);
    byClient.set(t.client_id, existing);
  }

  for (const [, tasks] of byClient) {
    const email = tasks[0]?.client_email;
    const name = tasks[0]?.client_name ?? "there";
    if (!email) continue;

    const taskList = tasks
      .map(t => `<li style="margin:4px 0;">${t.title} &mdash; <span style="color:#dc2626;">was due ${fmtDate(t.due_date!)}</span></li>`)
      .join("");

    await sendMail(
      email,
      `Action required: ${tasks.length} overdue task${tasks.length !== 1 ? "s" : ""}`,
      template(`
        <p>Hi ${name},</p>
        <p>The following task${tasks.length !== 1 ? "s" : ""} assigned to you ${tasks.length !== 1 ? "are" : "is"} overdue:</p>
        <ul style="margin:12px 0;padding-left:20px;">${taskList}</ul>
        <p>Please complete these as soon as possible or reach out if you need help.</p>
        <p style="margin-top:24px;color:#64748b;">— The Flowstate Team</p>
      `)
    );
    sent++;
  }

  // Notify all admins with a full summary
  const admins = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));

  const allTaskRows = overdueTasks
    .map(t => `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">${t.title}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">${t.client_name ?? "—"}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#dc2626;">${fmtDate(t.due_date!)}</td>
    </tr>`)
    .join("");

  for (const admin of admins) {
    await sendMail(
      admin.email,
      `[Flowstate] ${overdueTasks.length} overdue task${overdueTasks.length !== 1 ? "s" : ""} summary`,
      template(`
        <p>Hi ${admin.name},</p>
        <p>Here is a summary of all currently overdue tasks:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;font-size:14px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">Task</th>
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">Client</th>
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">Was Due</th>
            </tr>
          </thead>
          <tbody>${allTaskRows}</tbody>
        </table>
        <p style="margin-top:24px;color:#64748b;">— Flowstate Notifications</p>
      `)
    );
    sent++;
  }

  res.json({ sent, tasks: overdueTasks.length });
});

// ── Invoice Reminders ──────────────────────────────────────────────────────
// Emails each client whose invoice is due within the next 7 days
router.post("/notifications/invoice-reminders", requireAdmin, async (req, res) => {
  const today = todayStr();
  const next7 = in7DaysStr();

  const upcoming = await db
    .select({
      id: invoicesTable.id,
      amount: invoicesTable.amount,
      due_date: invoicesTable.due_date,
      description: invoicesTable.description,
      client_name: clientsTable.name,
      client_email: clientsTable.email,
    })
    .from(invoicesTable)
    .leftJoin(clientsTable, eq(invoicesTable.client_id, clientsTable.id))
    .where(
      and(
        eq(invoicesTable.status, "unpaid"),
        gte(invoicesTable.due_date, today),
        lt(invoicesTable.due_date, next7)
      )
    );

  if (upcoming.length === 0) {
    res.json({ sent: 0, message: "No upcoming unpaid invoices in the next 7 days." });
    return;
  }

  // Group by client email
  const byEmail = new Map<string, typeof upcoming>();
  for (const inv of upcoming) {
    if (!inv.client_email) continue;
    const existing = byEmail.get(inv.client_email) ?? [];
    existing.push(inv);
    byEmail.set(inv.client_email, existing);
  }

  let sent = 0;
  for (const [email, invoices] of byEmail) {
    const name = invoices[0]?.client_name ?? "there";
    const rows = invoices
      .map(inv => `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">Invoice #${inv.id}${inv.description ? ` — ${inv.description}` : ""}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-weight:600;">$${inv.amount.toFixed(2)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;color:#d97706;">${fmtDate(inv.due_date)}</td>
      </tr>`)
      .join("");

    const total = invoices.reduce((s, i) => s + i.amount, 0);

    await sendMail(
      email,
      `Payment reminder: invoice${invoices.length !== 1 ? "s" : ""} due soon`,
      template(`
        <p>Hi ${name},</p>
        <p>This is a friendly reminder that the following invoice${invoices.length !== 1 ? "s are" : " is"} due soon:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;font-size:14px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">Invoice</th>
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">Amount</th>
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">Due Date</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="font-size:16px;font-weight:700;">Total due: $${total.toFixed(2)}</p>
        <p>Please arrange payment before the due date. Reply to this email with any questions.</p>
        <p style="margin-top:24px;color:#64748b;">— The Flowstate Team</p>
      `)
    );
    sent++;
  }

  res.json({ sent, invoices: upcoming.length });
});

// ── Lead Follow-up Reminders ───────────────────────────────────────────────
// Emails admins + team_members about leads whose follow-up date is today or overdue
router.post("/notifications/followup-reminders", requireAdmin, async (req, res) => {
  const today = todayStr();

  const leads = await db
    .select({
      id: leadsTable.id,
      name: leadsTable.name,
      email: leadsTable.email,
      status: leadsTable.status,
      follow_up_date: leadsTable.follow_up_date,
    })
    .from(leadsTable)
    .where(
      and(
        ne(leadsTable.status, "closed"),
        lt(leadsTable.follow_up_date!, today)
      )
    );

  // Also include leads due today
  const leadsToday = await db
    .select({
      id: leadsTable.id,
      name: leadsTable.name,
      email: leadsTable.email,
      status: leadsTable.status,
      follow_up_date: leadsTable.follow_up_date,
    })
    .from(leadsTable)
    .where(
      and(
        ne(leadsTable.status, "closed"),
        eq(leadsTable.follow_up_date, today)
      )
    );

  const allLeads = [...leads, ...leadsToday].filter(l => l.follow_up_date);

  if (allLeads.length === 0) {
    res.json({ sent: 0, message: "No leads requiring follow-up today." });
    return;
  }

  const recipients = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(
      and(
        ne(usersTable.role, "client")
      )
    );

  const rows = allLeads
    .map(l => {
      const isOverdue = l.follow_up_date! < today;
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-weight:600;">${l.name}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;">${l.email ?? "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-transform:capitalize;">${l.status}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;color:${isOverdue ? "#dc2626" : "#d97706"};">
          ${fmtDate(l.follow_up_date!)}${isOverdue ? " (overdue)" : " (today)"}
        </td>
      </tr>`;
    })
    .join("");

  let sent = 0;
  for (const recipient of recipients) {
    await sendMail(
      recipient.email,
      `[Flowstate] ${allLeads.length} lead${allLeads.length !== 1 ? "s" : ""} need follow-up`,
      template(`
        <p>Hi ${recipient.name},</p>
        <p>The following lead${allLeads.length !== 1 ? "s" : ""} ${allLeads.length !== 1 ? "require" : "requires"} follow-up today:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:12px 0;font-size:14px;">
          <thead>
            <tr style="background:#f8fafc;">
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">Lead</th>
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">Email</th>
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">Stage</th>
              <th style="padding:8px;text-align:left;border-bottom:2px solid #e2e8f0;">Follow-up Date</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin-top:24px;color:#64748b;">— Flowstate Notifications</p>
      `)
    );
    sent++;
  }

  res.json({ sent, leads: allLeads.length });
});

export default router;
