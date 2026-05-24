require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
require('./schema');
const db = require('./database');
const bcrypt = require('bcryptjs');

function seed() {
  db.exec('DELETE FROM refresh_tokens');
  db.exec('DELETE FROM messages');
  db.exec('DELETE FROM documents');
  db.exec('DELETE FROM invoice_items');
  db.exec('DELETE FROM invoices');
  db.exec('DELETE FROM tasks');
  db.exec('DELETE FROM time_entries');
  db.exec('DELETE FROM client_addons');
  db.exec('DELETE FROM clients');
  db.exec('DELETE FROM users');

  const adminHash = bcrypt.hashSync('changeme123', 10);
  const clientHash = bcrypt.hashSync('client123', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, ?, ?)
  `);

  const adminId = insertUser.run('hiedi@hmvirtualservices.com', adminHash, 'admin', 'Hiedi Moorman').lastInsertRowid;
  const sarahUserId = insertUser.run('sarah@example.com', clientHash, 'client', 'Sarah Chen').lastInsertRowid;
  const mariaUserId = insertUser.run('maria@example.com', clientHash, 'client', 'Maria Lopez').lastInsertRowid;
  const danaUserId = insertUser.run('dana@example.com', clientHash, 'client', 'Dana Wright').lastInsertRowid;

  const insertClient = db.prepare(`
    INSERT INTO clients (user_id, business_name, contact_name, email, phone, website, status, notes, expected_hours_per_month, package_tier, package_price, prepay_months, billing_cycle_start, employee_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sarahId = insertClient.run(
    sarahUserId, 'Chen Consulting LLC', 'Sarah Chen', 'sarah@example.com', '(555) 201-3456', 'chenconsulting.com',
    'active', 'Prefers email communication. Books call on Fridays.', 12, 'scale', 500, 0, '2026-01-01', 0
  ).lastInsertRowid;

  const mariaId = insertClient.run(
    mariaUserId, 'Lopez Bakery', 'Maria Lopez', 'maria@example.com', '(555) 348-7890', '',
    'active', 'New client — onboarded March 2026.', 6, 'essentials', 250, 0, '2026-03-01', 0
  ).lastInsertRowid;

  const danaId = insertClient.run(
    danaUserId, 'Wright & Associates', 'Dana Wright', 'dana@example.com', '(555) 467-2211', 'wrightassociates.net',
    'active', 'Has 4 employees on payroll. Quarterly tax filings.', 10, 'growth', 350, 0, '2026-02-01', 4
  ).lastInsertRowid;

  const insertAddon = db.prepare(`
    INSERT INTO client_addons (client_id, addon_type, quantity, employee_count, is_active) VALUES (?, ?, ?, ?, 1)
  `);

  insertAddon.run(sarahId, 'priority', 1, 0);
  insertAddon.run(danaId, 'payroll', 1, 4);

  // Invoices
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const dueIn5Days = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  const paidDate = new Date(now.getFullYear(), now.getMonth(), 10);

  const toDate = (d) => d.toISOString().split('T')[0];

  const insertInvoice = db.prepare(`
    INSERT INTO invoices (client_id, invoice_number, status, due_date, subtotal, discount_percent, discount_amount, total, client_notes, billing_period_start, billing_period_end, paid_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sarahInvoiceId = insertInvoice.run(
    sarahId, 'HM-2026-001', 'paid',
    toDate(new Date(now.getFullYear(), now.getMonth(), 15)),
    600, 0, 0, 600,
    'Thank you for your continued business!',
    toDate(lastMonth), toDate(lastMonthEnd),
    toDate(paidDate)
  ).lastInsertRowid;

  const mariaInvoiceId = insertInvoice.run(
    mariaId, 'HM-2026-002', 'sent',
    toDate(dueIn5Days),
    250, 0, 0, 250,
    'Please remit payment by the due date. Thank you!',
    toDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    toDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    null
  ).lastInsertRowid;

  const insertItem = db.prepare(`
    INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)
  `);

  insertItem.run(sarahInvoiceId, 'Scale Package — Monthly Bookkeeping', 1, 500, 500);
  insertItem.run(sarahInvoiceId, 'Priority Services Add-on', 1, 100, 100);
  insertItem.run(mariaInvoiceId, 'Essentials Package — Monthly Bookkeeping', 1, 250, 250);

  // Tasks
  const insertTask = db.prepare(`
    INSERT INTO tasks (client_id, title, description, status, priority, due_date, is_client_visible) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertTask.run(sarahId, 'Reconcile Q1 accounts', 'Review and reconcile all Q1 bank and credit card accounts.', 'todo', 'high', toDate(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)), 1);
  insertTask.run(mariaId, 'Set up Chart of Accounts', 'Configure chart of accounts for Lopez Bakery onboarding.', 'in_progress', 'high', toDate(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)), 0);
  insertTask.run(danaId, 'Process April payroll', 'Run payroll for Wright & Associates (4 employees).', 'in_review', 'medium', toDate(new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)), 1);
  insertTask.run(null, 'Renew business license', 'Annual business license renewal due end of month.', 'done', 'low', toDate(new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)), 0);

  // Time entries
  const insertTime = db.prepare(`
    INSERT INTO time_entries (client_id, description, duration_minutes, entry_date) VALUES (?, ?, ?, ?)
  `);

  insertTime.run(sarahId, 'Bank reconciliation and transaction categorization', 90, toDate(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)));
  insertTime.run(mariaId, 'Chart of accounts setup and initial data entry', 120, toDate(new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)));
  insertTime.run(danaId, 'Payroll processing — April cycle', 45, toDate(now));

  console.log('Seed complete.');
  console.log('Admin login: hiedi@hmvirtualservices.com / changeme123');
  console.log('Client logins: sarah@example.com, maria@example.com, dana@example.com / client123');
}

seed();
