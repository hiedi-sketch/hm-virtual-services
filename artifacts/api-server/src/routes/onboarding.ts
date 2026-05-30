import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  clientsTable,
  usersTable,
  clientOnboardingDataTable,
  fileUploadsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth";
import { sendMail, template, isMailConfigured } from "../lib/mailer";

const router: IRouter = Router();

function getAppUrl(): string {
  return process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.APP_URL ?? "http://localhost:3000");
}

function serviceLabel(services: string): string {
  if (services === "bookkeeping") return "Bookkeeping";
  if (services === "va") return "Virtual Assistant";
  return "Bookkeeping & VA";
}

// ── POST /clients/:id/send-onboarding-form ─────────────────────────────────────
router.post("/clients/:id/send-onboarding-form", requireAdmin, async (req, res) => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid client id" }); return; }

  const emailOverride: string | undefined = req.body?.email;

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }

  const toEmail = (emailOverride?.trim() || client.email || "").toLowerCase();
  if (!toEmail) { res.status(400).json({ error: "No email address available" }); return; }

  if (!isMailConfigured()) {
    res.status(503).json({ error: "SMTP not configured — cannot send onboarding form" });
    return;
  }

  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const clientName = client.contact_name ?? client.name;

  await db.update(clientsTable).set({
    onboarding_token: token,
    onboarding_token_used: false,
    portal_status: "invite_sent",
    onboarding_form_status: "sent_to_client",
    form_sent_date: now,
    portal_invite_sent_date: now,
    ...(emailOverride?.trim() ? { email: toEmail } : {}),
  } as any).where(eq(clientsTable.id, id));

  const appUrl = getAppUrl();
  const onboardingUrl = `${appUrl}/onboarding/${token}`;

  await sendMail(
    toEmail,
    "Welcome to HM Virtual Services - Complete Your Onboarding",
    template(`
      <p>Hi ${clientName},</p>
      <p>Welcome to HM Virtual Services!</p>
      <p>Please use the secure link below to complete your onboarding form and set up your client portal.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${onboardingUrl}" style="display:inline-block;background:#266b75;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;">Complete My Onboarding Form</a>
      </p>
      <p>During the onboarding process you will:</p>
      <ul style="padding-left:20px;color:#475569;">
        <li>Complete your onboarding questionnaire</li>
        <li>Confirm your email address</li>
        <li>Create your portal password</li>
        <li>Review your information before submitting</li>
      </ul>
      <p>Once submitted, your client portal will be activated automatically.</p>
      <p>Thank you,<br>Hiedi<br><strong>HM Virtual Services</strong></p>
    `)
  );

  res.json({ ok: true });
});

// ── GET /onboarding/:token ─────────────────────────────────────────────────────
router.get("/onboarding/:token", async (req, res) => {
  const { token } = req.params as { token: string };

  const [client] = await db.select().from(clientsTable)
    .where(eq(clientsTable.onboarding_token, token));
  if (!client) { res.status(404).json({ error: "Invalid or expired onboarding link" }); return; }
  if (client.onboarding_token_used) {
    res.status(410).json({ error: "This onboarding link has already been used" });
    return;
  }

  const [onboardingData] = await db.select().from(clientOnboardingDataTable)
    .where(eq(clientOnboardingDataTable.client_id, client.id))
    .limit(1);

  res.json({
    client: {
      id: client.id,
      name: client.name,
      contact_name: client.contact_name,
      email: client.email,
      phone: client.phone,
    },
    onboarding_data: onboardingData ?? null,
  });
});

