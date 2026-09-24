const db = require('../db/database');
const allocation = require('./allocation');

/**
 * The three numbers behind an order line: where its units are coming from.
 *
 * Six ordered is not six to print. Five may already be on the shelf and one on
 * a plate, and the difference is the whole of what there is left to do. So a
 * line reads "6 × Leopard Heart (5 on hand, 1 needed, 0 printing)", and the
 * three always add up to what was ordered.
 *
 * Nothing here is stored. On hand is the shelf, printing is the jobs, and
 * needed is what is left over — so the numbers cannot drift from the shop.
 * Editing them therefore means editing those things, which is what this does.
 */

function lineRow(orderItemId) {
  return db.prepare(`
    SELECT oi.*, o.order_number, o.status AS order_status,
           i.name AS item_name, i.qty_on_hand
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN items i ON oi.item_id = i.id
     WHERE oi.id = ?
  `).get(orderItemId);
}

/** Units of this line already off the printer and being finished by hand. */
function onBench(orderItemId) {
  return Number(db.prepare(`
    SELECT IFNULL(SUM(quantity), 0) AS n FROM queue_jobs
     WHERE order_item_id = ? AND status = 'post_processing'
  `).get(orderItemId).n) || 0;
}

/**
 * How big the shelf has to be for this line to draw `wanted` from it.
 *
 * Stock is one shelf, handed out soonest-promise-first, so a line only reaches
 * what the orders ahead of it did not take. Measuring what those orders draw
 * *today* is not enough: put more on the shelf and they take more of it. What
 * has to be covered is everything they could absorb — their whole order, less
 * whatever is already on a plate for them.
 *
 * Which means setting one line's figure can raise an earlier line's too. That
 * is not a side effect to hide: if the shelf really holds that many, the order
 * in front is really covered, and the message says what the shelf came to.
 */
function shelfNeededFor(itemId, lineId, wanted, plan = null) {
  const { byLine } = plan || allocation.plan();
  let ahead = 0;
  for (const [id, line] of byLine) {
    if (id === lineId) break;                       // lines come in shelf order
    if (line.item_id !== itemId) continue;
    ahead += Math.max(0, line.quantity - line.printing - line.queued);
  }
  return ahead + wanted;
}

/** The three numbers as they stand, plus what it would take to change them. */
function forLine(orderItemId, plan = null) {
  const line = lineRow(orderItemId);
  if (!line) {
    const err = new Error('That line is not on this order');
    err.status = 404;
    throw err;
  }

  const p = plan || allocation.plan();
  const where = p.byLine.get(line.id);
  const quantity = Number(line.quantity) || 0;

  return {
    order_item_id: line.id,
    item_id: line.item_id,
    item_name: line.item_name,
    quantity,
    // A run already going for stock is on a printer too, so it counts as
    // printing rather than as a fourth number nobody asked for.
    on_hand: where ? where.from_stock : 0,
    needed: where ? where.needs_printing : quantity,
    printing: where ? where.printing + where.from_incoming : 0,
    // Context for editing: the shelf as a whole, and what is spoken for.
    shelf_total: Number(line.qty_on_hand) || 0,
    on_bench: onBench(line.id),
  };
}

/**
 * Set what this line has on hand and what is on a printer; needed is whatever
 * is left of the order.
 *
 * On hand moves the shelf, because that is what on hand means — and it is
 * moved by the difference rather than set outright, so another order's claim
 * on the same shelf is not quietly taken away.
 */
function setCoverage(orderItemId, { onHand = null, printing = null, reason = 'Adjusted from the order' } = {}) {
  const before = forLine(orderItemId);
  const quantity = before.quantity;

  const wantHand = onHand == null ? before.on_hand : Math.max(0, Math.min(quantity, Number(onHand) || 0));
  const wantPrinting = printing == null ? before.printing : Math.max(0, Math.min(quantity, Number(printing) || 0));

  if (wantHand + wantPrinting > quantity) {
    const err = new Error(`${quantity} were ordered — on hand and printing cannot come to more than that`);
    err.status = 400;
    throw err;
  }
  if (wantPrinting < before.on_bench) {
    const err = new Error(`${before.on_bench} of these are already on the bench, so printing cannot go below that`);
    err.status = 400;
    throw err;
  }

  db.transaction(() => {
    // ── the shelf ──
    if (wantHand !== before.on_hand) {
      const shelf = shelfNeededFor(before.item_id, orderItemId, wantHand);
      const change = shelf - before.shelf_total;
      db.prepare('UPDATE items SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(shelf, before.item_id);
      if (change) {
        db.prepare(`INSERT INTO stock_log (entity_type, entity_id, change, reason, reference)
                    VALUES ('item', ?, ?, ?, ?)`)
          .run(before.item_id, change, reason, `order_item:${orderItemId}`);
      }
    }

    // ── what is on a plate ──
    if (wantPrinting !== before.printing) {
      const line = lineRow(orderItemId);
      const target = wantPrinting - before.on_bench;   // the bench keeps its own
      const jobs = db.prepare(`
        SELECT * FROM queue_jobs WHERE order_item_id = ? AND status = 'printing' ORDER BY id
      `).all(orderItemId);

      let left = target;
      for (const job of jobs) {
        const keep = Math.min(left, Number(job.quantity) || 0);
        left -= keep;
        if (keep > 0) db.prepare('UPDATE queue_jobs SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .run(keep, job.id);
        else db.prepare('DELETE FROM queue_jobs WHERE id = ?').run(job.id);
      }

      if (left > 0) {
        // Nothing on a plate yet, or not enough of it. A job that is already
        // running is the honest shape for units she says are printing.
        if (jobs.length) {
          const first = db.prepare("SELECT * FROM queue_jobs WHERE order_item_id = ? AND status = 'printing' ORDER BY id LIMIT 1").get(orderItemId);
          if (first) {
            db.prepare('UPDATE queue_jobs SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(left, first.id);
            left = 0;
          }
        }
        if (left > 0) {
          const position = db.prepare('SELECT IFNULL(MAX(position), 0) AS max FROM queue_jobs').get().max + 1;
          db.prepare(`INSERT INTO queue_jobs (order_id, order_item_id, item_id, quantity, status, position, started_at)
                      VALUES (?, ?, ?, ?, 'printing', ?, CURRENT_TIMESTAMP)`)
            .run(line.order_id, orderItemId, line.item_id, left, position);
        }
      }
    }
  })();

  const after = forLine(orderItemId);
  const moved = after.shelf_total !== before.shelf_total;
  return {
    ...after,
    message: `${after.on_hand} on hand, ${after.needed} needed, ${after.printing} printing`
      + (moved ? ` — the shelf now holds ${after.shelf_total}` : ''),
  };
}

module.exports = { forLine, setCoverage };
