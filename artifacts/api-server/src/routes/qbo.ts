/**
 * QuickBooks Online Accountant (QBOA) integration routes
 *
 * GET    /api/qbo/status                         – connection status + connected user info
 * GET    /api/qbo/connect                        – redirect to Intuit OAuth2 consent screen
 * GET    /api/qbo/callback                       – OAuth2 callback; stores tokens
 * POST   /api/qbo/disconnect                     – revoke tokens & clear stored credentials
 * GET    /api/qbo/firms                          – list QBOA-managed companies (firms)
 * POST   /api/qbo/refresh-firms                  – re-fetch firm list from Intuit and cache
 * GET    /api/qbo/clients/:id/accounts           – chart of accounts for a client's QBO realm
 * POST   /api/qbo/clients/:id/sync-transactions  – sync transactions from QBO
 * POST   /api/qbo/transactions/:id/save          – write memo/account back to QBO
 * POST   /api/qbo/transactions/bulk-save         – bulk write-back for a client
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
    prompt: "login",
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

  if (realmId) {
    await setSetting("qbo_realm_id", realmId);
    logger.info({ realmId }, "QBO callback: stored realmId");
  }

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

  res.json({ ok: true });
});

// ─── Firms cache helpers ──────────────────────────────────────────────────────

async function mergeFirmsCache(newFirms: any[]): Promise<any[]> {
  const existing: any[] = await getSetting("qbo_firms_cache")
    .then(raw => (raw ? JSON.parse(raw) : []))
    .catch(() => []);

  const map = new Map<string, any>();
  for (const f of existing) if (f.realmId) map.set(f.realmId, f);
  for (const f of newFirms) if (f.realmId) map.set(f.realmId, f);
  return Array.from(map.values());
}

async function fetchCompanyInfo(accessToken: string, realmId: string): Promise<{ realmId: string; companyName: string; country: string } | null> {
  try {
    const url = `${QBO_API_BASE}/${realmId}/companyinfo/${realmId}?minorversion=65`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
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

async function fetchFirms(accessToken: string, fallbackRealmId?: string | null): Promise<any[]> {
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
  } catch { /* fall through */ }

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

// ─── GET /api/qbo/clients/:id/accounts ───────────────────────────────────────
// Returns chart of accounts for a client's QBO realm. Cached for 24h.

router.get("/qbo/clients/:id/accounts", requireAuth, requireRole("admin"), async (req, res) => {
  const clientId = Number(req.params.id);
  if (isNaN(clientId)) { res.status(400).json({ error: "Invalid client id" }); return; }

  const [clientRow] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId)).limit(1);
  const realmId = (clientRow as any)?.qbo_realm_id;
  if (!realmId) { res.status(400).json({ error: "No QBO company linked to this client" }); return; }

  const cacheKey = `qbo_accounts_cache_${realmId}`;
  const cached = await getSetting(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { accounts: any[]; cached_at: string };
      const age = Date.now() - new Date(parsed.cached_at).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        res.json({ accounts: parsed.accounts, cached: true });
        return;
      }
    } catch { /* re-fetch */ }
  }

  const token = await getValidAccessToken();
  if (!token) { res.status(503).json({ error: "QuickBooks not connected" }); return; }

  try {
    const query = encodeURIComponent("SELECT * FROM Account WHERE Active = true MAXRESULTS 500");
    const url = `${QBO_API_BASE}/${realmId}/query?query=${query}&minorversion=65`;
    const qboRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    if (!qboRes.ok) {
      const errText = await qboRes.text();
      logger.warn({ status: qboRes.status, errText }, "QBO accounts fetch failed");
      res.status(502).json({ error: `QBO returned ${qboRes.status}` });
      return;
    }

    const data = await qboRes.json() as any;
    const raw: any[] = data?.QueryResponse?.Account ?? [];
    const accounts = raw.map(a => ({
      Id: a.Id,
      Name: a.Name,
      FullyQualifiedName: a.FullyQualifiedName ?? a.Name,
      AccountType: a.AccountType,
      AccountSubType: a.AccountSubType,
    })).sort((a, b) => a.FullyQualifiedName.localeCompare(b.FullyQualifiedName));

    await setSetting(cacheKey, JSON.stringify({ accounts, cached_at: new Date().toISOString() }));
    res.json({ accounts, cached: false });
  } catch (err: any) {
    logger.error({ err }, "Failed to fetch QBO accounts");
    res.status(500).json({ error: err.message });
  }
});

// ─── Helper: parse QBO TransactionList report rows ────────────────────────────

interface ColItem { value: string; id?: string }

interface QboTxRow {
  date: string | null;
  transaction_type: string | null;
  qbo_txn_id: string | null;
  num: string | null;
  name: string | null;
  memo: string | null;
  account: string | null;
  split: string | null;
  amount: number | null;
}

