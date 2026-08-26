const express = require('express');
const db = require('../db/database');
const { nextSpoolCode } = require('../utils/sku');
const { filamentSummary, materialSummary } = require('../utils/planning');
const { priceItem } = require('../utils/costing');
const { logStock } = require('./helpers');

const router = express.Router();

/**
 * Resolve a scanned string against everything that carries a code: our own
 * SKU labels, per-spool tags, and the vendor barcode printed on the packaging.
 */
function resolve(rawCode) {
  const code = String(rawCode || '').trim();
  if (!code) return null;

  const spool = db.prepare('SELECT * FROM filament_spools WHERE spool_code = ?').get(code);
  if (spool) {
    const [filament] = filamentSummary(spool.filament_id);
    return { type: 'filament_spool', code, spool, filament };
  }

  const filament = db.prepare(
    'SELECT * FROM filaments WHERE barcode = ? OR sku = ? OR vendor_barcode = ?'
  ).get(code, code, code);
  if (filament) {
    const [summary] = filamentSummary(filament.id);
    return { type: 'filament', code, filament: summary };
  }

  const material = db.prepare(
    'SELECT * FROM materials WHERE barcode = ? OR sku = ? OR vendor_barcode = ?'
  ).get(code, code, code);
  if (material) {
    const [summary] = materialSummary(material.id);
    return { type: 'material', code, material: summary };
  }

  const item = db.prepare(
    'SELECT * FROM items WHERE barcode = ? OR sku = ? OR vendor_barcode = ?'
  ).get(code, code, code);
  if (item) return { type: 'item', code, item: priceItem(item.id) };

  return null;
}

router.post('/lookup', (req, res) => {
  const match = resolve(req.body.code);
  if (!match) {
    return res.status(404).json({ error: 'Nothing in the shop matches that code', code: req.body.code });
  }
  res.json({ data: match });
});

const TABLES = { filament: 'filaments', material: 'materials', item: 'items' };

/** Everything a stray barcode could be attached to. */
router.get('/targets', (req, res) => {
  res.json({
    data: {
      filament: db.prepare('SELECT id, brand, material_type, color_name FROM filaments ORDER BY brand, color_name').all()
        .map((f) => ({ id: f.id, label: `${f.brand} ${f.material_type} — ${f.color_name}` })),
      material: db.prepare('SELECT id, name FROM materials ORDER BY name').all()
        .map((m) => ({ id: m.id, label: m.name })),
      item: db.prepare('SELECT id, name, sku FROM items ORDER BY name').all()
        .map((i) => ({ id: i.id, label: `${i.name} (${i.sku})` })),
    },
  });
});

/**
 * Put a scanned code onto something already in the shop, so the same scan
 * finds it next time. This is the answer to scanning a spool of a colour you
 * already stock but had not recorded the manufacturer's barcode for.
 */
