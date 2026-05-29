/**
 * QuickBooks Online Accountant (QBOA) integration routes
 *
 * GET    /api/qbo/status          – connection status + connected user info
 * GET    /api/qbo/connect         – redirect to Intuit OAuth2 consent screen
 * GET    /api/qbo/callback        – OAuth2 callback; stores tokens
 * POST   /api/qbo/disconnect      – revoke tokens & clear stored credentials
 * GET    /api/qbo/firms           – list QBOA-managed companies (firms)
 * POST   /api/qbo/refresh-firms   – re-fetch firm list from Intuit and cache
 */

import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appSettingsTable, clientsTable, transactionsTable, transactionImportsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const INTUIT_CLIENT_ID     = process.env.INTUIT_CLIENT_ID!;
const INTUIT_CLIENT_SECRET = process.env.INTUIT_CLIENT_SECRET!;
const REDIRECT_URI         = process.env.QBO_REDIRECT_URI ?? "https://hmvirtualservices.com/api/qbo/callback";
const INTUIT_BASE          = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_URL            = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_URL           = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const DISCOVERY_URL        = "https://accounts.platform.intuit.com/v1/openid_connect/userinfo";
const FIRMS_URL            = "https://appcenter.intuit.com/api/v1/Account/List";
const QBO_API_BASE         = "https://quickbooks.api.intuit.com/v3/company";

// ─── Settings helpers ─────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

async function setSetting(key: string, value: string | null): Promise<void> {
  const existing = await db
    .select({ id: appSettingsTable.id })
    .from(appSettingsTable)
    .where(eq(appSettingsTable.key, key))
    .limit(1);
  if (existing.length > 0) {
    await db.update(appSettingsTable).set({ value }).where(eq(appSettingsTable.key, key));
  } else {
    await db.insert(appSettingsTable).values({ key, value });
  }
}

async function deleteSetting(key: string): Promise<void> {
  await db.delete(appSettingsTable).where(eq(appSettingsTable.key, key));
}

// ─── Token helpers ────────────────────────────────────────────────────────────

interface TokenSet {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

async function getTokens(): Promise<TokenSet | null> {
  const raw = await getSetting("qbo_tokens");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function saveTokens(tokens: TokenSet): Promise<void> {
  await setSetting("qbo_tokens", JSON.stringify(tokens));
}

async function refreshAccessToken(): Promise<TokenSet | null> {
  const tokens = await getTokens();
  if (!tokens) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
  });

