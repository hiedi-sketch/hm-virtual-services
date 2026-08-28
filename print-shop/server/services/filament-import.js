const db = require('../db/database');
const { readTable } = require('../utils/csv');
const { nextSku, nextSpoolCode, defaultBarcode } = require('../utils/sku');
const { normalise, isKnown, kindOf } = require('../utils/locations');

// The column names a filament list tends to arrive with.
const ALIASES = {
  color_name: ['color name', 'colour name', 'color', 'colour', 'name'],
  brand: ['brand', 'manufacturer', 'maker'],
  material_type: ['type', 'material', 'material type', 'filament type'],
  color_hex: ['swatch', 'hex', 'color hex', 'colour hex', 'hex code'],
  spool_size_kg: ['spool size kg', 'spool size', 'size kg', 'weight kg'],
  cost_per_kg: ['current cost per kg', 'cost per kg', 'price per kg', 'cost', 'price'],
  reorder_point_spools: ['reorder when below spools', 'reorder point', 'reorder when below', 'reorder at'],
  initial_spools: ['spools on hand now', 'spools on hand', 'on hand', 'quantity', 'qty'],
  location: ['where they go', 'location', 'slot', 'shelf'],
  vendor_name: ['vendor', 'vendor name', 'supplier', 'seller'],
  vendor_url: ['reorder link', 'vendor url', 'link', 'url', 'product link'],
  vendor_barcode: ['barcode', 'upc', 'ean', 'vendor barcode'],
  notes: ['notes', 'note'],
};

const HEX = /^#?[0-9a-f]{6}$/i;

function tidyHex(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!HEX.test(text)) return null;
  return (text.startsWith('#') ? text : `#${text}`).toUpperCase();
}

function toNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Same colour, same brand, same material — ignoring case and stray spaces. */
function findExisting(row) {
  return db.prepare(`
    SELECT * FROM filaments
     WHERE LOWER(TRIM(color_name)) = LOWER(TRIM(?))
       AND LOWER(TRIM(brand)) = LOWER(TRIM(?))
       AND LOWER(TRIM(material_type)) = LOWER(TRIM(?))
  `).get(row.color_name, row.brand, row.material_type || 'PLA');
}

/**
 * Work out what a CSV would do without doing it.
 *
 * An existing colour has its swatch and price brought up to date — those are
 * the two that go stale — and any field that is simply blank here gets filled
 * in. Anything already filled in is left alone: the library is the place
 * things have been corrected by hand, and a spreadsheet should not undo that.
 */
