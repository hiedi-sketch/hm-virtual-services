const db = require('../db/database');
const { filamentDemandForItem, materialDemandForItem, round2 } = require('./costing');

/**
 * What a job needs gathered before the printer starts.
 *
 * A component listed in an item's recipe can either be pulled off the shelf or
 * printed as part of this job. Anything already made gets pulled — reprinting
 * parts you have is waste — and only the shortfall is printed, so the filament
 * and material figures here cover what is actually going through the machine.
 */

/** Components of an item, without walking into sub-recipes. */
function directDemand(itemId) {
  const rows = db.prepare('SELECT * FROM item_components WHERE item_id = ?').all(itemId);
  const filament = {};
  const materials = {};
  for (const c of rows) {
    if (c.component_type === 'filament') {
      filament[c.ref_id] = (filament[c.ref_id] || 0) + (c.quantity || 0);
    } else if (c.component_type === 'material') {
      materials[c.ref_id] = (materials[c.ref_id] || 0) + (c.quantity || 0);
    }
  }
  return { filament, materials };
}

/** Which spools to take the grams off, oldest open one first. */
function suggestSpools(filamentId, grams) {
  const filament = db.prepare('SELECT * FROM filaments WHERE id = ?').get(filamentId);
  if (!filament) return [];
  const fullGrams = (filament.spool_size_kg || 1) * 1000;

  const opened = db.prepare(`
    SELECT * FROM filament_spools
     WHERE filament_id = ? AND status = 'opened' AND IFNULL(grams_remaining, 0) > 0
     ORDER BY opened_at, id
  `).all(filamentId);
  const sealed = db.prepare(
    "SELECT * FROM filament_spools WHERE filament_id = ? AND status = 'new' ORDER BY id"
  ).all(filamentId);

  const plan = [];
  let remaining = grams;
  for (const spool of [...opened, ...sealed]) {
    if (remaining <= 0) break;
    const available = spool.status === 'new' ? fullGrams : spool.grams_remaining;
    const take = Math.min(remaining, available);
    plan.push({
      spool_id: spool.id,
      spool_code: spool.spool_code,
      status: spool.status,
      grams_available: round2(available),
      grams_to_take: round2(take),
      needs_opening: spool.status === 'new',
    });
    remaining -= take;
  }
  return plan;
}

/**
 * Work out the lines for a job. Pure calculation — nothing is written here.
 */
function planPicks(entry) {
  const quantity = entry.quantity || 0;
  const components = db
    .prepare('SELECT * FROM item_components WHERE item_id = ?')
    .all(entry.item_id);

  const itemLines = [];
  const printedSubs = [];

  for (const c of components) {
    if (c.component_type !== 'item') continue;
    const sub = db.prepare('SELECT * FROM items WHERE id = ?').get(c.ref_id);
    if (!sub) continue;

    const needed = (c.quantity || 0) * quantity;
    const pull = Math.min(needed, Math.max(0, sub.qty_on_hand || 0));
    const toPrint = needed - pull;

    if (pull > 0) {
      itemLines.push({ line_type: 'item', ref_id: sub.id, quantity: round2(pull), unit: 'each' });
    }
    if (toPrint > 0) printedSubs.push({ itemId: sub.id, quantity: toPrint });
  }

  // Filament and materials: this item's own recipe, plus everything needed to
  // print the components that were not covered from stock.
  const direct = directDemand(entry.item_id);
  const filamentTotals = {};
  const materialTotals = {};

  for (const [id, grams] of Object.entries(direct.filament)) {
    filamentTotals[id] = (filamentTotals[id] || 0) + grams * quantity;
  }
  for (const [id, amount] of Object.entries(direct.materials)) {
    materialTotals[id] = (materialTotals[id] || 0) + amount * quantity;
  }
  for (const sub of printedSubs) {
    for (const [id, grams] of Object.entries(filamentDemandForItem(sub.itemId))) {
      filamentTotals[id] = (filamentTotals[id] || 0) + grams * sub.quantity;
    }
    for (const [id, amount] of Object.entries(materialDemandForItem(sub.itemId))) {
      materialTotals[id] = (materialTotals[id] || 0) + amount * sub.quantity;
    }
  }

  // A job can be pinned to one colour, which overrides what the recipe says.
  const filamentLines = [];
  if (entry.filament_id) {
    const grams = Object.values(filamentTotals).reduce((a, b) => a + b, 0);
    if (grams > 0) {
      filamentLines.push({ line_type: 'filament', ref_id: Number(entry.filament_id), quantity: round2(grams), unit: 'g' });
    }
  } else {
    for (const [id, grams] of Object.entries(filamentTotals)) {
      if (grams > 0) filamentLines.push({ line_type: 'filament', ref_id: Number(id), quantity: round2(grams), unit: 'g' });
    }
  }

  const materialLines = Object.entries(materialTotals)
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => ({ line_type: 'material', ref_id: Number(id), quantity: round2(amount), unit: null }));

  return [...filamentLines, ...materialLines, ...itemLines];
}