  const creds = Buffer.from(`${INTUIT_CLIENT_ID}:${INTUIT_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    logger.warn({ status: res.status }, "QBO token refresh failed");
    return null;
  }

  const data = await res.json() as any;
  const newTokens: TokenSet = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? tokens.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  await saveTokens(newTokens);
  return newTokens;
}

async function getValidAccessToken(): Promise<string | null> {
  let tokens = await getTokens();
  if (!tokens) return null;
  if (Date.now() > tokens.expires_at - 60_000) {
    tokens = await refreshAccessToken();
  }
  return tokens?.access_token ?? null;
}

// ─── GET /api/qbo/status ──────────────────────────────────────────────────────

router.get("/qbo/status", requireAuth, requireRole("admin"), async (_req, res) => {
  const tokens = await getTokens();
  if (!tokens) {
    res.json({ connected: false });
    return;
  }

  const connectedName = await getSetting("qbo_connected_name");
  const connectedEmail = await getSetting("qbo_connected_email");
  const firmsJson = await getSetting("qbo_firms_cache");
  const firms = firmsJson ? JSON.parse(firmsJson) as any[] : [];

  res.json({
    connected: true,
    name: connectedName,
    email: connectedEmail,
    firms,
  });
});

// ─── GET /api/qbo/connect ─────────────────────────────────────────────────────

router.get("/qbo/connect", requireAuth, requireRole("admin"), (_req, res) => {
  if (!INTUIT_CLIENT_ID) {
    res.status(503).json({ error: "INTUIT_CLIENT_ID not configured" });
    return;
  }

  const state = Math.random().toString(36).slice(2);
  const params = new URLSearchParams({
    client_id: INTUIT_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting openid profile email",
    state,
    prompt: "login",  // always show the Intuit login screen so a different account can be chosen
  });

  res.redirect(`${INTUIT_BASE}?${params.toString()}`);
});

// ─── GET /api/qbo/callback ────────────────────────────────────────────────────

router.get("/qbo/callback", async (req, res) => {
  const { code, error, realmId } = req.query as Record<string, string>;

  if (error || !code) {
    res.redirect("/?qbo=error");
    return;
  }

  const creds = Buffer.from(`${INTUIT_CLIENT_ID}:${INTUIT_CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
  });

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!tokenRes.ok) {
    logger.error({ status: tokenRes.status }, "QBO token exchange failed");
    res.redirect("/quickbooks?qbo=error");
    return;
  }

  const data = await tokenRes.json() as any;
  const tokens: TokenSet = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  await saveTokens(tokens);

  // Store the realmId returned by Intuit (identifies the connected QBO company)
  if (realmId) {
    await setSetting("qbo_realm_id", realmId);
    logger.info({ realmId }, "QBO callback: stored realmId");
  }

  // Fetch user info
  try {
    const userRes = await fetch(DISCOVERY_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" },
    });
    if (userRes.ok) {
      const user = await userRes.json() as any;
      await setSetting("qbo_connected_name", `${user.givenName ?? ""} ${user.familyName ?? ""}`.trim() || user.email || "");
      await setSetting("qbo_connected_email", user.email ?? "");
    }
  } catch { /* best effort */ }

  // Build & cache firm list — try QBOA account list first, fall back to direct company info.
  // Merges with any previously cached firms so multiple connected accounts accumulate.
  try {
    const firms = await fetchFirms(tokens.access_token, realmId ?? null);
    if (firms.length > 0) {
      const merged = await mergeFirmsCache(firms);
      await setSetting("qbo_firms_cache", JSON.stringify(merged));
    }
  } catch { /* best effort */ }

  res.redirect("/quickbooks?qbo=connected");
});

// ─── POST /api/qbo/disconnect ─────────────────────────────────────────────────

router.post("/qbo/disconnect", requireAuth, requireRole("admin"), async (_req, res) => {
  const tokens = await getTokens();
  if (tokens) {
    const creds = Buffer.from(`${INTUIT_CLIENT_ID}:${INTUIT_CLIENT_SECRET}`).toString("base64");
    try {
      await fetch(REVOKE_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${creds}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ token: tokens.refresh_token }),
      });
    } catch { /* best effort */ }
  }

  await deleteSetting("qbo_tokens");
  await deleteSetting("qbo_connected_name");
  await deleteSetting("qbo_connected_email");
  // qbo_firms_cache and qbo_realm_id are intentionally kept so previously
  // connected companies remain visible in the dropdown after reconnecting
  // with a different account.

  res.json({ ok: true });
});

// ─── Firms cache helpers ──────────────────────────────────────────────────────

/** Merge newly fetched firms into the existing cache, deduplicating by realmId. */
async function mergeFirmsCache(newFirms: any[]): Promise<any[]> {
  const existing: any[] = await getSetting("qbo_firms_cache")
    .then(raw => (raw ? JSON.parse(raw) : []))
    .catch(() => []);

  const map = new Map<string, any>();
  for (const f of existing) if (f.realmId) map.set(f.realmId, f);
  for (const f of newFirms) if (f.realmId) map.set(f.realmId, f); // new data wins
  return Array.from(map.values());
}

// ─── Firms fetcher ────────────────────────────────────────────────────────────

