const bcrypt = require('bcryptjs');
const db = require('./database');

// ── Print Shop schema ────────────────────────────────────────────────────────
// Created on every server start; every statement is safe to re-run.
function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS filaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      color_name TEXT NOT NULL,
      color_hex TEXT DEFAULT '#B0B5BC',
      brand TEXT NOT NULL,
      material_type TEXT NOT NULL DEFAULT 'PLA',
      spool_size_kg REAL NOT NULL DEFAULT 1,
      cost_per_kg REAL NOT NULL DEFAULT 0,
      reorder_point_spools REAL NOT NULL DEFAULT 1,
      vendor_name TEXT,
      vendor_url TEXT,
      vendor_sku TEXT,
      sku TEXT UNIQUE,
      barcode TEXT UNIQUE,
      vendor_barcode TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- One row per physical spool, so New / Opened / Ordered is a real count
    CREATE TABLE IF NOT EXISTS filament_spools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filament_id INTEGER NOT NULL REFERENCES filaments(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','opened','empty','ordered')),
      spool_code TEXT UNIQUE,
      grams_remaining REAL,
      purchase_cost REAL,
      purchased_at DATE,
      opened_at DATE,
      emptied_at DATE,
      expected_at DATE,
      order_reference TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      unit TEXT NOT NULL DEFAULT 'each',
      cost_per_unit REAL NOT NULL DEFAULT 0,
      pack_size REAL DEFAULT 1,
      pack_cost REAL,
      qty_on_hand REAL DEFAULT 0,
      qty_on_order REAL DEFAULT 0,
      reorder_point REAL DEFAULT 0,
      vendor_name TEXT,
      vendor_url TEXT,
      vendor_sku TEXT,
      sku TEXT UNIQUE,
      barcode TEXT UNIQUE,
      vendor_barcode TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'product' CHECK(item_type IN ('product','component','tool')),
      category TEXT,
      description TEXT,
      sku TEXT UNIQUE,
      barcode TEXT UNIQUE,
      vendor_barcode TEXT,
      print_time_minutes REAL DEFAULT 0,
      units_per_print REAL DEFAULT 1,
      labor_minutes REAL,
      qty_on_hand REAL DEFAULT 0,
      reorder_point REAL DEFAULT 0,
      purchase_cost REAL,
      cost_override REAL,
      wholesale_override REAL,
      retail_override REAL,
      vendor_name TEXT,
      vendor_url TEXT,
      image_url TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Bill of materials. component_type decides which table ref_id points at.
    -- quantity is grams for filament, units for material, count for item.
    CREATE TABLE IF NOT EXISTS item_components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      component_type TEXT NOT NULL CHECK(component_type IN ('filament','material','item')),
      ref_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      customer_name TEXT,
      customer_email TEXT,
      channel TEXT DEFAULT 'direct',
      order_type TEXT NOT NULL DEFAULT 'retail' CHECK(order_type IN ('retail','wholesale')),
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_production','ready','shipped','completed','cancelled')),
      order_date DATE,
      promised_ship_date DATE,
      shipped_date DATE,
      tracking_number TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES items(id),
      description TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS queue_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES items(id),
      quantity REAL NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','printing','post_processing','done','cancelled')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('rush','normal','low')),
      position INTEGER DEFAULT 0,
      printer TEXT,
      filament_id INTEGER REFERENCES filaments(id),
      estimated_minutes REAL,
      started_at DATETIME,
      completed_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- What a print job needs gathered, and what has been gathered so far.
    -- Written once when the pick list is first built, so the tick marks
    -- survive the screen going to sleep mid-collection.
    CREATE TABLE IF NOT EXISTS queue_picks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      queue_id INTEGER NOT NULL REFERENCES queue_jobs(id) ON DELETE CASCADE,
      line_type TEXT NOT NULL CHECK(line_type IN ('filament','material','item')),
      ref_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit TEXT,
      spool_id INTEGER REFERENCES filament_spools(id),
      picked INTEGER NOT NULL DEFAULT 0,
      picked_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Third-party settings and credentials. Kept out of the general settings
    -- table because that one is returned wholesale to the browser.
    CREATE TABLE IF NOT EXISTS integrations (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      kind TEXT NOT NULL,
      ok INTEGER NOT NULL DEFAULT 0,
      summary TEXT,
      error TEXT,
      started_at DATETIME,
      finished_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stock_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('filament','material','item')),
      entity_id INTEGER NOT NULL,
      change REAL NOT NULL DEFAULT 0,
      unit TEXT,
      reason TEXT,
      reference TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_spools_filament ON filament_spools(filament_id);
    CREATE INDEX IF NOT EXISTS idx_components_item ON item_components(item_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_queue_jobs_order ON queue_jobs(order_id);
    CREATE INDEX IF NOT EXISTS idx_queue_jobs_status ON queue_jobs(status);
    CREATE INDEX IF NOT EXISTS idx_stock_log_entity ON stock_log(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_queue_picks_queue ON queue_picks(queue_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
  `);

  const defaults = [
    ['shop_name', 'Print Shop'],
    ['sku_prefix', 'PS'],
    // Costing inputs
    ['machine_rate_per_hour', '1.50'],
    ['labor_rate_per_hour', '25.00'],
    ['default_labor_minutes', '10'],
    ['failure_rate_percent', '8'],
    ['overhead_percent', '10'],
    ['packaging_cost', '0.75'],
    // Pricing rules
    ['wholesale_markup_percent', '100'],
    ['retail_multiplier', '2'],
    ['price_rounding', '0.25'],
    // Production planning
    ['turnaround_min_days', '5'],
    ['turnaround_max_days', '7'],
    ['print_hours_per_day', '18'],
    ['finishing_days', '1'],
    ['printer_count', '1'],
  ];
  const insert = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of defaults) insert.run(key, value);

  // Additive columns (safe to run repeatedly)
  const alterations = [
    'ALTER TABLE items ADD COLUMN lead_time_days INTEGER DEFAULT 0',
    'ALTER TABLE orders ADD COLUMN shipping_total REAL DEFAULT 0',
    // Shopify links. Kept as text: Shopify ids are GIDs, not numbers.
    'ALTER TABLE items ADD COLUMN shopify_product_id TEXT',
    'ALTER TABLE items ADD COLUMN shopify_variant_id TEXT',
    'ALTER TABLE items ADD COLUMN shopify_inventory_item_id TEXT',
    'ALTER TABLE orders ADD COLUMN shopify_order_id TEXT',
    'ALTER TABLE order_items ADD COLUMN shopify_line_item_id TEXT',
    // What a print run is for, which decides where the finished units go.
    "ALTER TABLE queue_jobs ADD COLUMN purpose TEXT DEFAULT NULL",
  ];
  for (const sql of alterations) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }

  // Indexes over the columns added above, once they are guaranteed to exist.
  for (const sql of [
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_shopify ON orders(shopify_order_id) WHERE shopify_order_id IS NOT NULL',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_items_shopify_variant ON items(shopify_variant_id) WHERE shopify_variant_id IS NOT NULL',
  ]) {
    try { db.exec(sql); } catch { /* index already there */ }
  }

  // First boot on a fresh database creates the single shop account.
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount === 0) {
    const email = (process.env.ADMIN_EMAIL || 'owner@printshop.local').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'changeme123';
    db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
      .run(email, bcrypt.hashSync(password, 10), process.env.ADMIN_NAME || 'Shop Owner');
    console.log(`Created the shop account: ${email}`);
    if (!process.env.ADMIN_PASSWORD) {
      console.log('Password is "changeme123" — change it from Settings after signing in.');
    }
  }
}

createSchema();
module.exports = { createSchema };
