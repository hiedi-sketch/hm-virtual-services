const express = require('express');
const db = require('../../db/database');
const { nextSku, nextSpoolCode, defaultBarcode } = require('../../utils/print-sku');
const { filamentSummary } = require('../../utils/print-planning');
const { logStock } = require('./helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const list = filamentSummary();
  const filtered = req.query.needs_reorder === '1' ? list.filter((f) => f.needs_reorder) : list;
  res.json({ data: filtered });
});

router.get('/:id', (req, res) => {
  const [filament] = filamentSummary(Number(req.params.id));
  if (!filament) return res.status(404).json({ error: 'Filament not found' });
  res.json({ data: filament });
});

router.post('/', (req, res) => {
  const {
    color_name, brand, material_type = 'PLA', color_hex = '#B0B5BC',
    spool_size_kg = 1, cost_per_kg = 0, reorder_point_spools = 1,
    vendor_name, vendor_url, vendor_sku, vendor_barcode, notes,
    sku, barcode, initial_spools = 0, initial_status = 'new',
  } = req.body;

  if (!color_name || !brand) {
    return res.status(400).json({ error: 'Color name and brand are required' });
  }

  const finalSku = sku || nextSku('print_filaments', 'filament');
  const finalBarcode = barcode || defaultBarcode(finalSku);

  const create = db.transaction(() => {
    const id = db.prepare(`
      INSERT INTO print_filaments
        (color_name, color_hex, brand, material_type, spool_size_kg, cost_per_kg,
         reorder_point_spools, vendor_name, vendor_url, vendor_sku, sku, barcode,
         vendor_barcode, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      color_name, color_hex, brand, material_type, spool_size_kg, cost_per_kg,
      reorder_point_spools, vendor_name, vendor_url, vendor_sku, finalSku,
      finalBarcode, vendor_barcode, notes
    ).lastInsertRowid;

    const count = Number(initial_spools) || 0;
    for (let i = 0; i < count; i += 1) {
      db.prepare(`
        INSERT INTO print_filament_spools (filament_id, status, spool_code, purchase_cost, purchased_at)
        VALUES (?, ?, ?, ?, DATE('now'))
      `).run(id, initial_status, nextSpoolCode(), (cost_per_kg || 0) * (spool_size_kg || 1));
    }
    return id;
  });

  try {
    const id = create();
    const [filament] = filamentSummary(id);
    res.status(201).json({ data: filament });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'That SKU or barcode is already in use' });
    }
    throw err;
  }
});

const EDITABLE = [
  'color_name', 'color_hex', 'brand', 'material_type', 'spool_size_kg', 'cost_per_kg',
  'reorder_point_spools', 'vendor_name', 'vendor_url', 'vendor_sku', 'sku', 'barcode',
  'vendor_barcode', 'notes', 'is_active',
];

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM print_filaments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Filament not found' });

  const updates = EDITABLE.filter((k) => req.body[k] !== undefined);
  if (updates.length) {
    const sql = `UPDATE print_filaments SET ${updates.map((k) => `${k}=?`).join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`;
    db.prepare(sql).run(...updates.map((k) => req.body[k]), req.params.id);
  }
  const [filament] = filamentSummary(Number(req.params.id));
  res.json({ data: filament });
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM print_filaments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Filament not found' });

  const used = db.prepare(`
    SELECT COUNT(*) AS count FROM print_item_components
    WHERE component_type = 'filament' AND ref_id = ?
  `).get(req.params.id).count;
  if (used > 0) {
    return res.status(400).json({ error: `In use by ${used} catalog item(s). Mark it inactive instead.` });
  }

  db.prepare('DELETE FROM print_filaments WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ── Spools ───────────────────────────────────────────────────────────────────

router.post('/:id/spools', (req, res) => {
  const filament = db.prepare('SELECT * FROM print_filaments WHERE id = ?').get(req.params.id);
  if (!filament) return res.status(404).json({ error: 'Filament not found' });

  const {
    count = 1, status = 'new', purchase_cost, purchased_at, expected_at,
    order_reference, notes,
  } = req.body;

  const qty = Math.max(1, Math.min(100, Number(count) || 1));
  const cost = purchase_cost != null ? purchase_cost : (filament.cost_per_kg || 0) * (filament.spool_size_kg || 1);

  const add = db.transaction(() => {
    for (let i = 0; i < qty; i += 1) {
      db.prepare(`
        INSERT INTO print_filament_spools
          (filament_id, status, spool_code, grams_remaining, purchase_cost,
           purchased_at, opened_at, expected_at, order_reference, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        filament.id, status, nextSpoolCode(),
        status === 'opened' ? (filament.spool_size_kg || 1) * 1000 : null,
        cost,
        purchased_at || (status === 'ordered' ? null : new Date().toISOString().slice(0, 10)),
        status === 'opened' ? new Date().toISOString().slice(0, 10) : null,
        expected_at || null, order_reference || null, notes || null
      );
    }
    logStock('filament', filament.id, qty * (filament.spool_size_kg || 1) * 1000, 'g',
      status === 'ordered' ? 'spools ordered' : 'spools received', order_reference);
  });
  add();

  const [updated] = filamentSummary(filament.id);
  res.status(201).json({ data: updated });
});

router.put('/spools/:spoolId', (req, res) => {
  const spool = db.prepare('SELECT * FROM print_filament_spools WHERE id = ?').get(req.params.spoolId);
  if (!spool) return res.status(404).json({ error: 'Spool not found' });
  const filament = db.prepare('SELECT * FROM print_filaments WHERE id = ?').get(spool.filament_id);

  const { status, grams_remaining, notes, expected_at, order_reference, purchase_cost } = req.body;
  const nextStatus = status || spool.status;
  const todayStr = new Date().toISOString().slice(0, 10);

  let grams = grams_remaining !== undefined ? grams_remaining : spool.grams_remaining;
  // Opening a spool starts it at full weight; emptying it zeroes it out.
  if (nextStatus === 'opened' && spool.status !== 'opened' && grams == null) {
    grams = (filament.spool_size_kg || 1) * 1000;
  }
  if (nextStatus === 'empty') grams = 0;

  db.prepare(`
    UPDATE print_filament_spools
       SET status=?, grams_remaining=?, notes=?, expected_at=?, order_reference=?, purchase_cost=?,
           opened_at = CASE WHEN ? = 'opened' AND opened_at IS NULL THEN ? ELSE opened_at END,
           emptied_at = CASE WHEN ? = 'empty' AND emptied_at IS NULL THEN ? ELSE emptied_at END,
           purchased_at = CASE WHEN ? <> 'ordered' AND purchased_at IS NULL THEN ? ELSE purchased_at END,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
  `).run(
    nextStatus, grams,
    notes !== undefined ? notes : spool.notes,
    expected_at !== undefined ? expected_at : spool.expected_at,
    order_reference !== undefined ? order_reference : spool.order_reference,
    purchase_cost !== undefined ? purchase_cost : spool.purchase_cost,
    nextStatus, todayStr, nextStatus, todayStr, nextStatus, todayStr,
    req.params.spoolId
  );

  const [updated] = filamentSummary(spool.filament_id);
  res.json({ data: updated });
});

router.delete('/spools/:spoolId', (req, res) => {
  const spool = db.prepare('SELECT * FROM print_filament_spools WHERE id = ?').get(req.params.spoolId);
  if (!spool) return res.status(404).json({ error: 'Spool not found' });
  db.prepare('DELETE FROM print_filament_spools WHERE id = ?').run(req.params.spoolId);
  const [updated] = filamentSummary(spool.filament_id);
  res.json({ data: updated });
});

/** Burn grams off the open spools, oldest first, opening a new one if needed. */
router.post('/:id/consume', (req, res) => {
  const filament = db.prepare('SELECT * FROM print_filaments WHERE id = ?').get(req.params.id);
  if (!filament) return res.status(404).json({ error: 'Filament not found' });

  const grams = Number(req.body.grams);
  if (!Number.isFinite(grams) || grams <= 0) {
    return res.status(400).json({ error: 'Grams must be a positive number' });
  }
  const fullGrams = (filament.spool_size_kg || 1) * 1000;

  const consume = db.transaction(() => {
    let remaining = grams;
    const todayStr = new Date().toISOString().slice(0, 10);

    while (remaining > 0) {
      let spool = db.prepare(`
        SELECT * FROM print_filament_spools
         WHERE filament_id = ? AND status = 'opened' AND IFNULL(grams_remaining, 0) > 0
         ORDER BY opened_at, id LIMIT 1
      `).get(filament.id);

      if (!spool) {
        const fresh = db.prepare(`
          SELECT * FROM print_filament_spools WHERE filament_id = ? AND status = 'new' ORDER BY id LIMIT 1
        `).get(filament.id);
        if (!fresh) break; // nothing left to draw from
        db.prepare(`
          UPDATE print_filament_spools SET status='opened', grams_remaining=?, opened_at=?, updated_at=CURRENT_TIMESTAMP
           WHERE id=?
        `).run(fullGrams, todayStr, fresh.id);
        spool = { ...fresh, status: 'opened', grams_remaining: fullGrams };
      }

      const take = Math.min(remaining, spool.grams_remaining);
      const left = spool.grams_remaining - take;
      db.prepare(`
        UPDATE print_filament_spools
           SET grams_remaining=?, status = CASE WHEN ? <= 0 THEN 'empty' ELSE 'opened' END,
               emptied_at = CASE WHEN ? <= 0 THEN ? ELSE emptied_at END,
               updated_at = CURRENT_TIMESTAMP
         WHERE id=?
      `).run(left, left, left, todayStr, spool.id);
      remaining -= take;
    }

    logStock('filament', filament.id, -(grams - Math.max(0, remaining)), 'g',
      req.body.reason || 'consumed', req.body.reference);
    return remaining;
  });

  const short = consume();
  const [updated] = filamentSummary(filament.id);
  res.json({
    data: updated,
    message: short > 0 ? `Logged, but ${Math.round(short)}g more than you had on hand` : 'Usage logged',
  });
});

module.exports = router;
