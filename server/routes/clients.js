const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
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

const ADDON_LABELS = {
  cleanup: 'Clean Up/Catch-Up',
  payroll: 'Full Service Payroll',
  w2: 'End of Year W-2',
  '1099': 'End of Year 1099',
  state_tax: 'Additional State Tax Filing',
  priority: 'Priority Services',
};

function enrichClient(client) {
  if (!client) return null;
  const addons = db.prepare('SELECT * FROM client_addons WHERE client_id = ? AND is_active = 1').all(client.id);
  return { ...client, addons };
}

router.get('/', requireAdmin, (req, res) => {
  const { status, search } = req.query;
  let query = `SELECT c.*, u.email as user_email FROM clients c LEFT JOIN users u ON c.user_id = u.id WHERE 1=1`;
  const params = [];

  if (status) { query += ' AND c.status = ?'; params.push(status); }
  if (search) {
    query += ' AND (c.business_name LIKE ? OR c.contact_name LIKE ? OR c.email LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  query += ' ORDER BY c.business_name ASC';

  const clients = db.prepare(query).all(...params);
  const enriched = clients.map(enrichClient);
  res.json({ data: enriched });
});

router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  if (req.user.role === 'client') {
    const ownClient = db.prepare('SELECT * FROM clients WHERE user_id = ?').get(req.user.id);
    if (!ownClient || ownClient.id !== parseInt(id)) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const client = db.prepare('SELECT c.*, u.email as user_email FROM clients c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  res.json({ data: enrichClient(client) });
});

router.post('/', requireAdmin, (req, res) => {
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

  // "No BK Package" sends tier='none'; map to a valid DB tier with price=0
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

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existingUser) return res.status(400).json({ error: 'Email already in use' });

  const password_hash = bcrypt.hashSync(password, 10);

  const tx = db.transaction(() => {
    const userId = db.prepare(
      'INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)'
    ).run(email.toLowerCase(), password_hash, 'client', contact_name).lastInsertRowid;

    const clientId = db.prepare(`
      INSERT INTO clients (
        user_id, business_name, contact_name, email, phone, website, status,
        notes, expected_hours_per_month, package_tier, package_price,
        prepay_months, billing_cycle_start, employee_count,
        va_package_tier, va_hours_reset_day, no_bk_package, va_package_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, business_name, contact_name, email, phone, website, status,
      notes, resolvedHours, resolvedTier, resolvedPackagePrice,
      prepay_months, billing_cycle_start, employee_count,
      va_package_tier || null, va_hours_reset_day || 1,
      no_bk_package ? 1 : 0, resolvedVaPrice
    ).lastInsertRowid;

    const insertAddon = db.prepare(
      'INSERT INTO client_addons (client_id, addon_type, quantity, employee_count) VALUES (?, ?, ?, ?)'
    );
    for (const addon of addons) {
      insertAddon.run(clientId, addon.type, addon.quantity || 1, addon.employee_count || 0);
    }

    return clientId;
  });

  const clientId = tx();
  const client = db.prepare('SELECT c.*, u.email as user_email FROM clients c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(clientId);
  res.status(201).json({ data: enrichClient(client), message: 'Client created successfully' });
});

router.put('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
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

  // Map 'none' tier to valid DB value
  const resolvedTier = package_tier === 'none' ? 'essentials' : (package_tier ?? client.package_tier);

  // Determine BK price: explicit custom → derive from tier → keep existing
  const resolvedPackagePrice = no_bk_package != null
    ? (no_bk_package ? 0 : (customPackagePrice != null ? Number(customPackagePrice) : (PACKAGE_PRICES[resolvedTier] || client.package_price)))
    : (customPackagePrice != null ? Number(customPackagePrice) : (package_tier ? (PACKAGE_PRICES[resolvedTier] || 0) : client.package_price));

  // Determine VA price: explicit custom → derive from tier → keep existing
  const resolvedVaPrice = customVaPrice != null
    ? Number(customVaPrice)
    : (va_package_tier !== undefined ? (VA_PACKAGE_PRICES[va_package_tier] ?? 0) : (client.va_package_price ?? 0));

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE clients SET
        business_name = ?, contact_name = ?, email = ?, phone = ?, website = ?,
        status = ?, notes = ?, expected_hours_per_month = ?, package_tier = ?,
        package_price = ?, prepay_months = ?, billing_cycle_start = ?,
        employee_count = ?, va_package_tier = ?, va_hours_reset_day = ?,
        no_bk_package = ?, va_package_price = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
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
      id
    );

    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, client.user_id);
    }

    if (addons !== undefined) {
      db.prepare('DELETE FROM client_addons WHERE client_id = ?').run(id);
      const insertAddon = db.prepare(
        'INSERT INTO client_addons (client_id, addon_type, quantity, employee_count) VALUES (?, ?, ?, ?)'
      );
      for (const addon of addons) {
        insertAddon.run(id, addon.type, addon.quantity || 1, addon.employee_count || 0);
      }
    }
  });

  tx();
  const updated = db.prepare('SELECT c.*, u.email as user_email FROM clients c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(id);
  res.json({ data: enrichClient(updated), message: 'Client updated' });
});

router.patch('/:id/archive', requireAdmin, (req, res) => {
  const { id } = req.params;
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const newStatus = client.status === 'active' ? 'inactive' : 'active';
  db.prepare('UPDATE clients SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, id);
  res.json({ message: `Client marked as ${newStatus}` });
});

module.exports = router;
