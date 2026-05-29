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
import { appSettingsTable, clientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
  });

  res.redirect(`${INTUIT_BASE}?${params.toString()}`);
});

// ─── GET /api/qbo/callback ────────────────────────────────────────────────────

router.get("/qbo/callback", async (req, res) => {
  const { code, error } = req.query as Record<string, string>;

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

  // Fetch & cache firm list immediately
  try {
    const firms = await fetchFirms(tokens.access_token);
    await setSetting("qbo_firms_cache", JSON.stringify(firms));
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
  await deleteSetting("qbo_firms_cache");

  res.json({ ok: true });
});

// ─── Firms fetcher ────────────────────────────────────────────────────────────

async function fetchFirms(accessToken: string): Promise<any[]> {
  const res = await fetch(FIRMS_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QBOA firms API ${res.status}: ${text}`);
  }

  const data = await res.json() as any;
  // Response shape: { qboAccountList: [{ name, realmId, country, ... }] }
  const list: any[] = data?.qboAccountList ?? data?.AccountList ?? data?.accounts ?? [];
  return list.map((f: any) => ({
    realmId: f.realmId ?? f.RealmId ?? f.Id ?? "",
    companyName: f.name ?? f.CompanyName ?? f.companyName ?? "",
    country: f.country ?? f.Country ?? "",
  }));
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
    const firms = await fetchFirms(token);
    await setSetting("qbo_firms_cache", JSON.stringify(firms));
    res.json({ firms, count: firms.length });
  } catch (err: any) {
    logger.error({ err }, "Failed to refresh QBO firms");
    res.status(502).json({ error: err.message ?? "Failed to fetch firms from QuickBooks" });
  }
});

// ─── PATCH /api/qbo/clients/:id/realm ────────────────────────────────────────

router.patch("/qbo/clients/:id/realm", requireAuth, requireRole("admin"), async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid client id" }); return; }

  const { qbo_realm_id, preferred_channel, channel_config } = req.body as {
    qbo_realm_id?: string | null;
    preferred_channel?: string | null;
    channel_config?: string | null;
  };

  const [updated] = await db
    .update(clientsTable)
    .set({
      qbo_realm_id: qbo_realm_id ?? null,
      preferred_channel: (preferred_channel as any) ?? null,
      channel_config: channel_config ?? null,
    })
    .where(eq(clientsTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Client not found" });
    return;
  }

  res.json({ ok: true, qbo_realm_id: updated.qbo_realm_id, preferred_channel: updated.preferred_channel, channel_config: updated.channel_config });
});

export default router;
