const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const PACKAGE_PRICES = {
  essentials: 250,
  growth: 350,
  scale: 500,
  full_service: 800,
};

const VA_PACKAGE_PRICES = {
  time_saver: 400,
  time_multiplier: 700,
  time_freedom: 1200,
  agency: 0,
};

const VA_PACKAGE_HOURS = {
  time_saver: 10,
  time_multiplier: 20,
  time_freedom: 40,
  agency: 0,
};

async function enrichClient(client) {
  if (!client) return null;
  const { rows: addons } = await pool.query(
    'SELECT * FROM client_addons WHERE client_id = $1 AND is_active = 1',
    [client.id]
  );
  return { ...client, addons };
}

router.get('/', requireAdmin, async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = `SELECT c.*, u.email as user_email FROM clients c LEFT JOIN users u ON c.user_id = u.id WHERE 1=1`;
    const params = [];

    if (status) {
      params.push(status);
      query += ` AND c.status = $${params.length}`;
    }
    if (search) {
      const like = `%${search}%`;
      const n = params.length;
      params.push(like, like, like);
      query += ` AND (c.business_name LIKE $${n + 1} OR c.contact_name LIKE $${n + 2} OR c.email LIKE $${n + 3})`;
    }
    query += ' ORDER BY c.business_name ASC';

    const { rows: clients } = await pool.query(query, params);
    const enriched = await Promise.all(clients.map(c => enrichClient(c)));
    res.json({ data: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role === 'client') {
      const { rows } = await pool.query('SELECT * FROM clients WHERE user_id = $1', [req.user.id]);
      const ownClient = rows[0];
      if (!ownClient || ownClient.id !== parseInt(id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const { rows } = await pool.query(
      'SELECT c.*, u.email as user_email FROM clients c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = $1',
      [id]
    );
    const client = rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    res.json({ data: await enrichClient(client) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      business_name, contact_name, email, phone, website, status = 'active',
      notes, expected_hours_per_month, package_tier, prepay_months = 0,
      billing_cycle_start, employee_count = 0, addons = [], password,
      va_package_tier = null, va_hours_reset_day = 1,
      no_bk_package = 0,
      package_price: customPackagePrice,
      va_package_price: customVaPrice,
    } = req.body;

    if (!business_name || !contact_name || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const resolvedTier = (!package_tier || package_tier === 'none') ? 'essentials' : package_tier;
    if (!PACKAGE_PRICES[resolvedTier] && resolvedTier !== 'essentials') {
      return res.status(400).json({ error: 'Invalid package tier' });
    }

    const resolvedPackagePrice = no_bk_package
      ? 0
      : (customPackagePrice != null ? Number(customPackagePrice) : (PACKAGE_PRICES[resolvedTier] || 0));

    const resolvedVaPrice = customVaPrice != null
      ? Number(customVaPrice)
      : (VA_PACKAGE_PRICES[va_package_tier] ?? 0);

    const resolvedHours = expected_hours_per_month != null
      ? Number(expected_hours_per_month)
      : (va_package_tier ? (VA_PACKAGE_HOURS[va_package_tier] ?? 0) : 0);

    const { rows: existingRows } = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingRows[0]) return res.status(400).json({ error: 'Email already in use' });

    const password_hash = bcrypt.hashSync(password, 10);

    const clientId = await withTransaction(async (pgClient) => {
      const userResult = await pgClient.query(
        'INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4) RETURNING id',
        [email.toLowerCase(), password_hash, 'client', contact_name]
      );
      const userId = userResult.rows[0].id;

      const clientResult = await pgClient.query(`
        INSERT INTO clients (
          user_id, business_name, contact_name, email, phone, website, status,
          notes, expected_hours_per_month, package_tier, package_price,
          prepay_months, billing_cycle_start, employee_count,
          va_package_tier, va_hours_reset_day, no_bk_package, va_package_price
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id
      `, [
        userId, business_name, contact_name, email, phone, website, status,
        notes, resolvedHours, resolvedTier, resolvedPackagePrice,
        prepay_months, billing_cycle_start, employee_count,
        va_package_tier || null, va_hours_reset_day || 1,
        no_bk_package ? 1 : 0, resolvedVaPrice,
      ]);
      const newClientId = clientResult.rows[0].id;

      for (const addon of addons) {
        await pgClient.query(
          'INSERT INTO client_addons (client_id, addon_type, quantity, employee_count) VALUES ($1, $2, $3, $4)',
          [newClientId, addon.type, addon.quantity || 1, addon.employee_count || 0]
        );
      }
      return newClientId;
    });

    const { rows } = await pool.query(
      'SELECT c.*, u.email as user_email FROM clients c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = $1',
      [clientId]
    );
    res.status(201).json({ data: await enrichClient(rows[0]), message: 'Client created successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM clients WHERE id = $1', [id]);
    const client = rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const {
      business_name, contact_name, email, phone, website, status,
      notes, expected_hours_per_month, package_tier, prepay_months,
      billing_cycle_start, employee_count, addons, password,
      va_package_tier, va_hours_reset_day,
      no_bk_package,
      package_price: customPackagePrice,
      va_package_price: customVaPrice,
    } = req.body;

    const resolvedTier = package_tier === 'none' ? 'essentials' : (package_tier ?? client.package_tier);

    const resolvedPackagePrice = no_bk_package != null
      ? (no_bk_package ? 0 : (customPackagePrice != null ? Number(customPackagePrice) : (PACKAGE_PRICES[resolvedTier] || client.package_price)))
      : (customPackagePrice != null ? Number(customPackagePrice) : (package_tier ? (PACKAGE_PRICES[resolvedTier] || 0) : client.package_price));

    const resolvedVaPrice = customVaPrice != null
      ? Number(customVaPrice)
      : (va_package_tier !== undefined ? (VA_PACKAGE_PRICES[va_package_tier] ?? 0) : (client.va_package_price ?? 0));

    await withTransaction(async (pgClient) => {
      await pgClient.query(`
        UPDATE clients SET
          business_name = $1, contact_name = $2, email = $3, phone = $4, website = $5,
          status = $6, notes = $7, expected_hours_per_month = $8, package_tier = $9,
          package_price = $10, prepay_months = $11, billing_cycle_start = $12,
          employee_count = $13, va_package_tier = $14, va_hours_reset_day = $15,
          no_bk_package = $16, va_package_price = $17,
          updated_at = NOW()
        WHERE id = $18
      `, [
        business_name ?? client.business_name,
        contact_name ?? client.contact_name,
        email ?? client.email,
        phone ?? client.phone,
        website ?? client.website,
        status ?? client.status,
        notes ?? client.notes,
        expected_hours_per_month ?? client.expected_hours_per_month,
        resolvedTier,
        resolvedPackagePrice,
        prepay_months ?? client.prepay_months,
        billing_cycle_start ?? client.billing_cycle_start,
        employee_count ?? client.employee_count,
        va_package_tier !== undefined ? (va_package_tier || null) : client.va_package_tier,
        va_hours_reset_day !== undefined ? (va_hours_reset_day || 1) : (client.va_hours_reset_day || 1),
        no_bk_package != null ? (no_bk_package ? 1 : 0) : (client.no_bk_package || 0),
        resolvedVaPrice,
        id,
      ]);

      if (password) {
        const hash = bcrypt.hashSync(password, 10);
        await pgClient.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, client.user_id]);
      }

      if (addons !== undefined) {
        await pgClient.query('DELETE FROM client_addons WHERE client_id = $1', [id]);
        for (const addon of addons) {
          await pgClient.query(
            'INSERT INTO client_addons (client_id, addon_type, quantity, employee_count) VALUES ($1, $2, $3, $4)',
            [id, addon.type, addon.quantity || 1, addon.employee_count || 0]
          );
        }
      }
    });

    const { rows: updated } = await pool.query(
      'SELECT c.*, u.email as user_email FROM clients c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = $1',
      [id]
    );
    res.json({ data: await enrichClient(updated[0]), message: 'Client updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/archive', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM clients WHERE id = $1', [id]);
    const client = rows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const newStatus = client.status === 'active' ? 'inactive' : 'active';
    await pool.query('UPDATE clients SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, id]);
    res.json({ message: `Client marked as ${newStatus}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
