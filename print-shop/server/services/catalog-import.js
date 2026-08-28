const db = require('../db/database');
const { readTable } = require('../utils/csv');
const { nextSku, defaultBarcode } = require('../utils/sku');
const { salesChannels } = require('../utils/costing');

// Wide enough for a Shopify products export and a hand-made list alike.
const ALIASES = {
  name: ['title', 'name', 'product name', 'product'],
  category: ['type', 'product type', 'category'],
  sku: ['variant sku', 'sku'],
  barcode: ['variant barcode', 'barcode', 'upc', 'ean'],
  price: ['variant price', 'price', 'retail price', 'variant compare at price'],
  cost: ['cost per item', 'cost', 'unit cost'],
  description: ['body html', 'description', 'body'],
  vendor_name: ['vendor', 'brand', 'supplier'],
  qty_on_hand: ['variant inventory qty', 'inventory qty', 'quantity', 'on hand', 'qty'],
  image_url: ['image src', 'image', 'image url'],
  print_time_minutes: ['print time minutes', 'print time', 'print minutes'],
  labor_minutes: ['finishing minutes', 'labor minutes', 'labour minutes'],
  handle: ['handle'],
  status: ['status', 'published'],
};

/**
 * Spreadsheets prefix a value with an apostrophe to stop it being read as a
 * number. That belongs to the spreadsheet, not to the barcode.
 */
function cleanCode(value) {
  return String(value || '').trim().replace(/^'+/, '').trim();
}

/** Shopify writes descriptions as HTML; the app shows plain text. */
function plainText(html, limit = 600) {
  // Entities are decoded first: a description containing &lt;/p&gt; would
  // otherwise come out as a literal tag, having been decoded after stripping.
  const decoded = String(html || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');

  const text = decoded
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Read a product list without writing anything.
 *
 * `itemType` and `category` come from the import screen: a whole file is
 * usually one kind of thing, and saying so once beats editing the spreadsheet.
 * A blank category falls back to whatever the file calls the row's type.
 */
function planImport(csvText, { itemType = 'product', category = '' } = {}) {
  const { rows, unmapped, headers } = readTable(csvText, ALIASES);
  const plan = { headers, unmapped, create: [], update: [], unchanged: [], skipped: [], item_type: itemType };
  const seenSku = new Set();
  const seenName = new Set();

  for (const row of rows) {
    // A products export repeats a row per extra image, with no title on it.
    if (!row.name) {
      if (row.image_url || row.handle) continue;
      plan.skipped.push({ line: row._line, label: '(blank row)', reason: 'no product name' });
      continue;
    }

    const sku = cleanCode(row.sku);
    const barcode = cleanCode(row.barcode);
    const nameKey = row.name.trim().toLowerCase();

    if (seenName.has(nameKey) || (sku && seenSku.has(sku))) {
      plan.skipped.push({ line: row._line, label: row.name, reason: 'appears twice in this file' });
      continue;
    }
    seenName.add(nameKey);
    if (sku) seenSku.add(sku);

    const existing = (sku && db.prepare('SELECT * FROM items WHERE sku = ?').get(sku))
      || db.prepare('SELECT * FROM items WHERE LOWER(TRIM(name)) = ?').get(nameKey);

    if (existing) {
      const changes = [];
      // Only fill gaps; anything already recorded here was put there on purpose.
      for (const [field, value] of [
        ['category', category || row.category],
        ['description', row.description ? plainText(row.description) : null],
        ['vendor_name', row.vendor_name],
        ['image_url', row.image_url],
        ['barcode', barcode],
      ]) {
        if (value && !existing[field]) changes.push({ field, label: field.replace(/_/g, ' '), to: value });
      }
      const entry = { line: row._line, id: existing.id, label: existing.name, sku: existing.sku, changes };
      if (changes.length) plan.update.push(entry); else plan.unchanged.push(entry);
      continue;
    }

    const price = toNumber(row.price);
    const qty = toNumber(row.qty_on_hand);

    plan.create.push({
      line: row._line,
      label: row.name,
      sku_from_file: sku || null,
      values: {
        name: row.name,
        item_type: itemType,
        category: category || row.category || null,
        description: row.description ? plainText(row.description) : null,
        vendor_name: row.vendor_name || null,
        image_url: row.image_url || null,
        barcode: barcode || null,
        // Blank means she is counting it herself.
        qty_on_hand: qty && qty > 0 ? qty : 0,
        purchase_cost: toNumber(row.cost),
        print_time_minutes: toNumber(row.print_time_minutes) ?? 0,
        labor_minutes: toNumber(row.labor_minutes),
        is_active: String(row.status || 'active').toLowerCase() === 'draft' ? 0 : 1,
      },
      price,
    });
  }

  return plan;
}

/** Carry out a plan. Everything lands, or nothing does. */
function applyImport(csvText, options = {}) {
  const plan = planImport(csvText, options);
  const done = { created: [], updated: [], failed: [] };
  const channels = salesChannels();
  const shopifyChannel = channels.find((c) => c.toLowerCase() === 'shopify') || channels[0];

  const takenBarcode = db.prepare('SELECT 1 FROM items WHERE barcode = ?');

  const run = db.transaction(() => {
    for (const entry of plan.create) {
      const v = entry.values;
      // One SKU scheme across the shop. A code the file carried is a barcode —
      // an ISBN is a barcode, not a reason to break the numbering.
      const sku = nextSku('items', v.item_type);
      const fromFile = v.barcode || entry.sku_from_file;
      const barcode = fromFile && !takenBarcode.get(fromFile) ? fromFile : defaultBarcode(sku);

      try {
        const id = db.prepare(`
          INSERT INTO items
            (name, item_type, category, description, sku, barcode, vendor_name, image_url,
             qty_on_hand, purchase_cost, print_time_minutes, labor_minutes, is_active, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          v.name, v.item_type, v.category, v.description, sku, barcode, v.vendor_name, v.image_url,
          v.qty_on_hand, v.purchase_cost, v.print_time_minutes, v.labor_minutes, v.is_active,
          'Imported. Add its filament, materials and print time to get costing.'
        ).lastInsertRowid;

        // The price in a shop's export is that shop's price.
        if (entry.price != null && shopifyChannel) {
          db.prepare('INSERT INTO item_channel_prices (item_id, channel, price) VALUES (?, ?, ?)')
            .run(id, shopifyChannel, entry.price);
        }

        done.created.push({ label: v.name, sku, barcode, price: entry.price });
      } catch (err) {
        done.failed.push({
          label: v.name,
          reason: String(err.message).includes('UNIQUE') ? 'that SKU or barcode is already used' : err.message,
        });
      }
    }

    for (const entry of plan.update) {
      const fields = entry.changes.map((c) => `${c.field} = ?`).join(', ');
      db.prepare(`UPDATE items SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(...entry.changes.map((c) => c.to), entry.id);
      done.updated.push({ label: entry.label, changed: entry.changes.map((c) => c.label) });
    }
  });
  run();

  return { ...done, unchanged: plan.unchanged.length, skipped: plan.skipped, unmapped: plan.unmapped };
}

module.exports = { planImport, applyImport, plainText, cleanCode, ALIASES };
