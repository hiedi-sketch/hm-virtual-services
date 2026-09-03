const express = require('express');
const db = require('../db/database');
const { getSettings, filamentDemandForItem, materialDemandForItem } = require('../utils/costing');
const {
  scheduleQueue, orderProjections, estimatedMinutes, filamentSummary, materialSummary,
} = require('../utils/planning');
const { logStock } = require('./helpers');
const { ensurePicks, readPicks } = require('../utils/picklist');
const flow = require('../services/order-flow');
const inventory = require('../services/inventory-sync');

const router = express.Router();

const EDITABLE = [
  'order_id', 'order_item_id', 'item_id', 'quantity', 'status', 'priority',
  'position', 'printer', 'filament_id', 'estimated_minutes', 'notes',
];

function queuePayload() {
  const settings = getSettings();
  const { scheduled, capacity_hours_per_day, queue_hours } = scheduleQueue(settings);
  const { projections } = orderProjections(settings);
  const byOrder = new Map(projections.map((p) => [p.order_id, p]));

  return {
    queue: scheduled.map((row) => ({ ...row, projection: byOrder.get(row.order_id) || null })),
    projections,
    capacity_hours_per_day,
    queue_hours,
    queue_days: Math.ceil(queue_hours / capacity_hours_per_day),
    settings,
    done: db.prepare(`
      SELECT q.*, i.name AS item_name, o.order_number FROM queue_jobs q
        JOIN items i ON q.item_id = i.id
        LEFT JOIN orders o ON q.order_id = o.id
       WHERE q.status IN ('done','cancelled')
       ORDER BY q.completed_at DESC, q.id DESC LIMIT 25
    `).all(),
  };
}

router.get('/', (req, res) => res.json({ data: queuePayload() }));

