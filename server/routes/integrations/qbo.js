const express = require('express');
const OAuthClient = require('intuit-oauth');
const db = require('../../db/database');
const { authenticateToken, requireAdmin } = require('../../middleware/auth');
const { encrypt, decrypt } = require('../../utils/crypto');

const router = express.Router();

function makeOAuthClient() {
  return new OAuthClient({
    clientId: process.env.QBO_CLIENT_ID || 'YOUR_QBO_CLIENT_ID',
    clientSecret: process.env.QBO_CLIENT_SECRET || 'YOUR_QBO_CLIENT_SECRET',
    environment: process.env.QBO_ENVIRONMENT || 'sandbox',
    redirectUri: process.env.QBO_REDIRECT_URI || 'http://localhost:3001/api/integrations/qbo/callback',
  });
}

function getTokenRow() {
  return db.prepare("SELECT * FROM oauth_tokens WHERE provider = 'qbo'").get();
}

function saveTokens(tokenData, realmId) {
  const encrypted = encrypt(JSON.stringify(tokenData));
  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
  db.prepare(`
    INSERT INTO oauth_tokens (provider, realm_id, access_token, refresh_token, expires_at, token_data, updated_at)
    VALUES ('qbo', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(provider) DO UPDATE SET
      realm_id = excluded.realm_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      token_data = excluded.token_data,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    realmId,
    encrypt(tokenData.access_token),
    encrypt(tokenData.refresh_token),
    expiresAt,
    encrypted
  );
}

async function getValidClient() {
  const row = getTokenRow();
  if (!row) throw new Error('QuickBooks not connected');

  const tokenData = JSON.parse(decrypt(row.token_data));
  const client = makeOAuthClient();
  client.setToken(tokenData);

  // Refresh if expired or expiring within 5 min
  if (new Date(row.expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
    const refreshed = await client.refresh();
    const newData = refreshed.getJson();
    saveTokens(newData, row.realm_id);
    client.setToken(newData);
  }

  return { client, realmId: row.realm_id };
}

function qboBaseUrl(realmId) {
  const env = process.env.QBO_ENVIRONMENT || 'sandbox';
  const base = env === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
  return `${base}/v3/company/${realmId}`;
}

// OAuth flow — no auth required on these two endpoints
router.get('/auth-url', authenticateToken, requireAdmin, (req, res) => {
  const client = makeOAuthClient();
  const authUri = client.authorizeUri({
    scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
    state: Buffer.from(String(Date.now())).toString('hex'),
  });
  res.json({ data: { url: authUri } });
});

router.get('/callback', async (req, res) => {
  const frontendUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  try {
    const client = makeOAuthClient();
    const authResponse = await client.createToken(req.url);
    const tokenData = authResponse.getJson();
    const realmId = req.query.realmId;
    saveTokens(tokenData, realmId);
    res.redirect(`${frontendUrl}/admin/settings?qbo=connected`);
  } catch (err) {
    console.error('QBO callback error:', err.message);
    res.redirect(`${frontendUrl}/admin/settings?qbo=error`);
  }
});

// All routes below require auth
router.use(authenticateToken, requireAdmin);

router.get('/status', (req, res) => {
  const row = getTokenRow();
  const configured = !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_ID !== 'YOUR_QBO_CLIENT_ID');
  res.json({
    data: {
      configured,
      connected: !!row,
      realmId: row?.realm_id,
      expiresAt: row?.expires_at,
      lastUpdated: row?.updated_at,
    }
  });
});

// Search QBO customers
router.get('/customers', async (req, res) => {
  const { search } = req.query;
  try {
    const { client, realmId } = await getValidClient();
    const query = search
      ? `SELECT * FROM Customer WHERE DisplayName LIKE '%${search.replace(/'/g, '')}%' MAXRESULTS 20`
      : 'SELECT * FROM Customer MAXRESULTS 20';

    const response = await client.makeApiCall({
      url: `${qboBaseUrl(realmId)}/query?query=${encodeURIComponent(query)}&minorversion=65`,
      method: 'GET',
    });
    const data = response.getJson();
    const customers = data.QueryResponse?.Customer || [];
    res.json({
      data: customers.map(c => ({
        id: c.Id,
        display_name: c.DisplayName,
        email: c.PrimaryEmailAddr?.Address,
        phone: c.PrimaryPhone?.FreeFormNumber,
        company: c.CompanyName,
      }))
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Sync invoice statuses from QBO (read-only — only updates local status)
router.post('/sync-invoices', async (req, res) => {
  try {
    const { client, realmId } = await getValidClient();

    // Get all local clients that have a QBO customer ID
    const linkedClients = db.prepare('SELECT id, qbo_customer_id FROM clients WHERE qbo_customer_id IS NOT NULL AND qbo_customer_id != ""').all();
    if (!linkedClients.length) {
      return res.json({ message: 'No clients linked to QBO. Add QBO Customer IDs to clients first.' });
    }

    let syncedCount = 0;
    for (const lc of linkedClients) {
      const query = `SELECT * FROM Invoice WHERE CustomerRef = '${lc.qbo_customer_id}' AND TxnStatus = 'Paid'`;
      const response = await client.makeApiCall({
        url: `${qboBaseUrl(realmId)}/query?query=${encodeURIComponent(query)}&minorversion=65`,
        method: 'GET',
      });
      const data = response.getJson();
      const paidInvoices = data.QueryResponse?.Invoice || [];

      // Match by amount + approximate date and mark paid locally if not already
      for (const qboInv of paidInvoices) {
        const amount = parseFloat(qboInv.TotalAmt);
        const localInv = db.prepare(`
          SELECT * FROM invoices WHERE client_id = ? AND total = ? AND status != 'paid'
        `).get(lc.id, amount);
        if (localInv) {
          db.prepare("UPDATE invoices SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?").run(localInv.id);
          syncedCount++;
        }
      }
    }

    res.json({ message: `Sync complete — ${syncedCount} invoice(s) marked paid` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Link a local client to a QBO customer
router.put('/clients/:clientId/link', (req, res) => {
  const { qbo_customer_id } = req.body;
  const client = db.prepare('SELECT id FROM clients WHERE id = ?').get(req.params.clientId);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  db.prepare('UPDATE clients SET qbo_customer_id = ? WHERE id = ?').run(qbo_customer_id || null, req.params.clientId);
  res.json({ message: 'QBO customer linked' });
});

router.delete('/disconnect', (req, res) => {
  db.prepare("DELETE FROM oauth_tokens WHERE provider = 'qbo'").run();
  res.json({ message: 'QuickBooks disconnected' });
});

module.exports = router;