function planImport(csvText) {
  const { rows, unmapped, headers } = readTable(csvText, ALIASES);

  const plan = { headers, unmapped, create: [], update: [], unchanged: [], skipped: [] };
  const seen = new Set();

  for (const row of rows) {
    if (!row.color_name || !row.brand) {
      plan.skipped.push({ line: row._line, label: row.color_name || row.brand || '(blank row)', reason: 'needs a colour and a brand' });
      continue;
    }

    const materialType = row.material_type || 'PLA';
    const key = `${row.color_name}|${row.brand}|${materialType}`.toLowerCase();
    if (seen.has(key)) {
      plan.skipped.push({ line: row._line, label: `${row.brand} ${row.color_name}`, reason: 'appears twice in this file' });
      continue;
    }
    seen.add(key);

    const hex = tidyHex(row.color_hex);
    if (row.color_hex && !hex) {
      plan.skipped.push({ line: row._line, label: `${row.brand} ${row.color_name}`, reason: `"${row.color_hex}" is not a hex colour` });
      continue;
    }

    const location = normalise(row.location);
    if (location && !isKnown(location)) {
      plan.skipped.push({ line: row._line, label: `${row.brand} ${row.color_name}`, reason: `there is no location called ${location}` });
      continue;
    }

    const cost = toNumber(row.cost_per_kg);
    const existing = findExisting({ ...row, material_type: materialType });

    if (existing) {
      const changes = [];
      if (hex && hex !== (existing.color_hex || '').toUpperCase()) {
        changes.push({ field: 'color_hex', label: 'swatch', from: existing.color_hex, to: hex });
      }
      if (cost != null && cost !== existing.cost_per_kg) {
        changes.push({ field: 'cost_per_kg', label: 'cost per kg', from: existing.cost_per_kg, to: cost });
      }
      // Fill gaps, never overwrite something already recorded.
      for (const [field, raw] of [
        ['vendor_name', row.vendor_name],
        ['vendor_url', row.vendor_url],
        ['vendor_barcode', row.vendor_barcode],
        ['notes', row.notes],
      ]) {
        if (raw && !existing[field]) changes.push({ field, label: field.replace(/_/g, ' '), from: null, to: raw });
      }

      const entry = {
        line: row._line,
        id: existing.id,
        label: `${existing.brand} ${existing.material_type} — ${existing.color_name}`,
        sku: existing.sku,
        changes,
      };
      if (changes.length) plan.update.push(entry);
      else plan.unchanged.push(entry);
      continue;
    }

    plan.create.push({
      line: row._line,
      label: `${row.brand} ${materialType} — ${row.color_name}`,
      values: {
        color_name: row.color_name,
        brand: row.brand,
        material_type: materialType,
        color_hex: hex || '#B0B5BC',
        spool_size_kg: toNumber(row.spool_size_kg) ?? 1,
        cost_per_kg: cost ?? 0,
        reorder_point_spools: toNumber(row.reorder_point_spools) ?? 1,
        vendor_name: row.vendor_name || null,
        vendor_url: row.vendor_url || null,
        vendor_barcode: row.vendor_barcode || null,
        notes: row.notes || null,
      },
      // Blank means "I will count these myself", so no spools are invented.
      spools: Math.max(0, Math.floor(toNumber(row.initial_spools) ?? 0)),
      location,
    });
  }

  return plan;
}

/** Carry out a plan. Everything lands, or nothing does. */
function applyImport(csvText) {
  const plan = planImport(csvText);
  const done = { created: [], updated: [], failed: [] };

  const run = db.transaction(() => {
    for (const entry of plan.create) {
      const sku = nextSku('filaments', 'filament');
      const v = entry.values;
      try {
        const id = db.prepare(`
          INSERT INTO filaments
            (color_name, color_hex, brand, material_type, spool_size_kg, cost_per_kg,
             reorder_point_spools, vendor_name, vendor_url, vendor_barcode, sku, barcode, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          v.color_name, v.color_hex, v.brand, v.material_type, v.spool_size_kg, v.cost_per_kg,
          v.reorder_point_spools, v.vendor_name, v.vendor_url, v.vendor_barcode,
          sku, defaultBarcode(sku), v.notes
        ).lastInsertRowid;

        for (let i = 0; i < entry.spools; i += 1) {
          const spoolId = db.prepare(`
            INSERT INTO filament_spools (filament_id, status, spool_code, purchase_cost, purchased_at)
            VALUES (?, 'new', ?, ?, DATE('now'))
          `).run(id, nextSpoolCode(), v.cost_per_kg * v.spool_size_kg).lastInsertRowid;

          // A shelf slot takes the batch; a bay takes the first only.
          const kind = entry.location ? kindOf(entry.location) : null;
          if (entry.location && (kind === 'shelf' || i === 0)) {
            db.prepare('UPDATE filament_spools SET location = ?, location_kind = ? WHERE id = ?')
              .run(entry.location, kind, spoolId);
          }
        }
        done.created.push({ label: entry.label, sku, spools: entry.spools });
      } catch (err) {
        done.failed.push({ label: entry.label, reason: String(err.message).includes('UNIQUE') ? 'that SKU or barcode is already used' : err.message });
      }
    }

    for (const entry of plan.update) {
      const fields = entry.changes.map((c) => `${c.field} = ?`).join(', ');
      db.prepare(`UPDATE filaments SET ${fields}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(...entry.changes.map((c) => c.to), entry.id);
      done.updated.push({ label: entry.label, changed: entry.changes.map((c) => c.label) });
    }
  });
  run();

  return { ...done, unchanged: plan.unchanged.length, skipped: plan.skipped, unmapped: plan.unmapped };
}

module.exports = { planImport, applyImport, ALIASES };
