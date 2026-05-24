const db = require('./database');

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'client')),
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      business_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      website TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      notes TEXT,
      expected_hours_per_month REAL DEFAULT 0,
      package_tier TEXT NOT NULL CHECK(package_tier IN ('essentials', 'growth', 'scale', 'full_service')),
      package_price REAL NOT NULL,
      prepay_months INTEGER DEFAULT 0,
      billing_cycle_start DATE,
      employee_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS client_addons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      addon_type TEXT NOT NULL CHECK(addon_type IN ('cleanup', 'payroll', 'w2', '1099', 'state_tax', 'priority')),
      quantity INTEGER DEFAULT 1,
      employee_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id),
      description TEXT,
      duration_minutes INTEGER NOT NULL,
      entry_date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'in_review', 'done')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
      due_date DATE,
      is_client_visible INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      invoice_number TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'paid', 'overdue')),
      due_date DATE,
      subtotal REAL NOT NULL DEFAULT 0,
      discount_percent REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      client_notes TEXT,
      internal_notes TEXT,
      billing_period_start DATE,
      billing_period_end DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity REAL DEFAULT 1,
      unit_price REAL NOT NULL,
      total REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER,
      tag TEXT DEFAULT 'other' CHECK(tag IN ('contract', 'report', 'receipt', 'tax_document', 'other')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      sender_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
    CREATE INDEX IF NOT EXISTS idx_client_addons_client_id ON client_addons(client_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_client_id ON time_entries(client_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_client_id ON tasks(client_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id);
    CREATE INDEX IF NOT EXISTS idx_messages_client_id ON messages(client_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
  `);

  const defaultSettings = [
    ['business_name', 'HM Virtual Services'],
    ['business_logo', ''],
    ['business_address', ''],
    ['business_email', 'hiedi@hmvirtualservices.com'],
    ['business_phone', ''],
    ['payment_terms', 'Net 15'],
    ['hourly_cost_rate', '75'],
    ['active_clients_goal', '10'],
    ['mrr_goal', '5000'],
  ];

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);
  for (const [key, value] of defaultSettings) {
    insertSetting.run(key, value);
  }

  // Phase 2 tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS integration_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT UNIQUE NOT NULL,
      realm_id TEXT,
      access_token TEXT,
      refresh_token TEXT,
      expires_at DATETIME,
      token_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Add Phase 2 columns to existing tables (safe to run repeatedly)
  const alterations = [
    'ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT NULL',
    'ALTER TABLE tasks ADD COLUMN source_id TEXT DEFAULT NULL',
    'ALTER TABLE tasks ADD COLUMN source_archived INTEGER DEFAULT 0',
    'ALTER TABLE clients ADD COLUMN qbo_customer_id TEXT',
    'ALTER TABLE clients ADD COLUMN va_package_tier TEXT DEFAULT NULL',
    'ALTER TABLE clients ADD COLUMN va_hours_reset_day INTEGER DEFAULT 1',
    'ALTER TABLE time_entries ADD COLUMN task_type TEXT DEFAULT \'bk\'',
    'ALTER TABLE time_entries ADD COLUMN task_id INTEGER REFERENCES tasks(id)',
    'ALTER TABLE time_entries ADD COLUMN start_time TEXT DEFAULT NULL',
    'ALTER TABLE time_entries ADD COLUMN end_time TEXT DEFAULT NULL',
    'ALTER TABLE time_entries ADD COLUMN duration_seconds INTEGER DEFAULT NULL',
    'ALTER TABLE clients ADD COLUMN no_bk_package INTEGER DEFAULT 0',
    'ALTER TABLE clients ADD COLUMN va_package_price REAL DEFAULT NULL',
    'ALTER TABLE tasks ADD COLUMN task_type TEXT DEFAULT \'bk\'',
    'ALTER TABLE tasks ADD COLUMN is_pinned INTEGER DEFAULT 0',
  ];
  for (const sql of alterations) {
    try { db.exec(sql); } catch {}
  }

  console.log('Schema created successfully');
}

createSchema();
module.exports = { createSchema };
