const db = require('../db/database');

const TYPE_CODES = {
  product: 'PRD',
  component: 'CMP',
  tool: 'TL',
  filament: 'FIL',
  material: 'MAT',
};

function skuPrefix() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'sku_prefix'").get();
  const prefix = (row?.value || 'HM').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return prefix || 'HM';
}

/**
 * Next free SKU of the form PREFIX-TYPE-0001. Scans existing SKUs in the
 * table rather than keeping a counter, so hand-edited SKUs never collide.
 */
function nextSku(table, kind) {
  const prefix = skuPrefix();
  const code = TYPE_CODES[kind] || 'GEN';
  const stem = `${prefix}-${code}-`;
  const rows = db.prepare(`SELECT sku FROM ${table} WHERE sku LIKE ?`).all(`${stem}%`);

  let max = 0;
  for (const { sku } of rows) {
    const n = parseInt(String(sku).slice(stem.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }

  let seq = max + 1;
  const exists = db.prepare(`SELECT 1 FROM ${table} WHERE sku = ?`);
  let candidate = `${stem}${String(seq).padStart(4, '0')}`;
  while (exists.get(candidate)) {
    seq += 1;
    candidate = `${stem}${String(seq).padStart(4, '0')}`;
  }
  return candidate;
}

/** Per-spool scan tag, e.g. SPL-000042. */
function nextSpoolCode() {
  const rows = db
    .prepare("SELECT spool_code FROM filament_spools WHERE spool_code LIKE 'SPL-%'")
    .all();
  let max = 0;
  for (const { spool_code } of rows) {
    const n = parseInt(String(spool_code).slice(4), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  let seq = max + 1;
  const exists = db.prepare('SELECT 1 FROM filament_spools WHERE spool_code = ?');
  let candidate = `SPL-${String(seq).padStart(6, '0')}`;
  while (exists.get(candidate)) {
    seq += 1;
    candidate = `SPL-${String(seq).padStart(6, '0')}`;
  }
  return candidate;
}

function nextOrderNumber() {
  const rows = db.prepare("SELECT order_number FROM orders WHERE order_number LIKE 'PO-%'").all();
  let max = 0;
  for (const { order_number } of rows) {
    const n = parseInt(String(order_number).slice(3), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `PO-${String(max + 1).padStart(5, '0')}`;
}

/**
 * Barcodes are Code 128 payloads printed straight onto shelf labels, so the
 * SKU doubles as the scan code unless a vendor barcode is supplied instead.
 */
function defaultBarcode(sku) {
  return sku;
}

module.exports = { TYPE_CODES, skuPrefix, nextSku, nextSpoolCode, nextOrderNumber, defaultBarcode };
