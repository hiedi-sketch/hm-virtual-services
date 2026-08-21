const express = require('express');
const db = require('../../db/database');
const { getSettings, filamentDemandForItem, materialDemandForItem } = require('../../utils/print-costing');
const {
  scheduleQueue, orderProjections, estimatedMinutes, filamentSummary, materialSummary,
} = require('../../utils/print-planning');
const { logStock } = require('./helpers');

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
      SELECT q.*, i.name AS item_name, o.order_number FROM print_queue q
        JOIN print_items i ON q.item_id = i.id
        LEFT JOIN print_orders o ON q.order_id = o.id
       WHERE q.status IN ('done','cancelled')
       ORDER BY q.completed_at DESC, q.id DESC LIMIT 25
    `).all(),
  };
}

router.get('/', (req, res) => res.json({ data: queuePayload() }));

router.post('/', (req, res) => {
  const { item_id, quantity = 1 } = req.body;
  if (!item_id) return res.status(400).json({ error: 'An item is required' });
  const item = db.prepare('SELECT * FROM print_items WHERE id = ?').get(item_id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const maxPosition = db.prepare('SELECT IFNULL(MAX(position), 0) AS max FROM print_queue').get().max;
  const body = {
    ...req.body,
    quantity: Number(quantity) || 1,
    position: req.body.position ?? maxPosition + 1,
    estimated_minutes: req.body.estimated_minutes ??
      estimatedMinutes({ item_id, quantity: Number(quantity) || 1, estimated_minutes: null }),
  };
  const keys = EDITABLE.filter((k) => body[k] !== undefined);

  db.prepare(
    `INSERT INTO print_queue (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((k) => body[k]));

  res.status(201).json({ data: queuePayload() });
});

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
    const f = db.prepare('SELECT * FROM print_filaments WHERE id = ?').get(filamentId);
    if (!f) continue;
    const fullGrams = (f.spool_size_kg || 1) * 1000;
    let remaining = grams;
    const todayStr = new Date().toISOString().slice(0, 10);

    while (remaining > 0) {
      let spool = db.prepare(`
        SELECT * FROM print_filament_spools
         WHERE filament_id = ? AND status = 'opened' AND IFNULL(grams_remaining, 0) > 0
         ORDER BY opened_at, id LIMIT 1
      `).get(f.id);

      if (!spool) {
        const fresh = db.prepare(
          "SELECT * FROM print_filament_spools WHERE filament_id = ? AND status = 'new' ORDER BY id LIMIT 1"
        ).get(f.id);
        if (!fresh) break;
        db.prepare(
          "UPDATE print_filament_spools SET status='opened', grams_remaining=?, opened_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
        ).run(fullGrams, todayStr, fresh.id);
        spool = { ...fresh, grams_remaining: fullGrams };
      }

      const take = Math.min(remaining, spool.grams_remaining);
      const left = spool.grams_remaining - take;
      db.prepare(`
        UPDATE print_filament_spools
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
    const m = db.prepare('SELECT * FROM print_materials WHERE id = ?').get(materialId);
    if (!m) continue;
    db.prepare('UPDATE print_materials SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run((m.qty_on_hand || 0) - used, m.id);
    logStock('material', m.id, -used, m.unit, 'print completed', reference);
  }

  const item = db.prepare('SELECT * FROM print_items WHERE id = ?').get(entry.item_id);
  db.prepare('UPDATE print_items SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run((item.qty_on_hand || 0) + qty, item.id);
  logStock('item', item.id, qty, 'each', 'print completed', reference);
}

router.put('/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM print_queue WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue entry not found' });

  const nextStatus = req.body.status || entry.status;
  const justCompleted = nextStatus === 'done' && entry.status !== 'done';

  const update = db.transaction(() => {
    const keys = EDITABLE.filter((k) => req.body[k] !== undefined);
    if (keys.length) {
      db.prepare(
        `UPDATE print_queue SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).run(...keys.map((k) => req.body[k]), entry.id);
    }
    if (nextStatus === 'printing' && !entry.started_at) {
      db.prepare('UPDATE print_queue SET started_at = CURRENT_TIMESTAMP WHERE id = ?').run(entry.id);
    }
    if (justCompleted) {
      db.prepare('UPDATE print_queue SET completed_at = CURRENT_TIMESTAMP WHERE id = ?').run(entry.id);
      completeEntry({ ...entry, ...req.body, id: entry.id });
    }

    // When the last job on an order lands, the order is ready to pack.
    if (entry.order_id) {
      const outstanding = db.prepare(
        "SELECT COUNT(*) AS count FROM print_queue WHERE order_id = ? AND status IN ('queued','printing','post_processing')"
      ).get(entry.order_id).count;
      if (outstanding === 0) {
        db.prepare(
          "UPDATE print_orders SET status = 'ready', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'in_production'"
        ).run(entry.order_id);
      }
    }
  });
  update();

  res.json({ data: queuePayload() });
});

router.delete('/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM print_queue WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue entry not found' });
  db.prepare('DELETE FROM print_queue WHERE id = ?').run(req.params.id);
  res.json({ data: queuePayload() });
});

/** Drag-and-drop reordering sends the whole list of ids in their new order. */
router.put('/reorder/positions', (req, res) => {
  const { ids = [] } = req.body;
  const update = db.prepare('UPDATE print_queue SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  db.transaction(() => ids.forEach((id, index) => update.run(index + 1, id)))();
  res.json({ data: queuePayload() });
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