router.post('/link', (req, res) => {
  const { type, id } = req.body;
  const table = TABLES[type];
  if (!table) return res.status(400).json({ error: 'Type must be filament, material or item' });

  const code = String(req.body.code || '').trim();
  if (!code) return res.status(400).json({ error: 'No code to link' });

  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'That is not in the shop' });

  // One code must never point at two things, or scanning becomes a coin toss.
  const clash = resolve(code);
  if (clash) return res.status(400).json({ error: 'That code already belongs to something else' });

  db.prepare(`UPDATE ${table} SET vendor_barcode = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(code, id);

  res.json({
    data: resolve(code),
    message: `${row.color_name || row.name} will come up when you scan that from now on`,
  });
});

const VALID_ACTIONS = ['receive', 'open', 'consume', 'count', 'empty'];

router.post('/action', (req, res) => {
  const { action = 'receive', quantity = 1, reference } = req.body;
  if (!VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `Action must be one of ${VALID_ACTIONS.join(', ')}` });
  }

  const match = resolve(req.body.code);
  if (!match) {
    return res.status(404).json({ error: 'Nothing in the shop matches that code', code: req.body.code });
  }

  const qty = Number(quantity);
  const todayStr = new Date().toISOString().slice(0, 10);

  // ── A specific physical spool ──────────────────────────────────────────────
  if (match.type === 'filament_spool') {
    const spool = match.spool;
    const f = db.prepare('SELECT * FROM filaments WHERE id = ?').get(spool.filament_id);
    const fullGrams = (f.spool_size_kg || 1) * 1000;

    if (action === 'open') {
      db.prepare(`
        UPDATE filament_spools
           SET status='opened', grams_remaining = IFNULL(grams_remaining, ?), opened_at = IFNULL(opened_at, ?),
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
      `).run(fullGrams, todayStr, spool.id);
    } else if (action === 'empty') {
      db.prepare(
        "UPDATE filament_spools SET status='empty', grams_remaining=0, emptied_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).run(todayStr, spool.id);
      logStock('filament', f.id, -(spool.grams_remaining ?? fullGrams), 'g', 'spool emptied', spool.spool_code);
    } else if (action === 'receive') {
      db.prepare(
        "UPDATE filament_spools SET status='new', purchased_at = IFNULL(purchased_at, ?), updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).run(todayStr, spool.id);
      logStock('filament', f.id, fullGrams, 'g', 'spool received', spool.spool_code);
    } else if (action === 'count' || action === 'consume') {
      const current = spool.grams_remaining ?? fullGrams;
      const left = action === 'count' ? qty : Math.max(0, current - Math.abs(qty));
      db.prepare(`
        UPDATE filament_spools
           SET grams_remaining = ?, status = CASE WHEN ? <= 0 THEN 'empty' ELSE 'opened' END,
               opened_at = IFNULL(opened_at, ?), updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
      `).run(left, left, todayStr, spool.id);
      logStock('filament', f.id, left - current, 'g', action === 'count' ? 'weighed' : 'used', spool.spool_code);
    }

    const [filament] = filamentSummary(f.id);
    const updatedSpool = db.prepare('SELECT * FROM filament_spools WHERE id = ?').get(spool.id);
    return res.json({
      data: { type: 'filament_spool', code: match.code, spool: updatedSpool, filament },
      message: `${f.brand} ${f.color_name} · ${spool.spool_code} — ${action}`,
    });
  }

  // ── A filament type (vendor barcode or shelf label) ─────────────────────────
  if (match.type === 'filament') {
    const f = db.prepare('SELECT * FROM filaments WHERE id = ?').get(match.filament.id);
    const fullGrams = (f.spool_size_kg || 1) * 1000;

    if (action === 'receive') {
      const count = Math.max(1, Math.min(50, qty || 1));
      const add = db.transaction(() => {
        for (let i = 0; i < count; i += 1) {
          db.prepare(`
            INSERT INTO filament_spools (filament_id, status, spool_code, purchase_cost, purchased_at)
            VALUES (?, 'new', ?, ?, ?)
          `).run(f.id, nextSpoolCode(), (f.cost_per_kg || 0) * (f.spool_size_kg || 1), todayStr);
        }
        logStock('filament', f.id, count * fullGrams, 'g', 'received by scan', reference);
      });
      add();
    } else if (action === 'open') {
      const fresh = db.prepare(
        "SELECT * FROM filament_spools WHERE filament_id = ? AND status = 'new' ORDER BY id LIMIT 1"
      ).get(f.id);
      if (!fresh) {
        return res.status(400).json({ error: 'No new spools of that filament to open' });
      }
      db.prepare(
        "UPDATE filament_spools SET status='opened', grams_remaining=?, opened_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).run(fullGrams, todayStr, fresh.id);
    } else {
      return res.status(400).json({
        error: 'Scan an individual spool tag to weigh or empty a spool',
      });
    }

    const [filament] = filamentSummary(f.id);
    return res.json({ data: { type: 'filament', code: match.code, filament }, message: `${f.brand} ${f.color_name} — ${action}` });
  }

  // ── Materials and catalog items share the same adjust semantics ────────────
  const isMaterial = match.type === 'material';
  const table = isMaterial ? 'materials' : 'items';
  const entity = isMaterial ? match.material : match.item;
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(entity.id);

  let change = 0;
  if (action === 'receive') change = Math.abs(qty);
  else if (action === 'consume') change = -Math.abs(qty);
  else if (action === 'count') change = qty - (row.qty_on_hand || 0);
  else return res.status(400).json({ error: `${action} does not apply to ${match.type}s` });

  db.prepare(`UPDATE ${table} SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run((row.qty_on_hand || 0) + change, row.id);
  if (isMaterial && action === 'receive') {
    db.prepare('UPDATE materials SET qty_on_order = ? WHERE id = ?')
      .run(Math.max(0, (row.qty_on_order || 0) - Math.abs(qty)), row.id);
  }
  logStock(isMaterial ? 'material' : 'item', row.id, change, isMaterial ? row.unit : 'each', `${action} by scan`, reference);

  const data = isMaterial
    ? { type: 'material', code: match.code, material: materialSummary(row.id)[0] }
    : { type: 'item', code: match.code, item: priceItem(row.id) };
  res.json({ data, message: `${row.name} — ${action} ${Math.abs(change)}` });
});

module.exports = router;
