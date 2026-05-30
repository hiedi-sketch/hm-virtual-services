import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db, pool } from "@workspace/db";
import { clientsTable, timeEntriesTable, clientServicesTable, servicesTable, tasksTable, usersTable, passwordResetTokensTable, clientOnboardingDataTable, appSettingsTable } from "@workspace/db";
import { eq, and, gte, lt, sql, inArray, or, isNull, not, ilike } from "drizzle-orm";
import {
  CreateClientBody,
  GetClientParams,
  UpdateClientParams,
  UpdateClientBody,
  ListClientsResponse,
  GetDashboardResponse,
} from "@workspace/api-zod";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { computeResetWindow } from "./services";
import { sendMail, template, isMailConfigured } from "../lib/mailer";

const router: IRouter = Router();

router.get("/clients", requireAdmin, async (req, res) => {
  const clients = await db.select().from(clientsTable)
    .where(eq(clientsTable.is_active, true))
    .orderBy(clientsTable.name);

  // Compute monthly fees from assigned services so the list stays in sync with the detail page
  const clientIds = clients.map(c => c.id);
  const assignedServices = clientIds.length > 0
    ? await db
        .select({
          client_id: clientServicesTable.client_id,
          service_type: servicesTable.service_type,
          billing_type: servicesTable.billing_type,
          price: servicesTable.price,
          hourly_rate: servicesTable.hourly_rate,
          budgeted_hours: servicesTable.budgeted_hours,
          custom_price: clientServicesTable.custom_price,
          custom_hourly_rate: clientServicesTable.custom_hourly_rate,
          custom_budgeted_hours: clientServicesTable.custom_budgeted_hours,
        })
        .from(clientServicesTable)
        .leftJoin(servicesTable, eq(clientServicesTable.service_id, servicesTable.id))
        .where(inArray(clientServicesTable.client_id, clientIds))
    : [];

  // Build per-client fee + service_type map from assigned services
  const feeByClient = new Map<number, { monthly_fee: number; bk_fee: number | null; hasBK: boolean; hasVA: boolean; vaHourlyRate: number | null; vaIsPackage: boolean; vaHourBudget: number }>();
  for (const svc of assignedServices) {
    const clientId = svc.client_id;
    const cur = feeByClient.get(clientId) ?? { monthly_fee: 0, bk_fee: null, hasBK: false, hasVA: false, vaHourlyRate: null, vaIsPackage: false, vaHourBudget: 0 };

    const effPrice = svc.custom_price ?? svc.price ?? 0;
    const effRate = svc.custom_hourly_rate ?? svc.hourly_rate;
    const effHours = svc.custom_budgeted_hours ?? svc.budgeted_hours;
    const isFlat = svc.billing_type === "Flat Rate";
    const isHourly = svc.billing_type === "Hourly";

    const hourlyComputed = isHourly && effRate != null && effHours != null && effHours > 0
      ? effRate * effHours
      : 0;
    const svcValue = isFlat ? effPrice : hourlyComputed > 0 ? hourlyComputed : effPrice;

    cur.monthly_fee += svcValue;
    if (svc.service_type === "Bookkeeping") {
      cur.bk_fee = (cur.bk_fee ?? 0) + svcValue;
      cur.hasBK = true;
    }
    if (svc.service_type === "Virtual Assistant") {
      cur.hasVA = true;
      cur.vaHourBudget += effHours ?? 0;
      if (isHourly && effRate != null) {
        cur.vaHourlyRate = effRate;
      } else if (isFlat) {
        cur.vaIsPackage = true;
      }
    }
    feeByClient.set(clientId, cur);
  }

  function deriveServiceType(data: { hasBK: boolean; hasVA: boolean } | undefined): "bookkeeping" | "va" | "hybrid" | null {
    if (!data) return null;
    if (data.hasBK && data.hasVA) return "hybrid";
    if (data.hasBK) return "bookkeeping";
    if (data.hasVA) return "va";
    return null;
  }

  // Merge computed fees + service_type into client records
  const enriched = clients.map(c => {
    const svcData = feeByClient.get(c.id);
    return {
      ...c,
      monthly_fee: svcData ? svcData.monthly_fee : c.monthly_fee,
      bk_fee: svcData ? (svcData.bk_fee ?? null) : c.bk_fee,
      service_type: svcData ? deriveServiceType(svcData) : c.service_type,
      // Compute VA hour budget live from assigned services so it always reflects
      // whatever is set on the service template or client-specific override
      monthly_hour_budget: svcData?.hasVA && svcData.vaHourBudget > 0
        ? svcData.vaHourBudget
        : c.monthly_hour_budget,
      // Override stale stored va_hourly_rate with the live billing config:
      // null when the VA service is flat-rate (package), actual rate when hourly
      va_hourly_rate: svcData?.hasVA
        ? (svcData.vaIsPackage ? null : (svcData.vaHourlyRate ?? c.va_hourly_rate))
        : c.va_hourly_rate,
      va_is_package: svcData?.vaIsPackage ?? false,
    };
  });

  const parsed = ListClientsResponse.parse(enriched);
  res.json(parsed);
});

