const express = require('express');
const db = require('../db/database');
const { getSettings } = require('../utils/costing');
const {
  scheduleQueue, orderProjections, estimatedMinutes, filamentSummary, materialSummary,
} = require('../utils/planning');
const { ensurePicks, readPicks } = require('../utils/picklist');
const flow = require('../services/order-flow');
const jobs = require('../services/job-complete');
const board = require('../services/production-board');

const router = express.Router();

const EDITABLE = [
  'order_id', 'order_item_id', 'item_id', 'quantity', 'status', 'priority',
  'position', 'printer', 'filament_id', 'estimated_minutes', 'notes', 'started_at',
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

/** The two numbers the buttons at the top of every page carry. */
router.get('/board', (req, res) => res.json({ data: board.board() }));

/** What is on a printer now, and what has come off onto the bench. */
router.get('/printing', (req, res) => res.json({ data: board.printingNow() }));

/** Everything ordered that still has to be printed, gathered by product. */
router.get('/in-queue', (req, res) => res.json({ data: board.inQueue() }));

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
    // A job created already on a plate has been running since now, not since
    // never — the panel counts elapsed time from this.
    started_at: req.body.status === 'printing' ? new Date().toISOString() : req.body.started_at,
    estimated_minutes: req.body.estimated_minutes ??
      estimatedMinutes({ item_id, quantity: Number(quantity) || 1, estimated_minutes: null }),
  };
  const keys = EDITABLE.filter((k) => body[k] !== undefined);

  db.prepare(
    `INSERT INTO queue_jobs (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((k) => body[k]));

  res.status(201).json({ data: queuePayload() });
});

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
      jobs.completeJob({ ...entry, ...req.body, id: entry.id });
    }

    jobs.settleOrder(entry.order_id);
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