router.post('/', (req, res) => {
  const { item_id, quantity = 1 } = req.body;
  if (!item_id) return res.status(400).json({ error: 'An item is required' });
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(item_id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const maxPosition = db.prepare('SELECT IFNULL(MAX(position), 0) AS max FROM queue_jobs').get().max;
  const body = {
    ...req.body,
    quantity: Number(quantity) || 1,
    position: req.body.position ?? maxPosition + 1,
    estimated_minutes: req.body.estimated_minutes ??
      estimatedMinutes({ item_id, quantity: Number(quantity) || 1, estimated_minutes: null }),
  };
  const keys = EDITABLE.filter((k) => body[k] !== undefined);

  db.prepare(
    `INSERT INTO queue_jobs (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((k) => body[k]));

  res.status(201).json({ data: queuePayload() });
});

/** Take grams off the open spools, opening a sealed one when needed. */
function drawFilament(filamentId, grams, reference) {
  const f = db.prepare('SELECT * FROM filaments WHERE id = ?').get(filamentId);
  if (!f || !grams) return;
  const fullGrams = (f.spool_size_kg || 1) * 1000;
  const todayStr = new Date().toISOString().slice(0, 10);
  let remaining = grams;

  while (remaining > 0) {
    let spool = db.prepare(`
      SELECT * FROM filament_spools
       WHERE filament_id = ? AND status = 'opened' AND IFNULL(grams_remaining, 0) > 0
       ORDER BY opened_at, id LIMIT 1
    `).get(f.id);

    if (!spool) {
      const fresh = db.prepare(
        "SELECT * FROM filament_spools WHERE filament_id = ? AND status = 'new' ORDER BY id LIMIT 1"
      ).get(f.id);
      if (!fresh) break;
      db.prepare(
        "UPDATE filament_spools SET status='opened', grams_remaining=?, opened_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).run(fullGrams, todayStr, fresh.id);
      spool = { ...fresh, grams_remaining: fullGrams };
    }

    const take = Math.min(remaining, spool.grams_remaining);
    const left = spool.grams_remaining - take;
    db.prepare(`
      UPDATE filament_spools
         SET grams_remaining=?, status = CASE WHEN ? <= 0 THEN 'empty' ELSE 'opened' END,
             emptied_at = CASE WHEN ? <= 0 THEN ? ELSE emptied_at END, updated_at = CURRENT_TIMESTAMP
       WHERE id=?
    `).run(left, left, left, todayStr, spool.id);
    remaining -= take;
  }
  logStock('filament', f.id, -(grams - Math.max(0, remaining)), 'g', 'print completed', reference);
}

/**
 * Complete a job against its pick list. Because the list already decided which
 * components come off the shelf instead of being printed, its filament and
 * material figures are what the machine actually used — so the deduction
 * matches what was gathered.
 */
function completeFromPicks(entry, picks) {
  const reference = `Queue #${entry.id}`;

  for (const line of picks) {
    if (line.line_type === 'filament') {
      drawFilament(line.ref_id, line.quantity, reference);
    } else if (line.line_type === 'material') {
      const m = db.prepare('SELECT * FROM materials WHERE id = ?').get(line.ref_id);
      if (!m) continue;
      db.prepare('UPDATE materials SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run((m.qty_on_hand || 0) - line.quantity, m.id);
      logStock('material', m.id, -line.quantity, m.unit, 'print completed', reference);
    } else {
      // A part pulled from the shelf rather than printed.
      const sub = db.prepare('SELECT * FROM items WHERE id = ?').get(line.ref_id);
      if (!sub) continue;
      db.prepare('UPDATE items SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run((sub.qty_on_hand || 0) - line.quantity, sub.id);
      logStock('item', sub.id, -line.quantity, 'each', 'used in print', reference);
      inventory.markChanged(sub.id);
    }
  }

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(entry.item_id);
  db.prepare('UPDATE items SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run((item.qty_on_hand || 0) + (entry.quantity || 0), item.id);
  logStock('item', item.id, entry.quantity || 0, 'each', 'print completed', reference);
  inventory.changed(item.id);
}

/**
 * Finishing a print is what actually draws stock down: filament off the open
 * spools, consumable materials off the shelf, finished units onto it.
 */
function completeEntry(entry) {
  const filament = filamentDemandForItem(entry.item_id);
  const materials = materialDemandForItem(entry.item_id);
  const qty = entry.quantity || 0;
  const reference = `Queue #${entry.id}`;

  // A queue entry can pin one colour for the whole job.
  const filamentTotals = entry.filament_id
    ? { [entry.filament_id]: Object.values(filament).reduce((a, b) => a + b, 0) * qty }
    : Object.fromEntries(Object.entries(filament).map(([id, g]) => [id, g * qty]));

  for (const [filamentId, grams] of Object.entries(filamentTotals)) {
    if (!grams) continue;
    const f = db.prepare('SELECT * FROM filaments WHERE id = ?').get(filamentId);
    if (!f) continue;
    const fullGrams = (f.spool_size_kg || 1) * 1000;
    let remaining = grams;
    const todayStr = new Date().toISOString().slice(0, 10);

    while (remaining > 0) {
      let spool = db.prepare(`
        SELECT * FROM filament_spools
         WHERE filament_id = ? AND status = 'opened' AND IFNULL(grams_remaining, 0) > 0
         ORDER BY opened_at, id LIMIT 1
      `).get(f.id);

      if (!spool) {
        const fresh = db.prepare(
          "SELECT * FROM filament_spools WHERE filament_id = ? AND status = 'new' ORDER BY id LIMIT 1"
        ).get(f.id);
        if (!fresh) break;
        db.prepare(
          "UPDATE filament_spools SET status='opened', grams_remaining=?, opened_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
        ).run(fullGrams, todayStr, fresh.id);
        spool = { ...fresh, grams_remaining: fullGrams };
      }

      const take = Math.min(remaining, spool.grams_remaining);
      const left = spool.grams_remaining - take;
      db.prepare(`
        UPDATE filament_spools
           SET grams_remaining=?, status = CASE WHEN ? <= 0 THEN 'empty' ELSE 'opened' END,
               emptied_at = CASE WHEN ? <= 0 THEN ? ELSE emptied_at END, updated_at = CURRENT_TIMESTAMP
         WHERE id=?
      `).run(left, left, left, todayStr, spool.id);
      remaining -= take;
    }
    logStock('filament', f.id, -(grams - Math.max(0, remaining)), 'g', 'print completed', reference);
  }

  for (const [materialId, amount] of Object.entries(materials)) {
    const used = amount * qty;
    if (!used) continue;
    const m = db.prepare('SELECT * FROM materials WHERE id = ?').get(materialId);
    if (!m) continue;
    db.prepare('UPDATE materials SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run((m.qty_on_hand || 0) - used, m.id);
    logStock('material', m.id, -used, m.unit, 'print completed', reference);
  }

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(entry.item_id);
  db.prepare('UPDATE items SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run((item.qty_on_hand || 0) + qty, item.id);
  logStock('item', item.id, qty, 'each', 'print completed', reference);
  inventory.changed(item.id);
}

router.put('/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue entry not found' });

  const nextStatus = req.body.status || entry.status;
  const justCompleted = nextStatus === 'done' && entry.status !== 'done';

  const update = db.transaction(() => {
    const keys = EDITABLE.filter((k) => req.body[k] !== undefined);
    if (keys.length) {
      db.prepare(
        `UPDATE queue_jobs SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).run(...keys.map((k) => req.body[k]), entry.id);
    }
    if (nextStatus === 'printing' && !entry.started_at) {
      db.prepare('UPDATE queue_jobs SET started_at = CURRENT_TIMESTAMP WHERE id = ?').run(entry.id);
    }
    // Starting a job here means the same thing as starting it from the order:
    // that order is in production now. Forward only.
    if (nextStatus === 'printing' && entry.order_id) {
      flow.advanceTo(entry.order_id, 'in_production', { source: 'queue', note: 'a print started' });
    }
    if (justCompleted) {
      db.prepare('UPDATE queue_jobs SET completed_at = CURRENT_TIMESTAMP WHERE id = ?').run(entry.id);
      const picks = db.prepare('SELECT * FROM queue_picks WHERE queue_id = ?').all(entry.id);
      const merged = { ...entry, ...req.body, id: entry.id };
      if (picks.length) completeFromPicks(merged, picks);
      else completeEntry(merged);
    }

    // When the last job on an order lands, printing is done and the order is
    // waiting on finishing. Forward only: if she has already scanned it past
    // here, the queue does not drag it back.
    if (entry.order_id) {
      const outstanding = db.prepare(
        "SELECT COUNT(*) AS count FROM queue_jobs WHERE order_id = ? AND status IN ('queued','printing','post_processing')"
      ).get(entry.order_id).count;
      if (outstanding === 0) {
        flow.advanceTo(entry.order_id, 'finishing', { source: 'queue', note: 'all print jobs done' });
      }
    }
  });
  update();

  res.json({ data: queuePayload() });
});

router.delete('/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue entry not found' });
  db.prepare('DELETE FROM queue_jobs WHERE id = ?').run(req.params.id);
  res.json({ data: queuePayload() });
});

/** Drag-and-drop reordering sends the whole list of ids in their new order. */
router.put('/reorder/positions', (req, res) => {
  const { ids = [] } = req.body;
  const update = db.prepare('UPDATE queue_jobs SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  db.transaction(() => ids.forEach((id, index) => update.run(index + 1, id)))();
  res.json({ data: queuePayload() });
});

// ── Pick list ────────────────────────────────────────────────────────────────

function pickListPayload(entry) {
  const lines = readPicks(entry.id);
  return {
    queue_id: entry.id,
    item_name: db.prepare('SELECT name FROM items WHERE id = ?').get(entry.item_id)?.name,
    quantity: entry.quantity,
    status: entry.status,
    lines,
    total: lines.length,
    picked: lines.filter((l) => l.picked).length,
    short: lines.filter((l) => l.short_by > 0).length,
  };
}

/** Everything to gather for a job, built on first ask and kept thereafter. */
router.get('/:id/picklist', (req, res) => {
  const entry = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue job not found' });
  ensurePicks(entry);
  res.json({ data: pickListPayload(entry) });
});

/** Rebuild from current stock — useful if the recipe or shelf changed. */
router.delete('/:id/picklist', (req, res) => {
  const entry = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue job not found' });
  db.prepare('DELETE FROM queue_picks WHERE queue_id = ?').run(entry.id);
  ensurePicks(entry);
  res.json({ data: pickListPayload(entry) });
});

router.put('/picks/:pickId', (req, res) => {
  const pick = db.prepare('SELECT * FROM queue_picks WHERE id = ?').get(req.params.pickId);
  if (!pick) return res.status(404).json({ error: 'That line is not on the list' });

  const picked = req.body.picked ? 1 : 0;
  db.prepare('UPDATE queue_picks SET picked = ?, picked_at = ? WHERE id = ?')
    .run(picked, picked ? new Date().toISOString() : null, pick.id);

  const entry = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(pick.queue_id);
  res.json({ data: pickListPayload(entry) });
});

/** Tick a line off by scanning whatever is in your hand. */
router.post('/:id/picklist/scan', (req, res) => {
  const entry = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue job not found' });
  ensurePicks(entry);

  const code = String(req.body.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Nothing scanned' });

  const lines = readPicks(entry.id);
  const matches = lines.filter((l) => (l.codes || []).includes(code));

  if (!matches.length) {
    return res.status(404).json({
      error: 'That is not on this list',
      code,
      data: pickListPayload(entry),
    });
  }

  const line = matches.find((l) => !l.picked) || matches[0];
  const already = !!line.picked;
  if (!already) {
    db.prepare('UPDATE queue_picks SET picked = 1, picked_at = ? WHERE id = ?')
      .run(new Date().toISOString(), line.id);
  }

  res.json({
    data: pickListPayload(entry),
    matched: { id: line.id, label: line.label, quantity: line.quantity, unit: line.unit },
    message: already ? `${line.label} was already ticked off` : `${line.label} — collected`,
  });
});

/** What the queue will burn versus what is actually on the shelf. */
router.get('/shortages', (req, res) => {
  res.json({
    data: {
      filament: filamentSummary().filter((f) => f.short_by_grams > 0 || f.needs_reorder),
      materials: materialSummary().filter((m) => m.short_by > 0 || m.needs_reorder),
    },
  });
});

module.exports = router;