router.post("/clients", requireAdmin, async (req, res) => {
  const body = CreateClientBody.parse(req.body);
  const [client] = await db.insert(clientsTable).values(body).returning();
  res.status(201).json(client);
});

// ── POST /clients/onboard ────────────────────────────────────────────────────
router.post("/clients/onboard", requireAdmin, async (req, res) => {
  const {
    // Client basics
    name, contact_name, email, phone, website,
    // Onboarding fields
    services, industry,
    bk_software, bk_existing_accounts, bk_fiscal_year_end, bk_accounting_basis,
    bk_business_bank_account, bk_notes,
    va_task_types, va_tools, va_communication, va_availability,
    access_notes, goals, other_notes,
    // Portal invite option
    send_invite,
  } = req.body;

  if (!email || !services) {
    res.status(400).json({ error: "email and services are required" });
    return;
  }

  // Fall back: use contact_name, or derive a display name from the email
  const resolvedName = (name?.trim()) || (contact_name?.trim()) || email.split("@")[0];

  // 1. Create the client record
  const [client] = await db.insert(clientsTable).values({
    name: resolvedName, email,
    contact_name: contact_name || null,
    phone: phone || null,
    website: website || null,
    monthly_hour_budget: 0,
    monthly_fee: 0,
    autopay_enabled: false,
  }).returning();

  // 2. Save the onboarding details
  await db.insert(clientOnboardingDataTable).values({
    client_id: client.id,
    services,
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
  });

  // 3. Optionally send portal invite
  if (send_invite && isMailConfigured()) {
    try {
      let [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
      if (!user) {
        const tempHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
        [user] = await db.insert(usersTable).values({
          email: email.toLowerCase(),
          name: contact_name ?? name,
          password_hash: tempHash,
          role: "client",
          client_id: client.id,
        }).returning();
      }
      const token = randomBytes(32).toString("hex");
      await db.insert(passwordResetTokensTable).values({
        user_id: user.id, token,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        used: false,
      });
      const appUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : (process.env.APP_URL ?? "http://localhost:3000");
      const inviteUrl = `${appUrl}/reset-password?token=${token}`;
      const clientName = contact_name ?? name;
      await sendMail(email, "You're invited to the HM Virtual Services Client Portal", template(`
        <p>Hi ${clientName},</p>
        <p>Welcome! Your onboarding is complete. Click below to set up your portal login.</p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${inviteUrl}" style="display:inline-block;background:#266b75;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">Set Up My Account</a>
        </p>
        <p style="color:#64748b;font-size:13px;">This link expires in 7 days.</p>
      `));
    } catch (err) {
      // Non-fatal — client is already saved
      console.error("[onboard] invite send failed:", err);
    }
  }

  res.status(201).json({ client, ok: true });
});

router.get("/clients/:id", requireAuth, async (req, res) => {
  const { id } = GetClientParams.parse(req.params);
  const user = req.session.user!;
  if (user.role === "client" && user.client_id !== id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  // Compute monthly fee from assigned services (same logic as /clients list)
  const svcs = await db
    .select({
      service_type: servicesTable.service_type,
      billing_type: servicesTable.billing_type,
      price: servicesTable.price,
      hourly_rate: servicesTable.hourly_rate,
      budgeted_hours: servicesTable.budgeted_hours,
      custom_price: clientServicesTable.custom_price,
      custom_hourly_rate: clientServicesTable.custom_hourly_rate,
      custom_budgeted_hours: clientServicesTable.custom_budgeted_hours,
    })
    .from(clientServicesTable)
    .leftJoin(servicesTable, eq(clientServicesTable.service_id, servicesTable.id))
    .where(eq(clientServicesTable.client_id, id));

  let computedFee = 0;
  let computedBkFee: number | null = null;
  let vaHourBudget = 0;
  let hasBK = false;
  let hasVA = false;
  for (const s of svcs) {
    const effPrice = s.custom_price ?? s.price ?? 0;
    const effRate = s.custom_hourly_rate ?? s.hourly_rate;
    const effHours = s.custom_budgeted_hours ?? s.budgeted_hours;
    const isFlat = s.billing_type === "Flat Rate";
    const isHourly = s.billing_type === "Hourly";
    const hourlyComputed = isHourly && effRate != null && effHours != null && effHours > 0 ? effRate * effHours : 0;
    const svcValue = isFlat ? effPrice : hourlyComputed > 0 ? hourlyComputed : effPrice;
    computedFee += svcValue;
    if (s.service_type === "Bookkeeping") { computedBkFee = (computedBkFee ?? 0) + svcValue; hasBK = true; }
    if (s.service_type === "Virtual Assistant") {
      hasVA = true;
      vaHourBudget += effHours ?? 0;
    }
  }

  const derivedServiceType = svcs.length > 0
    ? (hasBK && hasVA ? "hybrid" : hasBK ? "bookkeeping" : hasVA ? "va" : null)
    : client.service_type;

  res.json({
    ...client,
    monthly_fee: svcs.length > 0 ? computedFee : client.monthly_fee,
    bk_fee: svcs.length > 0 ? computedBkFee : client.bk_fee,
    service_type: derivedServiceType,
    monthly_hour_budget: hasVA && vaHourBudget > 0 ? vaHourBudget : client.monthly_hour_budget,
  });
});

router.patch("/clients/:id", requireAdmin, async (req, res) => {
  const { id } = UpdateClientParams.parse(req.params);
  const body = UpdateClientBody.parse(req.body);
  const [updated] = await db
    .update(clientsTable)
    .set(body)
    .where(eq(clientsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  // When billing_date changes, cascade it to all VA services' monthly_hours_reset_day
  if (body.billing_date != null) {
    const billingDay = parseInt(String(body.billing_date), 10);
    if (!isNaN(billingDay) && billingDay >= 1 && billingDay <= 31) {
      const vaServices = await db
        .select({ id: servicesTable.id })
        .from(servicesTable)
        .where(eq(servicesTable.service_type, "Virtual Assistant"));
      if (vaServices.length > 0) {
        await db
          .update(clientServicesTable)
          .set({ monthly_hours_reset_day: billingDay })
          .where(
            and(
              eq(clientServicesTable.client_id, id),
              inArray(clientServicesTable.service_id, vaServices.map(s => s.id))
            )
          );
      }
    }
  }

  res.json(updated);
});

// ── POST /clients/:id/send-portal-invite ──────────────────────────────────────
router.post("/clients/:id/send-portal-invite", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid client id" }); return; }

  const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
  if (!client) { res.status(404).json({ error: "Client not found" }); return; }
  if (!client.email) { res.status(400).json({ error: "Client has no email address" }); return; }

  if (!isMailConfigured()) {
    res.status(503).json({ error: "SMTP not configured — cannot send invite" });
    return;
  }

  // Find or create the portal user account for this client
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, client.email.toLowerCase()));

  if (!user) {
    const tempHash = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
    [user] = await db
      .insert(usersTable)
      .values({
        email: client.email.toLowerCase(),
        name: client.contact_name ?? client.name,
        password_hash: tempHash,
        role: "client",
        client_id: id,
      })
      .returning();
  } else if (user.role !== "client" || user.client_id !== id) {
    // Update existing user to link as client portal user if not already
    [user] = await db
      .update(usersTable)
      .set({ role: "client", client_id: id })
      .where(eq(usersTable.id, user.id))
      .returning();
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.insert(passwordResetTokensTable).values({
    user_id: user.id,
    token,
    expires_at: expiresAt,
    used: false,
  });

  const appUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : (process.env.APP_URL ?? "http://localhost:3000");
  const inviteUrl = `${appUrl}/reset-password?token=${token}`;
  const clientName = client.contact_name ?? client.name;

  await sendMail(
    client.email,
    "You're invited to the HM Virtual Services Client Portal",
    template(`
      <p>Hi ${clientName},</p>
      <p>You've been invited to access your client portal at <strong>HM Virtual Services</strong>. From your portal you can view invoices, track project updates, and communicate with our team.</p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${inviteUrl}" style="display:inline-block;background:#266b75;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px;">Set Up My Account</a>
      </p>
      <p style="color:#64748b;font-size:13px;">This invitation link expires in <strong>7 days</strong>. If you have any questions, just reply to this email.</p>
      <p style="color:#64748b;font-size:13px;">Or copy and paste this link into your browser:<br><a href="${inviteUrl}" style="color:#266b75;word-break:break-all;">${inviteUrl}</a></p>
    `)
  );

  res.json({ ok: true });
});

router.get("/dashboard", requireAdmin, async (req, res) => {
  // Only count clients that have at least one service assigned (i.e. "active" clients)
  const clientsWithServices = await db
    .selectDistinct({ client_id: clientServicesTable.client_id })
    .from(clientServicesTable);
  const activeClientIds = clientsWithServices.map(r => r.client_id);

  const clients = activeClientIds.length > 0
    ? await db.select().from(clientsTable)
        .where(and(
          isNull(clientsTable.parent_id),
          inArray(clientsTable.id, activeClientIds),
          not(ilike(clientsTable.name, "%HM Virtual Services%")),
          eq(clientsTable.is_active, true),
        ))
        .orderBy(clientsTable.name)
    : [];

  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed
  const monthStart = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const nextMonthDate = new Date(Date.UTC(y, m + 1, 1));
  const monthEnd = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}-01`;

  const timeByClient = await db
    .select({
      client_id: timeEntriesTable.client_id,
      total_minutes: sql<number>`sum(${timeEntriesTable.duration_minutes})`,
    })
    .from(timeEntriesTable)
    .where(and(gte(timeEntriesTable.date, monthStart), lt(timeEntriesTable.date, monthEnd)))
    .groupBy(timeEntriesTable.client_id);

  const minuteMap: Record<number, number> = {};
  for (const row of timeByClient) {
    minuteMap[row.client_id] = Number(row.total_minutes) || 0;
  }

  // Fetch VA service reset days per client
  const vaResetRows = await db
    .select({
      client_id: clientServicesTable.client_id,
      monthly_hours_reset_day: clientServicesTable.monthly_hours_reset_day,
    })
    .from(clientServicesTable)
    .leftJoin(servicesTable, eq(clientServicesTable.service_id, servicesTable.id))
    .where(eq(servicesTable.service_type, "Virtual Assistant"));

  const vaResetDayByClient: Record<number, number> = {};
  for (const row of vaResetRows) {
    if (row.monthly_hours_reset_day && !vaResetDayByClient[row.client_id]) {
      vaResetDayByClient[row.client_id] = row.monthly_hours_reset_day;
    }
  }

  const dashboard = clients.map((c) => {
    const minutes = minuteMap[c.id] || 0;
    const hours_used = Math.round((minutes / 60) * 10) / 10;
    const hours_remaining = Math.round((c.monthly_hour_budget - hours_used) * 10) / 10;

    const vaResetDay = vaResetDayByClient[c.id] ?? null;
    let va_next_reset_date: string | null = null;
    let days_until_va_reset: number | null = null;
    if (vaResetDay) {
      const window = computeResetWindow(vaResetDay);
      va_next_reset_date = window.nextResetDate;
      days_until_va_reset = window.daysUntilReset;
    }

    return {
      ...c,
      hours_used_this_month: hours_used,
      hours_remaining,
      va_next_reset_date,
      days_until_va_reset,
    };
  });

  const parsed = GetDashboardResponse.parse(dashboard);
  res.json(parsed);
});

// ── GET /clients/:id/checklist ───────────────────────────────────────────────
router.get("/clients/:id/checklist", requireAdmin, async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const result = await db.execute(sql`
    SELECT checked_items, notes FROM client_checklist_state WHERE client_id = ${id} LIMIT 1
  `);
  const rows = result.rows as any[];
  if (rows.length === 0) {
    res.json({ checked_items: [], notes: "" });
    return;
  }
  const row = rows[0];
  let checkedItems: string[] = [];
  try { checkedItems = JSON.parse(row.checked_items ?? "[]"); } catch { checkedItems = []; }
  res.json({ checked_items: checkedItems, notes: row.notes ?? "" });
});

// ── PATCH /clients/:id/checklist ─────────────────────────────────────────────
router.patch("/clients/:id/checklist", requireAdmin, async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { checked_items, notes } = req.body;
  const jsonVal = JSON.stringify(Array.isArray(checked_items) ? checked_items : []);
  const notesVal = notes ?? null;
  const existingResult = await db.execute(sql`
    SELECT id FROM client_checklist_state WHERE client_id = ${id} LIMIT 1
  `);
  const existing = existingResult.rows as any[];
  if (existing.length === 0) {
    await db.execute(sql`
      INSERT INTO client_checklist_state (client_id, checked_items, notes, updated_at)
      VALUES (${id}, ${jsonVal}, ${notesVal}, NOW())
    `);
  } else {
    await db.execute(sql`
      UPDATE client_checklist_state
      SET checked_items = ${jsonVal},
          notes = ${notesVal},
          updated_at = NOW()
      WHERE client_id = ${id}
    `);
  }
  res.json({ ok: true });
});

// ── Subclients: list subclients of a parent client with VA hours data ───────
router.get("/clients/:id/subclients", requireAuth, async (req, res) => {
  const parentId = Number(req.params["id"]);
  if (!parentId || isNaN(parentId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const subclients = await db
    .select()
    .from(clientsTable)
    .where(eq(clientsTable.parent_id, parentId))
    .orderBy(clientsTable.name);

  if (subclients.length === 0) { res.json([]); return; }

  const subclientIds = subclients.map(c => c.id);

  // Fetch VA services for all subclients in one query
  const vaServices = await db
    .select({
      client_id: clientServicesTable.client_id,
      service_id: clientServicesTable.service_id,
      custom_budgeted_hours: clientServicesTable.custom_budgeted_hours,
      custom_hourly_rate: clientServicesTable.custom_hourly_rate,
      monthly_hours_reset_day: clientServicesTable.monthly_hours_reset_day,
      budgeted_hours: servicesTable.budgeted_hours,
      hourly_rate: servicesTable.hourly_rate,
    })
    .from(clientServicesTable)
    .leftJoin(servicesTable, eq(clientServicesTable.service_id, servicesTable.id))
    .where(and(
      inArray(clientServicesTable.client_id, subclientIds),
      eq(servicesTable.service_type, "Virtual Assistant")
    ));

  const vaServiceByClient: Record<number, typeof vaServices[0]> = {};
  for (const svc of vaServices) {
    if (!vaServiceByClient[svc.client_id]) vaServiceByClient[svc.client_id] = svc;
  }

  // Compute reset windows and build date filters per client
  const dateFilterByClient: Record<number, string> = {};
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  const resetWindowByClient: Record<number, { nextResetDate: string; daysUntilReset: number } | null> = {};
  for (const sc of subclients) {
    const svc = vaServiceByClient[sc.id];
    const resetDay = svc?.monthly_hours_reset_day ?? null;
    if (resetDay) {
      const window = computeResetWindow(resetDay);
      dateFilterByClient[sc.id] = window.lastResetDate;
      resetWindowByClient[sc.id] = { nextResetDate: window.nextResetDate, daysUntilReset: window.daysUntilReset };
    } else {
      dateFilterByClient[sc.id] = monthStart;
      resetWindowByClient[sc.id] = null;
    }
  }

  // Fetch VA hours used per subclient (grouped) using the minimum date filter
  const minDate = Object.values(dateFilterByClient).sort()[0] ?? monthStart;

  const rawHours = await db
    .select({
      client_id: timeEntriesTable.client_id,
      total_minutes: sql<number>`coalesce(sum(${timeEntriesTable.duration_minutes}), 0)`.as("total_minutes"),
    })
    .from(timeEntriesTable)
    .leftJoin(tasksTable, eq(timeEntriesTable.task_id, tasksTable.id))
    .where(and(
      inArray(timeEntriesTable.client_id, subclientIds),
      gte(timeEntriesTable.date, minDate),
      or(
        eq(timeEntriesTable.service_type, "Virtual Assistant"),
        eq(tasksTable.service_type, "Virtual Assistant")
      )
    ))
    .groupBy(timeEntriesTable.client_id);

  // Per-client hours (re-filtered to their actual date cutoff)
  // Note: since clients may have different reset days, we fetch from min date and then
  // filter per client. For most cases this is fine; for strict accuracy we query individually.
  const rawByClient: Record<number, number> = {};
  for (const row of rawHours) {
    rawByClient[row.client_id] = Number(row.total_minutes) || 0;
  }

  // For clients whose reset date differs from minDate, do a per-client query
  const clientsNeedingExactQuery = subclients.filter(sc => {
    const d = dateFilterByClient[sc.id];
    return d && d !== minDate;
  });

  for (const sc of clientsNeedingExactQuery) {
    const since = dateFilterByClient[sc.id];
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${timeEntriesTable.duration_minutes}), 0)`.as("total") })
      .from(timeEntriesTable)
      .leftJoin(tasksTable, eq(timeEntriesTable.task_id, tasksTable.id))
      .where(and(
        eq(timeEntriesTable.client_id, sc.id),
        gte(timeEntriesTable.date, since),
        or(
          eq(timeEntriesTable.service_type, "Virtual Assistant"),
          eq(tasksTable.service_type, "Virtual Assistant")
        )
      ));
    rawByClient[sc.id] = Number(row?.total ?? 0);
  }

  const result = subclients.map(sc => {
    const svc = vaServiceByClient[sc.id];
    const budgetedHours = svc ? (svc.custom_budgeted_hours ?? svc.budgeted_hours ?? 0) : 0;
    const vaHoursUsed = Math.round(((rawByClient[sc.id] ?? 0) / 60) * 10) / 10;
    const hoursRemaining = Math.max(0, Math.round((budgetedHours - vaHoursUsed) * 10) / 10);
    const pct = budgetedHours > 0 ? Math.round((hoursRemaining / budgetedHours) * 100) : null;
    const resetWindow = resetWindowByClient[sc.id];
    return {
      id: sc.id,
      name: sc.name,
      email: sc.email,
      service_type: sc.service_type,
      monthly_va_budget: budgetedHours,
      va_hours_used: vaHoursUsed,
      hours_remaining: hoursRemaining,
      hours_remaining_pct: pct,
      monthly_hours_reset_day: svc?.monthly_hours_reset_day ?? null,
      next_reset_date: resetWindow?.nextResetDate ?? null,
      days_until_reset: resetWindow?.daysUntilReset ?? null,
      va_hourly_rate: svc ? (svc.custom_hourly_rate ?? svc.hourly_rate ?? null) : null,
    };
  });

  res.json(result);
});