function extractTxRows(row: any): ColItem[][] {
  const results: ColItem[][] = [];
  if (row.ColData && Array.isArray(row.ColData)) {
    results.push(row.ColData.map((c: any) => ({ value: c.value ?? "", id: c.id })));
  }
  if (row.Rows?.Row) {
    for (const r of row.Rows.Row) {
      results.push(...extractTxRows(r));
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

  const rawRows: ColItem[][] = [];
  for (const row of (report?.Rows?.Row ?? [])) {
    rawRows.push(...extractTxRows(row));
  }

  return rawRows.map(cols => {
    const get    = (i: number) => (i >= 0 && cols[i] !== undefined ? String(cols[i].value).trim() : null) || null;
    const getId  = (i: number) => (i >= 0 && cols[i]?.id ? String(cols[i].id) : null);
    const rawAmt = get(amtIdx);
    const amount = rawAmt ? parseFloat(rawAmt.replace(/[$,]/g, "")) : null;
    return {
      date:             get(dateIdx),
      transaction_type: get(typeIdx),
      qbo_txn_id:       getId(typeIdx),
      num:              get(numIdx),
      name:             get(nameIdx),
      memo:             get(memoIdx),
      account:          get(acctIdx),
      split:            get(splitIdx),
      amount:           isNaN(amount as number) ? null : amount,
    };
  }).filter(r => r.date);
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
          qbo_txn_id:       r.qbo_txn_id,
          qbo_txn_type:     r.transaction_type,
          qbo_pending:      false,
        }));
        await db.insert(transactionsTable).values(txRows as any);
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

  const primaryRealmId = (qbo_realm_ids && qbo_realm_ids.length > 0) ? qbo_realm_ids[0] : null;

  const [updated] = await db
    .update(clientsTable)
    .set({
      qbo_realm_id:      primaryRealmId,
      qbo_realm_ids:     qbo_realm_ids ? JSON.stringify(qbo_realm_ids) : null,
      preferred_channel: preferred_channel ?? undefined,
      channel_config:    channel_config ?? undefined,
    } as any)
    .where(eq(clientsTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Client not found" }); return; }
  res.json(updated);
});

// ─── QBO write-back helpers ───────────────────────────────────────────────────

function getEntityPath(txType: string | null): string | null {
  if (!txType) return null;
  const normalized = txType.toLowerCase().replace(/\s+/g, "");
  const map: Record<string, string> = {
    purchase:          "purchase",
    expense:           "purchase",
    bill:              "bill",
    invoice:           "invoice",
    journalentry:      "journalentry",
    check:             "check",
    salesreceipt:      "salesreceipt",
    deposit:           "deposit",
    transfer:          "transfer",
    creditmemo:        "creditmemo",
    refundreceipt:     "refundreceipt",
    creditcardcredit:  "creditcardcredit",
    vendorcredit:      "vendorcredit",
    billpayment:       "billpayment",
    payment:           "payment",
  };
  return map[normalized] ?? null;
}

async function writeEntityToQbo(
  accessToken: string,
  realmId: string,
  txnId: string,
  txnType: string,
  memo: string | null,
  accountId: string | null,
  accountName: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const path = getEntityPath(txnType);
  if (!path) return { ok: false, error: `Unsupported entity type: ${txnType}` };

  // Fetch the current entity to get SyncToken and full structure
  const getUrl = `${QBO_API_BASE}/${realmId}/${path}/${txnId}?minorversion=65`;
  const getRes = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });

  if (!getRes.ok) {
    const errText = await getRes.text();
    logger.warn({ path, txnId, status: getRes.status }, "QBO entity fetch failed for write-back");
    return { ok: false, error: `Could not fetch entity from QuickBooks (${getRes.status}): ${errText.slice(0, 200)}` };
  }

  const entityData = await getRes.json() as any;
  // QBO wraps the entity under its type key
  const entityKey = Object.keys(entityData).find(k => k !== "time" && typeof entityData[k] === "object");
  if (!entityKey) return { ok: false, error: "Unrecognized QBO response shape" };

  const entity = { ...entityData[entityKey] };

  // Update memo (PrivateNote in QBO)
  if (memo !== null) {
    entity.PrivateNote = memo;
  }

  // Update account on the first applicable expense line
  if (accountId && entity.Line && Array.isArray(entity.Line)) {
    for (const line of entity.Line) {
      const dt = line.DetailType;
      if (dt === "AccountBasedExpenseLineDetail" && line.AccountBasedExpenseLineDetail) {
        line.AccountBasedExpenseLineDetail.AccountRef = {
          value: accountId,
          name: accountName ?? undefined,
        };
        break;
      }
      if (dt === "DepositLineDetail" && line.DepositLineDetail) {
        line.DepositLineDetail.AccountRef = {
          value: accountId,
          name: accountName ?? undefined,
        };
        break;
      }
      if (dt === "ItemBasedExpenseLineDetail" && line.ItemBasedExpenseLineDetail) {
        // For item-based, update the AccountRef if present
        if (line.ItemBasedExpenseLineDetail.AccountRef) {
          line.ItemBasedExpenseLineDetail.AccountRef = {
            value: accountId,
            name: accountName ?? undefined,
          };
        }
        break;
      }
    }
  }

  // POST the modified entity back
  const postUrl = `${QBO_API_BASE}/${realmId}/${path}?minorversion=65`;
  const postRes = await fetch(postUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(entity),
  });

  if (!postRes.ok) {
    const errText = await postRes.text();
    logger.warn({ path, txnId, status: postRes.status }, "QBO entity update failed");
    return { ok: false, error: `QuickBooks rejected the update (${postRes.status}): ${errText.slice(0, 200)}` };
  }

  return { ok: true };
}

