const express = require('express');
const OAuthClient = require('intuit-oauth');
const { pool } = require('../../db/database');
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

async function getTokenRow() {
  const { rows } = await pool.query("SELECT * FROM oauth_tokens WHERE provider = 'qbo'");
  return rows[0] || null;
}

async function saveTokens(tokenData, realmId) {
  const encrypted = encrypt(JSON.stringify(tokenData));
  const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
  await pool.query(`
    INSERT INTO oauth_tokens (provider, realm_id, access_token, refresh_token, expires_at, token_data, updated_at)
    VALUES ('qbo', $1, $2, $3, $4, $5, NOW())
    ON CONFLICT (provider) DO UPDATE SET
      realm_id = EXCLUDED.realm_id,
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expires_at = EXCLUDED.expires_at,
      token_data = EXCLUDED.token_data,
      updated_at = NOW()
  `, [
    realmId,
    encrypt(tokenData.access_token),
    encrypt(tokenData.refresh_token),
    expiresAt,
    encrypted,
  ]);
}

async function getValidClient() {
  const row = await getTokenRow();
  if (!row) throw new Error('QuickBooks not connected');

  const tokenData = JSON.parse(decrypt(row.token_data));
  const client = makeOAuthClient();
  client.setToken(tokenData);

  if (new Date(row.expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
    const refreshed = await client.refresh();
    const newData = refreshed.getJson();
    await saveTokens(newData, row.realm_id);
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
    await saveTokens(tokenData, realmId);
    res.redirect(`${frontendUrl}/admin/settings?qbo=connected`);
  } catch (err) {
    console.error('QBO callback error:', err.message);
    res.redirect(`${frontendUrl}/admin/settings?qbo=error`);
  }
});

router.use(authenticateToken, requireAdmin);

router.get('/status', async (req, res) => {
  try {
    const row = await getTokenRow();
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/customers', async (req, res) => {
  try {
    const { search } = req.query;
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

router.post('/sync-invoices', async (req, res) => {
  try {
    const { client, realmId } = await getValidClient();

    const { rows: linkedClients } = await pool.query(
      "SELECT id, qbo_customer_id FROM clients WHERE qbo_customer_id IS NOT NULL AND qbo_customer_id != ''"
    );
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

      for (const qboInv of paidInvoices) {
        const amount = parseFloat(qboInv.TotalAmt);
        const { rows } = await pool.query(
          "SELECT * FROM invoices WHERE client_id = $1 AND total = $2 AND status != 'paid'",
          [lc.id, amount]
        );
        if (rows[0]) {
          await pool.query("UPDATE invoices SET status = 'paid', paid_at = NOW() WHERE id = $1", [rows[0].id]);
          syncedCount++;
        }
      }
    }

    res.json({ message: `Sync complete — ${syncedCount} invoice(s) marked paid` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/clients/:clientId/link', async (req, res) => {
  try {
    const { qbo_customer_id } = req.body;
    const { rows } = await pool.query('SELECT id FROM clients WHERE id = $1', [req.params.clientId]);
    if (!rows[0]) return res.status(404).json({ error: 'Client not found' });
    await pool.query('UPDATE clients SET qbo_customer_id = $1 WHERE id = $2', [qbo_customer_id || null, req.params.clientId]);
    res.json({ message: 'QBO customer linked' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/disconnect', async (req, res) => {
  try {
    await pool.query("DELETE FROM oauth_tokens WHERE provider = 'qbo'");
    res.json({ message: 'QuickBooks disconnected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