// ── Client account list (for transaction Account dropdown) ───────────────────

router.get("/clients/:id/account-list", requireAdmin, async (req, res) => {
  const clientId = Number(req.params["id"]);
  if (!clientId || isNaN(clientId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const key = `client_account_list_${clientId}`;
  const row = await db.select({ value: appSettingsTable.value }).from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  const accounts: string[] = row[0]?.value ? JSON.parse(row[0].value) : [];
  res.json({ accounts });
});

router.put("/clients/:id/account-list", requireAdmin, async (req, res) => {
  const clientId = Number(req.params["id"]);
  if (!clientId || isNaN(clientId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const accounts: string[] = Array.isArray(req.body?.accounts)
    ? req.body.accounts.map((a: any) => String(a).trim()).filter(Boolean)
    : [];
  const key = `client_account_list_${clientId}`;
  const value = JSON.stringify(accounts);
  const existing = await db.select({ id: appSettingsTable.id }).from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  if (existing.length > 0) {
    await db.update(appSettingsTable).set({ value }).where(eq(appSettingsTable.key, key));
  } else {
    await db.insert(appSettingsTable).values({ key, value });
  }
  res.json({ accounts });
});

// ── Checklist Items: default seed data ──────────────────────────────────────

const DEFAULT_CHECKLIST: { stage: string; task: string; who: string }[] = [
  // New Client Setup
  { stage: "New Client Setup", task: "Initial discovery call completed", who: "Hiedi" },
  { stage: "New Client Setup", task: "Document client needs and scope", who: "Hiedi" },
  { stage: "New Client Setup", task: "Determine services and pricing", who: "Hiedi" },
  // Onboarding Form
  { stage: "Onboarding Form", task: "Send onboarding form to client", who: "Hiedi" },
  { stage: "Onboarding Form", task: "Client completes onboarding form", who: "Client" },
  { stage: "Onboarding Form", task: "Review completed onboarding form", who: "Hiedi" },
  { stage: "Onboarding Form", task: "Confirm contact info and communication preferences", who: "Hiedi" },
  { stage: "Onboarding Form", task: "Confirm preferred meeting cadence", who: "Hiedi" },
  // Proposal / Estimate
  { stage: "Proposal/Estimate", task: "Prepare proposal/estimate", who: "Hiedi" },
  { stage: "Proposal/Estimate", task: "Send proposal/estimate to client", who: "Hiedi" },
  { stage: "Proposal/Estimate", task: "Follow up if no response within 3 business days", who: "Hiedi" },
  { stage: "Proposal/Estimate", task: "Client accepts proposal/estimate", who: "Client" },
  { stage: "Proposal/Estimate", task: "Confirm scope of work", who: "Hiedi" },
  // Contract
  { stage: "Contract", task: "Prepare contract", who: "Hiedi" },
  { stage: "Contract", task: "Send contract for signature", who: "Hiedi" },
  { stage: "Contract", task: "Confirm contract is signed", who: "Hiedi" },
  { stage: "Contract", task: "File signed contract", who: "Hiedi" },
  // Invoice / Payment
  { stage: "Invoice/Payment", task: "Create initial invoice", who: "Hiedi" },
  { stage: "Invoice/Payment", task: "Send invoice to client", who: "Hiedi" },
  { stage: "Invoice/Payment", task: "Confirm deposit or first payment received", who: "Hiedi" },
  { stage: "Invoice/Payment", task: "Set up recurring billing schedule", who: "Hiedi" },
  // Client Dashboard
  { stage: "Client Dashboard", task: "Set up client folder and file structure", who: "Hiedi" },
  { stage: "Client Dashboard", task: "Add client to project management tool", who: "Hiedi" },
  { stage: "Client Dashboard", task: "Create client portal login and send access details", who: "Hiedi" },
  // Access Collection
  { stage: "Access Collection", task: "Accounting software access received", who: "Client" },
  { stage: "Access Collection", task: "Bank account view access received", who: "Client" },
  { stage: "Access Collection", task: "Credit card account access received", who: "Client" },
  { stage: "Access Collection", task: "Payroll software access received", who: "Client" },
  { stage: "Access Collection", task: "Email account access received", who: "Client" },
  { stage: "Access Collection", task: "Calendar access received", who: "Client" },
  { stage: "Access Collection", task: "Website / hosting access received", who: "Client" },
  { stage: "Access Collection", task: "Social media access received", who: "Client" },
  { stage: "Access Collection", task: "Google Drive / Dropbox access received", who: "Client" },
  { stage: "Access Collection", task: "Password manager access received", who: "Client" },
  { stage: "Access Collection", task: "Project management tool access received", who: "Client" },
  { stage: "Access Collection", task: "CRM access received", who: "Client" },
  { stage: "Access Collection", task: "Phone / voicemail access received", who: "Client" },
  { stage: "Access Collection", task: "Other platform access received", who: "Client" },
  // Document Collection
  { stage: "Document Collection", task: "Prior year tax returns received", who: "Client" },
  { stage: "Document Collection", task: "Prior year financial statements received", who: "Client" },
  { stage: "Document Collection", task: "Prior year bank statements received", who: "Client" },
  { stage: "Document Collection", task: "Chart of accounts provided", who: "Client" },
  { stage: "Document Collection", task: "Existing contracts / agreements provided", who: "Client" },
  { stage: "Document Collection", task: "Business license / registration docs provided", who: "Client" },
  { stage: "Document Collection", task: "Payroll records provided", who: "Client" },
  { stage: "Document Collection", task: "Insurance documents provided", who: "Client" },
  // Internal Setup
  { stage: "Internal Setup", task: "Set up client in accounting software", who: "Hiedi" },
  { stage: "Internal Setup", task: "Set up chart of accounts", who: "Hiedi" },
  { stage: "Internal Setup", task: "Import / enter opening balances", who: "Hiedi" },
  { stage: "Internal Setup", task: "Connect bank feeds", who: "Hiedi" },
  { stage: "Internal Setup", task: "Set up recurring transactions", who: "Hiedi" },
  { stage: "Internal Setup", task: "Set up client invoicing template", who: "Hiedi" },
  { stage: "Internal Setup", task: "Add client to CRM / contact list", who: "Hiedi" },
  { stage: "Internal Setup", task: "Set up recurring task reminders", who: "Hiedi" },
  // Initial Review
  { stage: "Initial Review", task: "Review existing books for accuracy", who: "Hiedi" },
  { stage: "Initial Review", task: "Document cleanup scope if needed", who: "Hiedi" },
  { stage: "Initial Review", task: "Identify any missing transactions", who: "Hiedi" },
  { stage: "Initial Review", task: "Confirm fiscal year and reporting preferences", who: "Hiedi" },
  { stage: "Initial Review", task: "Complete first bank reconciliation", who: "Hiedi" },
  // Kickoff
  { stage: "Kickoff", task: "Schedule kickoff call", who: "Hiedi" },
  { stage: "Kickoff", task: "Kickoff call completed", who: "Hiedi" },
  { stage: "Kickoff", task: "Reviewed scope of work and expectations", who: "Hiedi" },
  { stage: "Kickoff", task: "Answered client questions", who: "Hiedi" },
  { stage: "Kickoff", task: "Sent kickoff call recap email to client", who: "Hiedi" },
  // Active Client Setup
  { stage: "Active Client Setup", task: "Confirm ongoing communication schedule", who: "Hiedi" },
  { stage: "Active Client Setup", task: "Set up recurring monthly check-in", who: "Hiedi" },
  { stage: "Active Client Setup", task: "Send 1-week check-in email to client", who: "Hiedi" },
  { stage: "Active Client Setup", task: "Mark client as Active in system", who: "Hiedi" },
];

// ── GET /clients/:id/checklist-items ─────────────────────────────────────────
router.get("/clients/:id/checklist-items", requireAdmin, async (req, res) => {
  const id = Number(req.params["id"]);
  if (!id || isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const countResult = await db.execute(sql`SELECT COUNT(*)::int AS count FROM client_checklist_items WHERE client_id = ${id}`);
  const count = Number((countResult.rows as any[])[0]?.count ?? 0);

  if (count === 0) {
    for (let i = 0; i < DEFAULT_CHECKLIST.length; i++) {
      const item = DEFAULT_CHECKLIST[i]!;
      await db.execute(sql`
        INSERT INTO client_checklist_items (client_id, stage, task, who, status, sort_order, is_custom)
        VALUES (${id}, ${item.stage}, ${item.task}, ${item.who}, 'Not Started', ${i}, FALSE)
      `);
    }
  }

  const result = await db.execute(sql`
    SELECT id, client_id, stage, task, who, status, notes, due_date, sort_order, is_custom
    FROM client_checklist_items
    WHERE client_id = ${id}
    ORDER BY sort_order, id
  `);
  res.json(result.rows);
});

// ── PATCH /clients/:id/checklist-items/:itemId ────────────────────────────────
router.patch("/clients/:id/checklist-items/:itemId", requireAdmin, async (req, res) => {
  const clientId = Number(req.params["id"]);
  const itemId = Number(req.params["itemId"]);
  if (!clientId || isNaN(clientId) || !itemId || isNaN(itemId)) {
    res.status(400).json({ error: "Invalid id" }); return;
  }
  const body = req.body as Record<string, unknown>;
  // Only update fields that were explicitly sent in the request body
  const allowed = ["task", "who", "status", "notes", "due_date", "stage"] as const;
  const setClauses: string[] = ["updated_at = NOW()"];
  const values: unknown[] = [];
  let paramIdx = 1;
  for (const field of allowed) {
    if (field in body) {
      setClauses.push(`${field} = $${paramIdx++}`);
      values.push(body[field] ?? null);
    }
  }
  if (values.length === 0) { res.json({ ok: true }); return; }
  values.push(itemId, clientId);
  const setStr = setClauses.join(", ");
  await pool.query(
    `UPDATE client_checklist_items SET ${setStr} WHERE id = $${paramIdx} AND client_id = $${paramIdx + 1}`,
    values,
  );
  res.json({ ok: true });
});

// ── POST /clients/:id/checklist-items ─────────────────────────────────────────
router.post("/clients/:id/checklist-items", requireAdmin, async (req, res) => {
  const clientId = Number(req.params["id"]);
  if (!clientId || isNaN(clientId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { stage, task, who, status, notes, due_date } = req.body;
  if (!stage || !task) { res.status(400).json({ error: "stage and task are required" }); return; }

  const maxResult = await db.execute(sql`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM client_checklist_items WHERE client_id = ${clientId}`);
  const nextOrder = Number((maxResult.rows as any[])[0]?.next_order ?? 0);

  const inserted = await db.execute(sql`
    INSERT INTO client_checklist_items (client_id, stage, task, who, status, notes, due_date, sort_order, is_custom)
    VALUES (
      ${clientId},
      ${stage},
      ${task},
      ${who ?? "Hiedi"},
      ${status ?? "Not Started"},
      ${notes || null},
      ${due_date || null},
      ${nextOrder},
      TRUE
    )
    RETURNING id, client_id, stage, task, who, status, notes, due_date, sort_order, is_custom
  `);
  res.json((inserted.rows as any[])[0]);
});

// ── DELETE /clients/:id/checklist-items/:itemId ───────────────────────────────
router.delete("/clients/:id/checklist-items/:itemId", requireAdmin, async (req, res) => {
  const clientId = Number(req.params["id"]);
  const itemId = Number(req.params["itemId"]);
  if (!clientId || isNaN(clientId) || !itemId || isNaN(itemId)) {
    res.status(400).json({ error: "Invalid id" }); return;
  }
  await db.execute(sql`DELETE FROM client_checklist_items WHERE id = ${itemId} AND client_id = ${clientId}`);
  res.json({ ok: true });
});

export default router;

