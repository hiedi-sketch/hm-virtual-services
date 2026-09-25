const db = require('../db/database');
const allocation = require('./allocation');

/**
 * Where one product on one order has got to, and moving it by hand.
 *
 * Four states, because four is what there is to know standing at the bench:
 *
 *   Waiting   nothing made, nothing queued — it is on the To Print list
 *   Queued    it has a job on the Print Queue, waiting its turn
 *   Printing  it is on a printer, or off it and being finished
 *   Printed   its units exist: the job is done, or the shelf already had them
 *
 * The status is not stored. It is read off the job and the allocation, so it
 * cannot disagree with the queue or the shelf — and setting it does the thing
 * the status describes rather than writing the word down.
 */

const ACTIVE = "('queued','printing','post_processing')";
const STATUSES = ['waiting', 'queued', 'printing', 'printed'];
const LABEL = { waiting: 'waiting', queued: 'queued', printing: 'printing', printed: 'printed' };

function lineRow(orderItemId) {
  return db.prepare(`
    SELECT oi.*, o.order_number, o.status AS order_status, i.name AS item_name
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN items i ON oi.item_id = i.id
     WHERE oi.id = ?
  `).get(orderItemId);
}

function jobsFor(orderItemId) {
  return db.prepare(`SELECT * FROM queue_jobs WHERE order_item_id = ? AND status IN ${ACTIVE} ORDER BY id`)
    .all(orderItemId);
}

/** What this line reads as right now. */
function statusOf(line, plan = null) {
  const jobs = jobsFor(line.id);
  if (jobs.some((j) => j.status === 'printing' || j.status === 'post_processing')) return 'printing';
  if (jobs.length) return 'queued';

  const where = (plan || allocation.plan()).byLine.get(line.id);
  // Nothing queued and nothing left to print means the units are there —
  // printed earlier and sitting on the shelf, or already in the order's bin.
  if (where && where.needs_printing <= 0) return 'printed';
  return 'waiting';
}

/**
 * Move one product on one order to a state by hand, doing what that means.
 *
 * Printed is one way. Reaching it puts units on the shelf and takes filament
 * off the spools, and there is no honest way to walk that backwards from a
 * dropdown — the stock has moved. Correcting it is a stock adjustment in the
 * catalog, which says so rather than pretending.
 */
function setLineStatus(orderItemId, want) {
  const line = lineRow(orderItemId);
  if (!line) {
    const err = new Error('That line is not on this order');
    err.status = 404;
    throw err;
  }

  // What was asked for, before what is allowed: a word that is not one of the
  // four is a mistake worth naming as one.
  if (!STATUSES.includes(want)) {
    const err = new Error(`"${want}" is not one of Waiting, Queued, Printing or Printed`);
    err.status = 400;
    throw err;
  }

  const from = statusOf(line);
  if (from === want) return { status: from, message: `${line.item_name} is already ${LABEL[want]}` };

  if (from === 'printed' && want !== 'printed') {
    const err = new Error(
      `${line.item_name} is already printed — its units are on the shelf. Adjust the stock in the catalog if that is wrong.`
    );
    err.status = 400;
    throw err;
  }

  const flow = require('./order-flow');
  const jobs = require('./job-complete');

  if (want === 'waiting') {
    // Off the queue entirely. Only this line's share goes: the rest of the
    // plate belongs to other orders and is none of this line's business.
    const ids = jobsFor(orderItemId).map((j) => j.id);
    if (ids.length) {
      db.prepare(`DELETE FROM queue_jobs WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    }
  } else if (want === 'queued') {
    const existing = jobsFor(orderItemId);
    if (existing.length) {
      // Back off the printer and into the queue.
      db.prepare(`UPDATE queue_jobs SET status = 'queued', started_at = NULL, updated_at = CURRENT_TIMESTAMP
                   WHERE order_item_id = ? AND status IN ${ACTIVE}`).run(orderItemId);
    } else {
      flow.enqueueOrder(line.order_id, 'normal', {
        skipCovered: true, forceLineId: orderItemId, onlyLineId: orderItemId,
      });
    }
  } else if (want === 'printing') {
    flow.startProduction(line.order_id, { orderItemId, source: 'order' });
  } else if (want === 'printed') {
    const existing = jobsFor(orderItemId);
    if (!existing.length) {
      flow.enqueueOrder(line.order_id, 'normal', {
        skipCovered: true, forceLineId: orderItemId, onlyLineId: orderItemId,
      });
    }
    for (const job of jobsFor(orderItemId)) {
      jobs.advanceJob(job.id, { to: 'done', source: 'order' });
    }
  }

  const now = statusOf(lineRow(orderItemId));
  return { status: now, message: `${line.item_name} is ${LABEL[now]}` };
}

module.exports = { statusOf, setLineStatus, STATUSES, jobsFor };
