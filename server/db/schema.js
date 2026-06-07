const { pool } = require('./database');
const bcrypt = require('bcryptjs');

async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK(role IN ('admin', 'client')),
      name          TEXT NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clients (
      id                       SERIAL PRIMARY KEY,
      user_id                  INTEGER REFERENCES users(id),
      business_name            TEXT NOT NULL,
      contact_name             TEXT NOT NULL,
      email                    TEXT NOT NULL,
      phone                    TEXT,
      website                  TEXT,
      status                   TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      notes                    TEXT,
      expected_hours_per_month NUMERIC DEFAULT 0,
      package_tier             TEXT NOT NULL CHECK(package_tier IN ('essentials', 'growth', 'scale', 'full_service')),
      package_price            NUMERIC NOT NULL,
      prepay_months            INTEGER DEFAULT 0,
      billing_cycle_start      DATE,
      employee_count           INTEGER DEFAULT 0,
      created_at               TIMESTAMPTZ DEFAULT NOW(),
      updated_at               TIMESTAMPTZ DEFAULT NOW(),
      qbo_customer_id          TEXT,
      va_package_tier          TEXT DEFAULT NULL,
      va_hours_reset_day       INTEGER DEFAULT 1,
      no_bk_package            SMALLINT DEFAULT 0,
      va_package_price         NUMERIC DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS client_addons (
      id            SERIAL PRIMARY KEY,
      client_id     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      addon_type    TEXT NOT NULL CHECK(addon_type IN ('cleanup', 'payroll', 'w2', '1099', 'state_tax', 'priority')),
      quantity      INTEGER DEFAULT 1,
      employee_count INTEGER DEFAULT 0,
      is_active     SMALLINT DEFAULT 1,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id               SERIAL PRIMARY KEY,
      client_id        INTEGER REFERENCES clients(id),
      title            TEXT NOT NULL,
      description      TEXT,
      status           TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'in_review', 'done')),
      priority         TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
      due_date         DATE,
      is_client_visible SMALLINT DEFAULT 0,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW(),
      source           TEXT DEFAULT NULL,
      source_id        TEXT DEFAULT NULL,
      source_archived  SMALLINT DEFAULT 0,
      task_type        TEXT DEFAULT 'bk',
      is_pinned        SMALLINT DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS time_entries (
      id               SERIAL PRIMARY KEY,
      client_id        INTEGER REFERENCES clients(id),
      description      TEXT,
      duration_minutes INTEGER,
      entry_date       DATE NOT NULL,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW(),
      task_type        TEXT DEFAULT 'bk',
      task_id          INTEGER REFERENCES tasks(id),
      start_time       TEXT DEFAULT NULL,
      end_time         TEXT DEFAULT NULL,
      duration_seconds INTEGER DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id                   SERIAL PRIMARY KEY,
      client_id            INTEGER NOT NULL REFERENCES clients(id),
      invoice_number       TEXT UNIQUE NOT NULL,
      status               TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'paid', 'overdue')),
      due_date             DATE,
      subtotal             NUMERIC NOT NULL DEFAULT 0,
      discount_percent     NUMERIC DEFAULT 0,
      discount_amount      NUMERIC DEFAULT 0,
      total                NUMERIC NOT NULL DEFAULT 0,
      client_notes         TEXT,
      internal_notes       TEXT,
      billing_period_start DATE,
      billing_period_end   DATE,
      created_at           TIMESTAMPTZ DEFAULT NOW(),
      updated_at           TIMESTAMPTZ DEFAULT NOW(),
      paid_at              TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS invoice_items (
      id           SERIAL PRIMARY KEY,
      invoice_id   INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      description  TEXT NOT NULL,
      quantity     NUMERIC DEFAULT 1,
      unit_price   NUMERIC NOT NULL,
      total        NUMERIC NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id            SERIAL PRIMARY KEY,
      client_id     INTEGER NOT NULL REFERENCES clients(id),
      uploaded_by   INTEGER NOT NULL REFERENCES users(id),
      filename      TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type     TEXT,
      file_size     INTEGER,
      tag           TEXT DEFAULT 'other' CHECK(tag IN ('contract', 'report', 'receipt', 'tax_document', 'other')),
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS messages (
      id         SERIAL PRIMARY KEY,
      client_id  INTEGER NOT NULL REFERENCES clients(id),
      sender_id  INTEGER NOT NULL REFERENCES users(id),
      content    TEXT NOT NULL,
      is_read    SMALLINT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      id         SERIAL PRIMARY KEY,
      key        TEXT UNIQUE NOT NULL,
      value      TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token      TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS integration_settings (
      id         SERIAL PRIMARY KEY,
      key        TEXT UNIQUE NOT NULL,
      value      TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id            SERIAL PRIMARY KEY,
      provider      TEXT UNIQUE NOT NULL,
      realm_id      TEXT,
      access_token  TEXT,
      refresh_token TEXT,
      expires_at    TIMESTAMPTZ,
      token_data    TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_clients_user_id         ON clients(user_id);
    CREATE INDEX IF NOT EXISTS idx_client_addons_client_id ON client_addons(client_id);
    CREATE INDEX IF NOT EXISTS idx_time_entries_client_id  ON time_entries(client_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_client_id         ON tasks(client_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_client_id      ON invoices(client_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_documents_client_id     ON documents(client_id);
    CREATE INDEX IF NOT EXISTS idx_messages_client_id      ON messages(client_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id  ON refresh_tokens(user_id);
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

  for (const [key, value] of defaultSettings) {
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [key, value]
    );
  }

  const { rows } = await pool.query('SELECT COUNT(*) as count FROM users');
  if (parseInt(rows[0].count) === 0) {
    const initialPassword = process.env.ADMIN_PASSWORD || 'Password123';
    const hash = bcrypt.hashSync(initialPassword, 10);
    await pool.query(
      `INSERT INTO users (email, password_hash, role, name) VALUES ($1, $2, 'admin', $3)`,
      ['hiedi@hmvirtualservices.com', hash, 'Hiedi Moorman']
    );
    console.log('✅ Default admin created: hiedi@hmvirtualservices.com');
  }

  console.log('Schema ready.');
}

module.exports = { createSchema };