/** Fetch the company name for a single realmId via the QBO CompanyInfo API */
async function fetchCompanyInfo(accessToken: string, realmId: string): Promise<{ realmId: string; companyName: string; country: string } | null> {
  try {
    const url = `${QBO_API_BASE}/${realmId}/companyinfo/${realmId}?minorversion=65`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    const info = data?.CompanyInfo ?? data?.companyInfo ?? data;
    return {
      realmId,
      companyName: info?.CompanyName ?? info?.companyName ?? realmId,
      country: info?.Country ?? info?.country ?? "",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the full list of QBOA-managed companies.
 * Falls back to a single-company lookup using realmId when the QBOA
 * Account List API is unavailable (e.g. standard QBO instead of Accountant).
 */
async function fetchFirms(accessToken: string, fallbackRealmId?: string | null): Promise<any[]> {
  // Try QBOA account list first (only works for Accountant apps)
  try {
    const res = await fetch(FIRMS_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json() as any;
      const list: any[] = data?.qboAccountList ?? data?.AccountList ?? data?.accounts ?? [];
      if (list.length > 0) {
        return list.map((f: any) => ({
          realmId: f.realmId ?? f.RealmId ?? f.Id ?? "",
          companyName: f.name ?? f.CompanyName ?? f.companyName ?? "",
          country: f.country ?? f.Country ?? "",
        }));
      }
    }
    // Non-OK (e.g. 403) — fall through to single-company lookup
  } catch { /* fall through */ }

  // Fall back: look up the specific company using the realmId from the callback
  const realmId = fallbackRealmId ?? await getSetting("qbo_realm_id");
  if (realmId) {
    logger.info({ realmId }, "QBO firms: QBOA list unavailable, falling back to CompanyInfo lookup");
    const company = await fetchCompanyInfo(accessToken, realmId);
    if (company) return [company];
  }

  return [];
}

// ─── GET /api/qbo/firms ───────────────────────────────────────────────────────

router.get("/qbo/firms", requireAuth, requireRole("admin"), async (_req, res) => {
  const firmsJson = await getSetting("qbo_firms_cache");
  if (!firmsJson) {
    res.json([]);
    return;
  }
  res.json(JSON.parse(firmsJson));
});

// ─── POST /api/qbo/refresh-firms ─────────────────────────────────────────────

router.post("/qbo/refresh-firms", requireAuth, requireRole("admin"), async (_req, res) => {
  const token = await getValidAccessToken();
  if (!token) {
    res.status(401).json({ error: "Not connected to QuickBooks. Please connect first." });
    return;
  }

  try {
    const storedRealmId = await getSetting("qbo_realm_id");
    const firms = await fetchFirms(token, storedRealmId);
    const merged = await mergeFirmsCache(firms);
    await setSetting("qbo_firms_cache", JSON.stringify(merged));
    res.json({ firms: merged, count: merged.length });
  } catch (err: any) {
    logger.error({ err }, "Failed to refresh QBO firms");
    res.status(502).json({ error: err.message ?? "Failed to fetch firms from QuickBooks" });
  }
});

// ─── Helper: parse QBO TransactionList report rows ────────────────────────────

interface QboTxRow {
  date: string | null;
  transaction_type: string | null;
  num: string | null;
  name: string | null;
  memo: string | null;
  account: string | null;
  split: string | null;
  amount: number | null;
}

function extractTxRows(row: any, colCount: number): any[][] {
  const results: any[][] = [];
  if (row.ColData && Array.isArray(row.ColData)) {
    results.push(row.ColData.map((c: any) => c.value ?? ""));
  }
  if (row.Rows?.Row) {
    for (const r of row.Rows.Row) {
      results.push(...extractTxRows(r, colCount));
    }
  }
  return results;
}

function parseTransactionListReport(report: any): QboTxRow[] {
  const columns: string[] = (report?.Columns?.Column ?? []).map((c: any) => c.ColTitle ?? "");
  const dateIdx   = columns.findIndex(c => c === "Date");
  const typeIdx   = columns.findIndex(c => c === "Transaction Type");
  const numIdx    = columns.findIndex(c => c === "No.");
  const nameIdx   = columns.findIndex(c => c === "Name");
  const memoIdx   = columns.findIndex(c => c === "Memo/Description");
  const acctIdx   = columns.findIndex(c => c === "Account");
  const splitIdx  = columns.findIndex(c => c === "Split");
  const amtIdx    = columns.findIndex(c => c === "Amount");

  const rawRows: any[][] = [];
  for (const row of (report?.Rows?.Row ?? [])) {
    rawRows.push(...extractTxRows(row, columns.length));
  }

  return rawRows.map(cols => {
    const get = (i: number) => (i >= 0 && cols[i] !== undefined ? String(cols[i]).trim() : null) || null;
    const rawAmt = get(amtIdx);
    const amount = rawAmt ? parseFloat(rawAmt.replace(/[$,]/g, "")) : null;
    return {
      date:             get(dateIdx),
      transaction_type: get(typeIdx),
      num:              get(numIdx),
      name:             get(nameIdx),
      memo:             get(memoIdx),
      account:          get(acctIdx),
      split:            get(splitIdx),
      amount:           isNaN(amount as number) ? null : amount,
    };
  }).filter(r => r.date); // skip empty rows
}

function isUncategorized(account: string | null, split: string | null): boolean {
  if (!account && !split) return true;
  const check = [account, split].join(" ").toLowerCase();
  return check.includes("uncategorized") || check.includes("ask my accountant") || check.includes("uncat");
}

// ─── POST /api/qbo/clients/:id/sync-transactions ──────────────────────────────

router.post("/qbo/clients/:id/sync-transactions", requireAuth, requireRole("admin"), async (req, res) => {
  const clientId = Number(req.params.id);
  if (isNaN(clientId)) { res.status(400).json({ error: "Invalid client id" }); return; }

  const { startDate, endDate, overwrite } = req.body as { startDate?: string; endDate?: string; overwrite?: boolean };
  if (!startDate || !endDate) { res.status(400).json({ error: "startDate and endDate required" }); return; }

  const accessToken = await getValidAccessToken();
  if (!accessToken) { res.status(503).json({ error: "QuickBooks not connected — please connect on the QuickBooks settings page." }); return; }

  // Check for existing imports covering this date range
  const existing = await db
    .select()
    .from(transactionImportsTable)
    .where(and(
      eq(transactionImportsTable.client_id, clientId),
      eq(transactionImportsTable.date_range_start, startDate),
      eq(transactionImportsTable.date_range_end, endDate),
    ));

  if (existing.length > 0 && !overwrite) {
    res.status(409).json({
      conflict: true,
      existing_import: existing[0],
      message: `Transactions for ${startDate} – ${endDate} have already been synced for this client. Click Re-sync to overwrite.`,
    });
    return;
  }

  if (existing.length > 0 && overwrite) {
    for (const imp of existing) {
      await db.delete(transactionsTable).where(eq(transactionsTable.import_id, imp.id));
      await db.delete(transactionImportsTable).where(eq(transactionImportsTable.id, imp.id));
    }
  }

  // Get client's realm IDs
  const [clientRow] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1);
  if (!clientRow) { res.status(404).json({ error: "Client not found" }); return; }

  let realmIds: string[] = [];
  if ((clientRow as any).qbo_realm_ids) {
    try { realmIds = JSON.parse((clientRow as any).qbo_realm_ids); } catch {}
  }
  if (realmIds.length === 0 && clientRow.qbo_realm_id) {
    realmIds = [clientRow.qbo_realm_id];
  }
  if (realmIds.length === 0) {
    res.status(400).json({ error: "No QuickBooks company linked to this client" });
    return;
  }

  const now = new Date().toISOString();
  let totalInserted = 0;
  const importIds: number[] = [];

  for (const realmId of realmIds) {
    try {
      const url = `${QBO_API_BASE}/${realmId}/reports/TransactionList?start_date=${startDate}&end_date=${endDate}&minorversion=65`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      });

      if (!resp.ok) {
        const errText = await resp.text();
        logger.warn({ realmId, status: resp.status, errText }, "QBO TransactionList failed");
        continue;
      }

      const report = await resp.json() as any;
      const rows = parseTransactionListReport(report);

      // Create import record
      const [importRecord] = await db.insert(transactionImportsTable).values({
        client_id:        clientId,
        filename:         `QBO Sync: ${startDate} to ${endDate}`,
        date_range_start: startDate,
        date_range_end:   endDate,
        imported_at:      now,
        row_count:        rows.length,
        source:           "qbo_sync",
        realm_id:         realmId,
        sync_start:       startDate,
        sync_end:         endDate,
      } as any).returning();

      if (rows.length > 0) {
        const txRows = rows.map(r => ({
          client_id:        clientId,
          import_id:        importRecord.id,
          date:             r.date,
          transaction_type: r.transaction_type,
          num:              r.num,
          name:             r.name,
          memo:             r.memo,
          account:          r.account,
          amount:           r.amount,
          is_uncategorized: isUncategorized(r.account, r.split),
          status:           isUncategorized(r.account, r.split) ? "uncategorized" : "needs_info",
        }));
        await db.insert(transactionsTable).values(txRows);
        totalInserted += rows.length;
      }

      importIds.push(importRecord.id);
    } catch (err: any) {
      logger.error({ realmId, err: err.message }, "QBO sync error for realm");
    }
  }

  res.json({ ok: true, synced: totalInserted, importIds, syncedAt: now });
});

