const db = require('./database');

// ── 3D Print Shop schema ─────────────────────────────────────────────────────
// All tables are prefixed `print_` so they live alongside the bookkeeping
// tables without colliding with them.
function createPrintSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS print_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS print_filaments (
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
    CREATE TABLE IF NOT EXISTS print_filament_spools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filament_id INTEGER NOT NULL REFERENCES print_filaments(id) ON DELETE CASCADE,
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

    CREATE TABLE IF NOT EXISTS print_materials (
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

    CREATE TABLE IF NOT EXISTS print_items (
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
    CREATE TABLE IF NOT EXISTS print_item_components (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES print_items(id) ON DELETE CASCADE,
      component_type TEXT NOT NULL CHECK(component_type IN ('filament','material','item')),
      ref_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS print_orders (
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

    CREATE TABLE IF NOT EXISTS print_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES print_orders(id) ON DELETE CASCADE,
      item_id INTEGER REFERENCES print_items(id),
      description TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS print_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER REFERENCES print_orders(id) ON DELETE CASCADE,
      order_item_id INTEGER REFERENCES print_order_items(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES print_items(id),
      quantity REAL NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','printing','post_processing','done','cancelled')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('rush','normal','low')),
      position INTEGER DEFAULT 0,
      printer TEXT,
      filament_id INTEGER REFERENCES print_filaments(id),
      estimated_minutes REAL,
      started_at DATETIME,
      completed_at DATETIME,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS print_stock_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('filament','material','item')),
      entity_id INTEGER NOT NULL,
      change REAL NOT NULL DEFAULT 0,
      unit TEXT,
      reason TEXT,
      reference TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_print_spools_filament ON print_filament_spools(filament_id);
    CREATE INDEX IF NOT EXISTS idx_print_components_item ON print_item_components(item_id);
    CREATE INDEX IF NOT EXISTS idx_print_order_items_order ON print_order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_print_queue_order ON print_queue(order_id);
    CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status);
    CREATE INDEX IF NOT EXISTS idx_print_stock_log_entity ON print_stock_log(entity_type, entity_id);
  `);

  const defaults = [
    ['shop_name', 'Print Shop'],
    ['sku_prefix', 'HM'],
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
  const insert = db.prepare('INSERT OR IGNORE INTO print_settings (key, value) VALUES (?, ?)');
  for (const [key, value] of defaults) insert.run(key, value);

  // Additive columns (safe to run repeatedly)
  const alterations = [
    'ALTER TABLE print_items ADD COLUMN lead_time_days INTEGER DEFAULT 0',
    'ALTER TABLE print_orders ADD COLUMN shipping_total REAL DEFAULT 0',
  ];
  for (const sql of alterations) {
    try { db.exec(sql); } catch { /* column already exists */ }
  }
}

createPrintSchema();
module.exports = { createPrintSchema };