// ── POST /onboarding/:token/submit ─────────────────────────────────────────────
router.post("/onboarding/:token/submit", async (req, res) => {
  const { token } = req.params as { token: string };

  const [client] = await db.select().from(clientsTable)
    .where(eq(clientsTable.onboarding_token, token));
  if (!client) { res.status(404).json({ error: "Invalid or expired onboarding link" }); return; }
  if (client.onboarding_token_used) {
    res.status(410).json({ error: "This onboarding link has already been used" });
    return;
  }

  const {
    name, contact_name, email, phone,
    services, industry,
    bk_software, bk_existing_accounts, bk_fiscal_year_end, bk_accounting_basis,
    bk_business_bank_account, bk_notes,
    va_task_types, va_tools, va_communication, va_availability,
    access_notes, goals, other_notes,
    portal_email, portal_password,
  } = req.body;

  if (!portal_password || portal_password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const finalEmail = ((portal_email?.trim() || email?.trim() || client.email) ?? "").toLowerCase();
  const finalName = contact_name?.trim() || name?.trim() || client.name;
  const now = new Date();

  // 1. Update client record
  await db.update(clientsTable).set({
    name: name?.trim() || client.name,
    contact_name: contact_name?.trim() || client.contact_name,
    email: finalEmail,
    phone: phone?.trim() || client.phone,
    portal_status: "active",
    onboarding_form_status: "complete",
    form_completed_date: now,
    portal_account_created_date: now,
    onboarding_token_used: true,
  } as any).where(eq(clientsTable.id, client.id));

  // 2. Save / update onboarding data
  const [existing] = await db.select({ id: clientOnboardingDataTable.id })
    .from(clientOnboardingDataTable)
    .where(eq(clientOnboardingDataTable.client_id, client.id))
    .limit(1);

  const onboardingValues = {
    client_id: client.id,
    services: services || "bookkeeping",
    industry: industry || null,
    bk_software: bk_software || null,
    bk_existing_accounts: bk_existing_accounts || null,
    bk_fiscal_year_end: bk_fiscal_year_end || null,
    bk_accounting_basis: bk_accounting_basis || null,
    bk_business_bank_account: bk_business_bank_account || null,
    bk_notes: bk_notes || null,
    va_task_types: va_task_types || null,
    va_tools: va_tools || null,
    va_communication: va_communication || null,
    va_availability: va_availability || null,
    access_notes: access_notes || null,
    goals: goals || null,
    other_notes: other_notes || null,
    submitted_at: now,
  };

  if (existing) {
    await db.update(clientOnboardingDataTable)
      .set(onboardingValues)
      .where(eq(clientOnboardingDataTable.id, existing.id));
  } else {
    await db.insert(clientOnboardingDataTable).values(onboardingValues);
  }

  // 3. Create or update portal user account with the provided password
  const passwordHash = await bcrypt.hash(portal_password, 10);
  const [existingUser] = await db.select().from(usersTable)
    .where(eq(usersTable.email, finalEmail));

  if (existingUser) {
    await db.update(usersTable).set({
      password_hash: passwordHash,
      name: finalName,
      role: "client",
      client_id: client.id,
    }).where(eq(usersTable.id, existingUser.id));
  } else {
    await db.insert(usersTable).values({
      email: finalEmail,
      password_hash: passwordHash,
      name: finalName,
      role: "client",
      client_id: client.id,
    });
  }

  // 4. Create document record for the completed onboarding form
  await db.insert(fileUploadsTable).values({
    client_id: client.id,
    uploaded_by_user_id: null,
    original_name: "Completed Onboarding Form",
    stored_name: `onboarding_form_${client.id}`,
    mimetype: "application/x-onboarding-form",
    size_bytes: 0,
    document_type: "Completed Onboarding Form",
    document_status: "Shared in Portal",
  } as any);

  // 5. Send thank you email to client
  if (isMailConfigured()) {
    try {
      await sendMail(
        finalEmail,
        "Thank You for Completing Your Onboarding",
        template(`
          <p>Hi ${finalName},</p>
          <p>Thank you for completing your onboarding form.</p>
          <p>Your client portal has been activated and your information has been received.</p>
          <p>We will review everything and reach out if additional information is needed.</p>
          <p>You may now use your client portal to:</p>
          <ul style="padding-left:20px;color:#475569;">
            <li>Upload documents</li>
            <li>View invoices</li>
            <li>Track tasks</li>
            <li>Communicate with HM Virtual Services</li>
          </ul>
          <p>Thank you,<br>Hiedi<br><strong>HM Virtual Services</strong></p>
        `)
      );
    } catch (err) {
      console.error("[onboarding] thank-you email failed:", err);
    }

    // 6. Notify Hiedi
    try {
      const hiediEmail = process.env.SMTP_FROM ?? process.env.SMTP_USER;
      if (hiediEmail) {
        const appUrl = getAppUrl();
        const clientLink = `${appUrl}/clients/${client.id}`;
        await sendMail(
          hiediEmail,
          `Onboarding Completed - ${finalName}`,
          template(`
            <p>${finalName} has completed their onboarding form.</p>
            <table style="margin:16px 0;border-collapse:collapse;width:100%;">
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;width:160px;">Service Type</td>
                <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;">${serviceLabel(services || "")}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;">Portal Account</td>
                <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-weight:600;color:#16a34a;">Activated</td>
              </tr>
            </table>
            <p>Completed onboarding form has been saved to Client Documents.</p>
            <p style="text-align:center;margin:24px 0;">
              <a href="${clientLink}" style="display:inline-block;background:#266b75;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">View Client</a>
            </p>
          `)
        );
      }
    } catch (err) {
      console.error("[onboarding] Hiedi notification email failed:", err);
    }
  }

  res.json({ ok: true });
});

// ── GET /clients/:id/onboarding-data ──────────────────────────────────────────
router.get("/clients/:id/onboarding-data", requireAdmin, async (req, res) => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid client id" }); return; }

  const [onboardingData] = await db.select().from(clientOnboardingDataTable)
    .where(eq(clientOnboardingDataTable.client_id, id))
    .limit(1);

  if (!onboardingData) { res.status(404).json({ error: "No onboarding data found" }); return; }

  res.json(onboardingData);
});

export default router;
