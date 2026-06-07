require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { createSchema } = require('./schema');
const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function seed() {
  await createSchema();

  await pool.query('DELETE FROM refresh_tokens');
  await pool.query('DELETE FROM messages');
  await pool.query('DELETE FROM documents');
  await pool.query('DELETE FROM invoice_items');
  await pool.query('DELETE FROM invoices');
  await pool.query('DELETE FROM tasks');
  await pool.query('DELETE FROM time_entries');
  await pool.query('DELETE FROM client_addons');
  await pool.query('DELETE FROM clients');
  await pool.query('DELETE FROM users');

  const adminHash = bcrypt.hashSync('changeme123', 10);
  const clientHash = bcrypt.hashSync('client123', 10);

  const { rows: [admin] } = await pool.query(
    'INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4) RETURNING id',
    ['hiedi@hmvirtualservices.com', adminHash, 'admin', 'Hiedi Moorman']
  );
  const { rows: [sarahUser] } = await pool.query(
    'INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4) RETURNING id',
    ['sarah@example.com', clientHash, 'client', 'Sarah Chen']
  );
  const { rows: [mariaUser] } = await pool.query(
    'INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4) RETURNING id',
    ['maria@example.com', clientHash, 'client', 'Maria Lopez']
  );
  const { rows: [danaUser] } = await pool.query(
    'INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, $3, $4) RETURNING id',
    ['dana@example.com', clientHash, 'client', 'Dana Wright']
  );

  const insertClient = (vals) => pool.query(`
    INSERT INTO clients (user_id, business_name, contact_name, email, phone, website, status, notes, expected_hours_per_month, package_tier, package_price, prepay_months, billing_cycle_start, employee_count)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id
  `, vals);

  const { rows: [sarah] } = await insertClient([
    sarahUser.id, 'Chen Consulting LLC', 'Sarah Chen', 'sarah@example.com', '(555) 201-3456', 'chenconsulting.com',
    'active', 'Prefers email communication. Books call on Fridays.', 12, 'scale', 500, 0, '2026-01-01', 0,
  ]);
  const { rows: [maria] } = await insertClient([
    mariaUser.id, 'Lopez Bakery', 'Maria Lopez', 'maria@example.com', '(555) 348-7890', '',
    'active', 'New client — onboarded March 2026.', 6, 'essentials', 250, 0, '2026-03-01', 0,
  ]);
  const { rows: [dana] } = await insertClient([
    danaUser.id, 'Wright & Associates', 'Dana Wright', 'dana@example.com', '(555) 467-2211', 'wrightassociates.net',
    'active', 'Has 4 employees on payroll. Quarterly tax filings.', 10, 'growth', 350, 0, '2026-02-01', 4,
  ]);

  await pool.query(
    'INSERT INTO client_addons (client_id, addon_type, quantity, employee_count, is_active) VALUES ($1,$2,$3,$4,1)',
    [sarah.id, 'priority', 1, 0]
  );
  await pool.query(
    'INSERT INTO client_addons (client_id, addon_type, quantity, employee_count, is_active) VALUES ($1,$2,$3,$4,1)',
    [dana.id, 'payroll', 1, 4]
  );

  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const dueIn5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const paidDate = new Date(now.getFullYear(), now.getMonth(), 10);
  const toDate = (d) => d.toISOString().split('T')[0];

  const { rows: [sarahInv] } = await pool.query(`
    INSERT INTO invoices (client_id, invoice_number, status, due_date, subtotal, discount_percent, discount_amount, total, client_notes, billing_period_start, billing_period_end, paid_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id
  `, [
    sarah.id, 'HM-2026-001', 'paid',
    toDate(new Date(now.getFullYear(), now.getMonth(), 15)),
    600, 0, 0, 600, 'Thank you for your continued business!',
    toDate(lastMonth), toDate(lastMonthEnd), toDate(paidDate),
  ]);
  const { rows: [mariaInv] } = await pool.query(`
    INSERT INTO invoices (client_id, invoice_number, status, due_date, subtotal, discount_percent, discount_amount, total, client_notes, billing_period_start, billing_period_end, paid_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id
  `, [
    maria.id, 'HM-2026-002', 'sent',
    toDate(dueIn5Days),
    250, 0, 0, 250, 'Please remit payment by the due date. Thank you!',
    toDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    toDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    null,
  ]);

  await pool.query(
    'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5)',
    [sarahInv.id, 'Scale Package — Monthly Bookkeeping', 1, 500, 500]
  );
  await pool.query(
    'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5)',
    [sarahInv.id, 'Priority Services Add-on', 1, 100, 100]
  );
  await pool.query(
    'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5)',
    [mariaInv.id, 'Essentials Package — Monthly Bookkeeping', 1, 250, 250]
  );

  const insertTask = (vals) => pool.query(
    'INSERT INTO tasks (client_id, title, description, status, priority, due_date, is_client_visible) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    vals
  );
  await insertTask([sarah.id, 'Reconcile Q1 accounts', 'Review and reconcile all Q1 bank and credit card accounts.', 'todo', 'high', toDate(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)), 1]);
  await insertTask([maria.id, 'Set up Chart of Accounts', 'Configure chart of accounts for Lopez Bakery onboarding.', 'in_progress', 'high', toDate(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)), 0]);
  await insertTask([dana.id, 'Process April payroll', 'Run payroll for Wright & Associates (4 employees).', 'in_review', 'medium', toDate(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)), 1]);
  await insertTask([null, 'Renew business license', 'Annual business license renewal due end of month.', 'done', 'low', toDate(new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)), 0]);

  const insertTime = (vals) => pool.query(
    'INSERT INTO time_entries (client_id, description, duration_minutes, entry_date) VALUES ($1,$2,$3,$4)',
    vals
  );
  await insertTime([sarah.id, 'Bank reconciliation and transaction categorization', 90, toDate(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000))]);
  await insertTime([maria.id, 'Chart of accounts setup and initial data entry', 120, toDate(new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000))]);
  await insertTime([dana.id, 'Payroll processing — April cycle', 45, toDate(now)]);

  console.log('Seed complete.');
  console.log('Admin login: hiedi@hmvirtualservices.com / changeme123');
  console.log('Client logins: sarah@example.com, maria@example.com, dana@example.com / client123');
  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
