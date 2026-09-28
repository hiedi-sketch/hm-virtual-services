const db = require('../db/database');
const { filamentDemandForItem, materialDemandForItem, round2 } = require('../utils/costing');
const { logStock } = require('../routes/helpers');
const inventory = require('./inventory-sync');
const flow = require('./order-flow');

/**
 * Finishing a print job, and what that does to the shop.
 *
 * This is the moment stock actually moves: filament comes off the open spools,
 * materials come off the shelf, and finished units go on it. It is reached from
 * the Queue tab and from a single product on an order card, so it lives here
 * rather than in whichever route got there first.
 */

/**
 * Take grams off the open spools, opening a sealed one when needed.
 *
 * `preferSpoolId` is the spool she named on the job, and it is drained first —
 * the same spool the pick list sent her to, so what the paper said and what the
 * shelf records agree. When it runs out the rest comes off the oldest open one,
 * as always.
 */
function drawFilament(filamentId, grams, reference, preferSpoolId = null) {
  const f = db.prepare('SELECT * FROM filaments WHERE id = ?').get(filamentId);
  if (!f || !grams) return;
  const fullGrams = (f.spool_size_kg || 1) * 1000;
  const todayStr = new Date().toISOString().slice(0, 10);
  let remaining = grams;
  let prefer = preferSpoolId ? Number(preferSpoolId) : null;

  while (remaining > 0) {
    let spool = prefer
      ? db.prepare(`
          SELECT * FROM filament_spools
           WHERE id = ? AND filament_id = ? AND status IN ('new','opened')
        `).get(prefer, f.id)
      : null;
    // Asked for once: if it is empty or not this filament, fall through to the
    // usual order rather than looping on it.
    prefer = null;

    if (spool && spool.status === 'new') {
      db.prepare(
        "UPDATE filament_spools SET status='opened', grams_remaining=?, opened_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).run(fullGrams, todayStr, spool.id);
      spool = { ...spool, grams_remaining: fullGrams };
    }
    if (spool && !(spool.grams_remaining > 0)) spool = null;

    if (!spool) spool = db.prepare(`
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
    // Rounded before it is stored. Grams carry two decimals now, and binary
    // floating point turns 115.65 − 24.35 into 91.30000000000001 — which is
    // what the shelf would then say it holds.
    const left = round2(spool.grams_remaining - take);
    db.prepare(`
      UPDATE filament_spools
         SET grams_remaining=?, status = CASE WHEN ? <= 0 THEN 'empty' ELSE 'opened' END,
             emptied_at = CASE WHEN ? <= 0 THEN ? ELSE emptied_at END, updated_at = CURRENT_TIMESTAMP
       WHERE id=?
    `).run(left, left, left, todayStr, spool.id);
    remaining -= take;
  }
  logStock('filament', f.id, -round2(grams - Math.max(0, remaining)), 'g', 'print completed', reference);
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
      drawFilament(line.ref_id, line.quantity, reference, line.spool_id);
    } else if (line.line_type === 'material') {
      const m = db.prepare('SELECT * FROM materials WHERE id = ?').get(line.ref_id);
      if (!m) continue;
      db.prepare('UPDATE materials SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(round2((m.qty_on_hand || 0) - line.quantity), m.id);
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

  addFinished(entry, reference);
}

/**
 * Complete a job with no pick list, by costing its recipe out in full and
 * treating every component as printed.
 */
function completeEntry(entry) {
  // A one-off with no list left to cost: it takes what the job itself says, and
  // leaves nothing behind on the shelf.
  if (!entry.item_id) {
    if (entry.filament_id && entry.filament_grams) {
      drawFilament(entry.filament_id, entry.filament_grams, `Queue #${entry.id}`, entry.spool_id);
    }
    return;
  }

  const filament = filamentDemandForItem(entry.item_id);
  const materials = materialDemandForItem(entry.item_id);
  const qty = entry.quantity || 0;
  const reference = `Queue #${entry.id}`;

  // A queue entry can pin one colour for the whole job.
  const filamentTotals = entry.filament_id
    ? { [entry.filament_id]: Object.values(filament).reduce((a, b) => a + b, 0) * qty }
    : Object.fromEntries(Object.entries(filament).map(([id, g]) => [id, g * qty]));

  for (const [filamentId, grams] of Object.entries(filamentTotals)) {
    drawFilament(filamentId, grams, reference);
  }

  for (const [materialId, amount] of Object.entries(materials)) {
    const used = amount * qty;
    if (!used) continue;
    const m = db.prepare('SELECT * FROM materials WHERE id = ?').get(materialId);
    if (!m) continue;
    db.prepare('UPDATE materials SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(round2((m.qty_on_hand || 0) - used), m.id);
    logStock('material', m.id, -used, m.unit, 'print completed', reference);
  }

  addFinished(entry, reference);
}

/**
 * The units themselves, onto the shelf.
 *
 * A one-off has no item, and nothing to add: a test print is not stock, has no
 * price and must never reach Shopify. It went through the printer and came off
 * it, and that is the whole of its life.
 */
function addFinished(entry, reference) {
  if (!entry.item_id) return;
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(entry.item_id);
  if (!item) return;
  const qty = entry.quantity || 0;
  db.prepare('UPDATE items SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run((item.qty_on_hand || 0) + qty, item.id);
  logStock('item', item.id, qty, 'each', 'print completed', reference);
  inventory.changed(item.id);

  // A print for the shelf comes off into the Stock bin and waits there to be
  // carried to inventory. A print for an order does not: it goes into that
  // order's own bin, which the panel asks about while it is still in her hand.
  if (!entry.order_id) require('./bins').putInStock(item.id, qty);
}

/** Finish one job: its pick list decides how, if it has one. */
function completeJob(entry) {
  const picks = db.prepare('SELECT * FROM queue_picks WHERE queue_id = ?').all(entry.id);
  if (picks.length) completeFromPicks(entry, picks);
  else completeEntry(entry);
}

/**
 * When nothing on an order is left on a printer, the order is at finishing —
 * whether the last job came off into post-processing or straight to done.
 * Forward only: if she has already scanned it past here, the queue does not
 * drag it back.
 */
function settleOrder(orderId) {
  if (!orderId) return null;
  const onPrinters = db.prepare(
    "SELECT COUNT(*) AS count FROM queue_jobs WHERE order_id = ? AND status IN ('queued','printing')"
  ).get(orderId).count;
  if (onPrinters > 0) return null;

  // Nothing on a printer is not the same as nothing left to print. Work only
  // reaches the Print Queue when she puts it there, so an order can have an
  // empty queue and three products still to make — and an order that walked
  // itself to finishing on the strength of that would be lying about it.
  const left = [...require('./allocation').forOrder(orderId).values()]
    .some((line) => line.needs_printing > 0);
  if (left) return null;

  return flow.advanceTo(orderId, 'finishing', { source: 'queue', note: 'nothing left to print' });
}

/**
 * A single product's own progress, which is not the order's.
 *
 * One plate at a time is the whole shape of a one-printer shop: this comes off
 * and goes to the bench, the next one goes on. So a job walks its own short
 * chain, and the order follows when there is nothing left on a printer.
 */
const JOB_CHAIN = ['queued', 'printing', 'post_processing', 'done'];

const JOB_SAID = {
  printing: 'is printing',
  post_processing: 'is off the printer, in finishing',
  done: 'is printed and on the shelf',
};

function advanceJob(jobId, { to = null, source = 'app' } = {}) {
  const entry = db.prepare(`
    SELECT q.*, IFNULL(i.name, q.custom_name) AS item_name FROM queue_jobs q
      LEFT JOIN items i ON q.item_id = i.id
     WHERE q.id = ?
  `).get(jobId);

  if (!entry) {
    const err = new Error('That print job is not here any more');
    err.status = 404;
    throw err;
  }

  const at = JOB_CHAIN.indexOf(entry.status);
  if (at === -1) {
    const err = new Error(`${entry.item_name} was cancelled`);
    err.status = 400;
    throw err;
  }

  const target = to || JOB_CHAIN[at + 1];
  if (!target) {
    const err = new Error(`${entry.item_name} is already printed`);
    err.status = 400;
    throw err;
  }
  const toIndex = JOB_CHAIN.indexOf(target);
  if (toIndex === -1) {
    const err = new Error(`"${target}" is not something a print job can be`);
    err.status = 400;
    throw err;
  }
  if (toIndex <= at) {
    const err = new Error(
      at === JOB_CHAIN.length - 1
        ? `${entry.item_name} is already printed`
        : `${entry.item_name} is already ${entry.status === 'post_processing' ? 'in finishing' : entry.status}`
    );
    err.status = 400;
    throw err;
  }

  db.transaction(() => {
    db.prepare(`
      UPDATE queue_jobs
         SET status = ?,
             started_at = IFNULL(started_at, CURRENT_TIMESTAMP),
             completed_at = CASE WHEN ? = 'done' THEN CURRENT_TIMESTAMP ELSE completed_at END,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
    `).run(target, target, entry.id);

    // Reaching done is what puts the units on the shelf and takes the filament
    // off the spools — the same thing the Queue tab does, by the same path.
    if (target === 'done') completeJob(entry);
  })();

  // Starting from the order card means the order is in production, the same as
  // starting it anywhere else.
  if (target === 'printing') {
    flow.advanceTo(entry.order_id, 'in_production', { source, note: `${entry.item_name} started` });
  }
  settleOrder(entry.order_id);

  return {
    job: db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(entry.id),
    message: `${entry.item_name} ${JOB_SAID[target] || target}`,
  };
}

module.exports = {
  completeJob, completeEntry, completeFromPicks, drawFilament,
  settleOrder, advanceJob, JOB_CHAIN,
};
