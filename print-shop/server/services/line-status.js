const db = require('../db/database');
const allocation = require('./allocation');

/**
 * Where one product on one order has got to, and moving it by hand.
 *
 * Five states, because five is what there is to know standing at the bench:
 *
 *   Waiting    nothing made, nothing queued — it is on the To Print list
 *   Queued     it has a job on the Print Queue, waiting its turn
 *   Printing   it is on a printer now
 *   Finishing  off the printer, being cleaned up, trimmed, assembled
 *   Printed    its units exist: the job is done, or the shelf already had them
 *
 * Finishing is not a new idea, only a newly visible one. A print job has had a
 * post-processing state since the Print Queue learned to move a plate to the
 * bench, and this read it as still printing — so a line said Printing with a
 * printer beside it while the thing was sitting on the bench being sanded.
 *
 * The status is not stored. It is read off the job and the allocation, so it
 * cannot disagree with the queue or the shelf — and setting it does the thing
 * the status describes rather than writing the word down.
 */

const ACTIVE = "('queued','printing','post_processing')";
const STATUSES = ['waiting', 'queued', 'printing', 'finishing', 'printed'];
const LABEL = {
  waiting: 'waiting', queued: 'queued', printing: 'printing',
  finishing: 'being finished', printed: 'printed',
};

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
  // On a printer beats off it: a line split across two plates, one still
  // running and one on the bench, is a line that is still printing.
  if (jobs.some((j) => j.status === 'printing')) return 'printing';
  if (jobs.some((j) => j.status === 'post_processing')) return 'finishing';
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
    const err = new Error(`"${want}" is not one of Waiting, Queued, Printing, Finishing or Printed`);
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
  } else if (want === 'finishing') {
    // Off the printer and onto the bench. Only this line's share moves: the
    // rest of the plate belongs to other orders, the same way putting a line
    // back in the queue leaves its runmates where they are.
    let existing = jobsFor(orderItemId);
    if (!existing.length) {
      flow.enqueueOrder(line.order_id, 'normal', {
        skipCovered: true, forceLineId: orderItemId, onlyLineId: orderItemId,
      });
      existing = jobsFor(orderItemId);
    }
    for (const job of existing) {
      if (job.status !== 'post_processing') {
        jobs.advanceJob(job.id, { to: 'post_processing', source: 'order' });
      }
    }
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
