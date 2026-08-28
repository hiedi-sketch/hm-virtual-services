const db = require('../db/database');
const { estimatedMinutes } = require('../utils/planning');
const { indexOf, nextStage, stageInfo, isValid, CHAIN } = require('../utils/order-stages');

/**
 * Moving an order along happens from three places — a scan of the printed
 * ticket, a button in the app, and the queue finishing a job — so the rules
 * live here rather than in whichever route got there first.
 */

/** A scan that lands twice in this many seconds is one scan, not two. */
const DOUBLE_SCAN_SECONDS = 8;

function logEvent(orderId, from, to, source = 'manual', note = null) {
  db.prepare(`
    INSERT INTO order_events (order_id, from_status, to_status, source, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(orderId, from || null, to, source, note);
}

function events(orderId, limit = 20) {
  return db.prepare('SELECT * FROM order_events WHERE order_id = ? ORDER BY id DESC LIMIT ?')
    .all(orderId, limit);
}

/**
 * Push every printable line of an order into the production queue, skipping
 * anything already there. Tools are not printed, so they never queue.
 */
function enqueueOrder(orderId, priority = 'normal') {
  const lines = db.prepare(`
    SELECT oi.*, i.item_type FROM order_items oi
      JOIN items i ON oi.item_id = i.id
     WHERE oi.order_id = ? AND i.item_type <> 'tool'
  `).all(orderId);

  const already = db.prepare(
    "SELECT COUNT(*) AS count FROM queue_jobs WHERE order_item_id = ? AND status <> 'cancelled'"
  );
  const insert = db.prepare(`
    INSERT INTO queue_jobs (order_id, order_item_id, item_id, quantity, priority, position, estimated_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let position = db.prepare('SELECT IFNULL(MAX(position), 0) AS max FROM queue_jobs').get().max;
  let added = 0;

  for (const line of lines) {
    if (already.get(line.id).count > 0) continue;
    position += 1;
    const minutes = estimatedMinutes({ item_id: line.item_id, quantity: line.quantity, estimated_minutes: null });
    insert.run(orderId, line.id, line.item_id, line.quantity, priority, position, minutes);
    added += 1;
  }
  return added;
}

/**
 * Put an order at a given stage and do whatever that stage implies. Reaching
 * `queued` is what actually queues the work, and reaching `shipped` is what
 * dates it — so the ticket and the shop never disagree about what happened.
 */
function setStatus(orderId, to, { source = 'manual', note = null, priority = 'normal' } = {}) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }
  if (!isValid(to)) {
    const err = new Error(`"${to}" is not a stage an order can be at`);
    err.status = 400;
    throw err;
  }

  if (order.status === to) {
    return { order, moved: false, queued: 0, message: `Already at ${stageInfo(to).label.toLowerCase()}` };
  }

  let queued = 0;
  const apply = db.transaction(() => {
    // Entering the queue stage from anywhere is what puts the work in front of
    // a printer. Doing it here means the ticket scan and the button agree.
    if (to === 'queued') queued = enqueueOrder(order.id, priority);

    const shippedDate = to === 'shipped'
      ? (order.shipped_date || new Date().toISOString().slice(0, 10))
      : order.shipped_date;

    db.prepare(
      'UPDATE orders SET status = ?, shipped_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(to, shippedDate, order.id);

    logEvent(order.id, order.status, to, source, note);
  });
  apply();

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  const label = stageInfo(to).label;
  return {
    order: updated,
    moved: true,
    queued,
    message: queued ? `${label} — ${queued} item(s) queued` : label,
  };
}

/**
 * One stage along the chain. Used by the scanner, where the whole point is
 * that she does not have to say where it is going.
 */
function advance(orderId, { source = 'scan', note = null, guardDoubleScan = false } = {}) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }

  // Two reads of the same label in the same moment are one intent. Without
  // this a ticket held under the camera walks the whole chain.
  if (guardDoubleScan) {
    const last = db.prepare(`
      SELECT *, CAST((julianday('now') - julianday(created_at)) * 86400 AS REAL) AS seconds_ago
        FROM order_events WHERE order_id = ? ORDER BY id DESC LIMIT 1
    `).get(order.id);
    if (last && last.source === 'scan' && last.seconds_ago < DOUBLE_SCAN_SECONDS) {
      return {
        order,
        moved: false,
        queued: 0,
        message: `Already moved to ${stageInfo(order.status)?.label.toLowerCase() || order.status}`,
      };
    }
  }

  const to = nextStage(order.status);
  if (!to) {
    const at = indexOf(order.status);
    const err = new Error(
      at === CHAIN.length - 1
        ? 'That order is already shipped'
        : `A ${stageInfo(order.status)?.label.toLowerCase() || order.status} order does not move on by scanning`
    );
    err.status = 400;
    throw err;
  }

  return setStatus(order.id, to, { source, note });
}

/**
 * Nudge an order forward from something the shop did rather than something she
 * scanned — never backwards, and never past where she has already taken it.
 */
function advanceTo(orderId, to, { source = 'app', note = null } = {}) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  if (indexOf(order.status) === -1) return null;          // cancelled or completed
  if (indexOf(to) <= indexOf(order.status)) return null;  // already there or past it
  return setStatus(orderId, to, { source, note });
}

module.exports = { logEvent, events, enqueueOrder, setStatus, advance, advanceTo, DOUBLE_SCAN_SECONDS };