// ─── GET /api/qbo/clients/:id/transactions ────────────────────────────────────

router.get("/qbo/clients/:id/transactions", requireAuth, requireRole("admin"), async (req, res) => {
  const clientId = Number(req.params.id);
  if (isNaN(clientId)) { res.status(400).json({ error: "Invalid client id" }); return; }

  const imports = await db
    .select()
    .from(transactionImportsTable)
    .where(and(
      eq(transactionImportsTable.client_id, clientId),
      eq(transactionImportsTable.source as any, "qbo_sync"),
    ))
    .orderBy(transactionImportsTable.imported_at);

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.client_id, clientId))
    .orderBy(transactionsTable.date, transactionsTable.id);

  // Last sync timestamp across all imports for this client
  const lastSync = imports.length > 0
    ? imports.reduce((a, b) => (a.imported_at > b.imported_at ? a : b)).imported_at
    : null;

  res.json({ imports, transactions: txs, lastSync });
});

// ─── PATCH /api/qbo/clients/:id/realm ────────────────────────────────────────

router.patch("/qbo/clients/:id/realm", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid client id" }); return; }

  const { qbo_realm_ids, preferred_channel, channel_config } = req.body as {
    qbo_realm_ids?: string[] | null;
    preferred_channel?: string | null;
    channel_config?: string | null;
  };

  // Derive primary realm_id from first item in array (backward compat)
  const primaryRealmId = (qbo_realm_ids && qbo_realm_ids.length > 0) ? qbo_realm_ids[0] : null;

  const [updated] = await db
    .update(clientsTable)
    .set({
      qbo_realm_id: primaryRealmId,
      qbo_realm_ids: qbo_realm_ids ? JSON.stringify(qbo_realm_ids) : null,
      preferred_channel: (preferred_channel as any) ?? null,
      channel_config: channel_config ?? null,
    })
    .where(eq(clientsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json({ ok: true, qbo_realm_ids: updated.qbo_realm_ids, qbo_realm_id: updated.qbo_realm_id, preferred_channel: updated.preferred_channel, channel_config: updated.channel_config });
});

export default router;