/** Create the stored lines for a job if it does not have them yet. */
function ensurePicks(entry) {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM queue_picks WHERE queue_id = ?').get(entry.id).count;
  if (existing > 0) return;

  const lines = planPicks(entry);
  const insert = db.prepare(`
    INSERT INTO queue_picks (queue_id, line_type, ref_id, quantity, unit, spool_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    for (const line of lines) {
      let unit = line.unit;
      if (line.line_type === 'material') {
        unit = db.prepare('SELECT unit FROM materials WHERE id = ?').get(line.ref_id)?.unit || 'each';
      }
      insert.run(entry.id, line.line_type, line.ref_id, line.quantity, unit, null);
    }
  })();
}

/** Stored lines, dressed with names, stock levels and scannable codes. */
function readPicks(queueId) {
  const rows = db.prepare('SELECT * FROM queue_picks WHERE queue_id = ? ORDER BY id').all(queueId);

  return rows.map((row) => {
    if (row.line_type === 'filament') {
      const f = db.prepare('SELECT * FROM filaments WHERE id = ?').get(row.ref_id);
      if (!f) return { ...row, label: 'Missing filament', missing: true };
      const spools = suggestSpools(f.id, row.quantity);
      // Stock is every spool on the shelf, not just the ones this job needs.
      const fullGrams = (f.spool_size_kg || 1) * 1000;
      const onHand = db.prepare(`
        SELECT IFNULL(SUM(CASE WHEN status = 'new' THEN ?
                               WHEN status = 'opened' THEN IFNULL(grams_remaining, ?)
                               ELSE 0 END), 0) AS grams
          FROM filament_spools WHERE filament_id = ?
      `).get(fullGrams, fullGrams, f.id).grams;
      return {
        ...row,
        label: `${f.brand} ${f.material_type} — ${f.color_name}`,
        sublabel: `${f.spool_size_kg}kg spools`,
        color_hex: f.color_hex,
        codes: [f.barcode, f.sku, f.vendor_barcode, ...spools.map((s) => s.spool_code)].filter(Boolean),
        spools,
        qty_on_hand: round2(onHand),
        short_by: row.quantity > onHand ? round2(row.quantity - onHand) : 0,
      };
    }

    if (row.line_type === 'material') {
      const m = db.prepare('SELECT * FROM materials WHERE id = ?').get(row.ref_id);
      if (!m) return { ...row, label: 'Missing material', missing: true };
      return {
        ...row,
        label: m.name,
        sublabel: m.category || null,
        codes: [m.barcode, m.sku, m.vendor_barcode].filter(Boolean),
        qty_on_hand: round2(m.qty_on_hand || 0),
        short_by: row.quantity > (m.qty_on_hand || 0) ? round2(row.quantity - (m.qty_on_hand || 0)) : 0,
      };
    }

    const i = db.prepare('SELECT * FROM items WHERE id = ?').get(row.ref_id);
    if (!i) return { ...row, label: 'Missing item', missing: true };
    return {
      ...row,
      label: i.name,
      sublabel: 'Already made — pull from stock',
      codes: [i.barcode, i.sku, i.vendor_barcode].filter(Boolean),
      qty_on_hand: round2(i.qty_on_hand || 0),
      short_by: row.quantity > (i.qty_on_hand || 0) ? round2(row.quantity - (i.qty_on_hand || 0)) : 0,
    };
  });
}

module.exports = { planPicks, ensurePicks, readPicks, suggestSpools, directDemand };