// ─── POST /api/qbo/transactions/:id/save ─────────────────────────────────────
// Write a single transaction's memo + account back to QBO

router.post("/qbo/transactions/:id/save", requireAuth, requireRole("admin"), async (req, res) => {
  const txId = Number(req.params.id);
  if (isNaN(txId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, txId)).limit(1);
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }

  if (!(tx as any).qbo_txn_id || !(tx as any).qbo_txn_type) {
    res.status(400).json({ error: "This transaction has no QBO entity ID. It may have been imported via CSV before entity tracking was added — re-sync to capture IDs." });
    return;
  }

  const [clientRow] = await db.select().from(clientsTable).where(eq(clientsTable.id, tx.client_id)).limit(1);
  const realmId = (clientRow as any)?.qbo_realm_id;
  if (!realmId) { res.status(400).json({ error: "No QBO company linked to this client" }); return; }

  const accessToken = await getValidAccessToken();
  if (!accessToken) { res.status(503).json({ error: "QuickBooks not connected — please reconnect." }); return; }

  const result = await writeEntityToQbo(
    accessToken,
    realmId,
    (tx as any).qbo_txn_id,
    (tx as any).qbo_txn_type,
    tx.memo ?? null,
    (tx as any).qbo_account_id ?? null,
    tx.account ?? null,
  );

  if (!result.ok) {
    res.status(502).json({ error: result.error });
    return;
  }

  const now = new Date().toISOString();
  const [updated] = await db
    .update(transactionsTable)
    .set({ qbo_pending: false, qbo_last_synced_at: now } as any)
    .where(eq(transactionsTable.id, txId))
    .returning();

  res.json({ ok: true, transaction: updated });
});

// ─── POST /api/qbo/transactions/bulk-save ────────────────────────────────────
// Write all pending transactions for a client back to QBO

router.post("/qbo/transactions/bulk-save", requireAuth, requireRole("admin"), async (req, res) => {
  const { client_id } = req.body as { client_id?: number };
  if (!client_id) { res.status(400).json({ error: "client_id required" }); return; }

  const [clientRow] = await db.select().from(clientsTable).where(eq(clientsTable.id, client_id)).limit(1);
  const realmId = (clientRow as any)?.qbo_realm_id;
  if (!realmId) { res.status(400).json({ error: "No QBO company linked to this client" }); return; }

  const accessToken = await getValidAccessToken();
  if (!accessToken) { res.status(503).json({ error: "QuickBooks not connected — please reconnect." }); return; }

  const pendingTxs = await db
    .select()
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.client_id, client_id),
      eq(transactionsTable.qbo_pending, true),
    ));

  const now = new Date().toISOString();
  const results: Array<{ id: number; ok: boolean; error?: string }> = [];

  for (const tx of pendingTxs) {
    if (!(tx as any).qbo_txn_id || !(tx as any).qbo_txn_type) {
      results.push({ id: tx.id, ok: false, error: "No QBO entity ID" });
      continue;
    }

    const result = await writeEntityToQbo(
      accessToken,
      realmId,
      (tx as any).qbo_txn_id,
      (tx as any).qbo_txn_type,
      tx.memo ?? null,
      (tx as any).qbo_account_id ?? null,
      tx.account ?? null,
    );

    if (result.ok) {
      await db
        .update(transactionsTable)
        .set({ qbo_pending: false, qbo_last_synced_at: now } as any)
        .where(eq(transactionsTable.id, tx.id));
      results.push({ id: tx.id, ok: true });
    } else {
      results.push({ id: tx.id, ok: false, error: result.error });
    }
  }

  const succeeded = results.filter(r => r.ok).length;
  const failed    = results.filter(r => !r.ok).length;

  res.json({ ok: true, results, succeeded, failed, total: results.length });
});

export default router;
