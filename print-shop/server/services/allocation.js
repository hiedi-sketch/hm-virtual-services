const db = require('../db/database');

/**
 * Who gets the stock.
 *
 * A shop that prints to order still has a shelf, and a thing already on it
 * should not be printed again. So before anything is queued, what is on hand
 * is handed out across the orders waiting for it — soonest promise first,
 * because that is the order they have to go out in — and only what the shelf
 * cannot cover is printed.
 *
 * Nothing here moves stock. The units come off at shipping, as they always
 * have; this decides which lines are picked and which are made.
 */

/** Orders that still owe goods. */
const OPEN = "o.status NOT IN ('shipped', 'completed', 'cancelled')";

/**
 * Work out, for every line on every open order, where its units are coming
 * from: a job already printing, the shelf, a run going for stock, or a print
 * that still has to happen.
 *
 * Two queries and a walk, so it can be worked out fresh whenever it is asked
 * for rather than stored and drifting.
 */
function plan() {
  const lines = db.prepare(`
    SELECT oi.id, oi.order_id, oi.item_id, oi.quantity,
           o.order_number, o.status AS order_status, o.promised_ship_date, o.order_date,
           i.name AS item_name, i.sku AS item_sku, i.qty_on_hand
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN items i ON oi.item_id = i.id
     WHERE ${OPEN} AND i.item_type <> 'tool'
     ORDER BY IFNULL(o.promised_ship_date, '9999-12-31'), o.order_date, o.id, oi.id
  `).all();

  // What is already being made, split by whether it belongs to a line or to
  // the shelf. A line's own job covers that line; a stock run covers whoever
  // needs it when it lands.
  const jobs = db.prepare(`
    SELECT order_item_id, item_id, status, IFNULL(SUM(quantity), 0) AS quantity
      FROM queue_jobs
     WHERE status IN ('queued', 'printing', 'post_processing')
     GROUP BY order_item_id, item_id, status
  `).all();

  // A job waiting its turn is not the same as one on a plate. Both mean the
  // line is spoken for, but only the waiting one is still work to be done —
  // which is the whole of what the In Queue list is counting.
  const onPlate = new Map();
  const queuedUnits = new Map();
  const incomingStock = new Map();
  for (const job of jobs) {
    const quantity = Number(job.quantity) || 0;
    const started = job.status !== 'queued';
    if (!job.order_item_id) {
      if (started) incomingStock.set(job.item_id, (incomingStock.get(job.item_id) || 0) + quantity);
      continue;
    }
    const target = started ? onPlate : queuedUnits;
    target.set(job.order_item_id, (target.get(job.order_item_id) || 0) + quantity);
  }

  const shelf = new Map();
  const incoming = new Map();
  const byLine = new Map();
  const byItem = new Map();

  for (const line of lines) {
    if (!shelf.has(line.item_id)) shelf.set(line.item_id, Number(line.qty_on_hand) || 0);
    if (!incoming.has(line.item_id)) incoming.set(line.item_id, incomingStock.get(line.item_id) || 0);

    const quantity = Number(line.quantity) || 0;
    const plated = Math.min(quantity, onPlate.get(line.id) || 0);
    const queued = Math.min(quantity - plated, queuedUnits.get(line.id) || 0);
    let outstanding = quantity - plated - queued;

    // The shelf first, then a run already going for stock. Both mean "do not
    // print this"; only one of them means "go and pick it up".
    const fromShelf = Math.min(shelf.get(line.item_id), outstanding);
    shelf.set(line.item_id, shelf.get(line.item_id) - fromShelf);
    outstanding -= fromShelf;

    const fromIncoming = Math.min(incoming.get(line.item_id), outstanding);
    incoming.set(line.item_id, incoming.get(line.item_id) - fromIncoming);
    outstanding -= fromIncoming;

    const entry = {
      ...line,
      quantity,
      printing: plated,
      queued,
      from_stock: fromShelf,
      from_incoming: fromIncoming,
      to_print: outstanding,
      // Everything that has still to go on a plate for this line, whether it
      // has a job waiting or nothing at all yet.
      needs_printing: queued + outstanding,
      source: outstanding > 0 ? 'print'
        : queued > 0 ? 'queued'
          : plated > 0 ? 'printing'
            : fromShelf > 0 ? 'stock' : 'incoming',
    };
    byLine.set(line.id, entry);

    const item = byItem.get(line.item_id) || {
      item_id: line.item_id,
      name: line.item_name,
      sku: line.item_sku,
      on_hand: Number(line.qty_on_hand) || 0,
      ordered: 0,
      printing: 0,
      queued: 0,
      from_stock: 0,
      from_incoming: 0,
      to_print: 0,
      needs_printing: 0,
      order_ids: new Set(),
      earliest_due: null,
      lines: [],
    };
    item.ordered += quantity;
    item.printing += plated;
    item.queued += queued;
    item.from_stock += fromShelf;
    item.from_incoming += fromIncoming;
    item.to_print += outstanding;
    item.needs_printing += queued + outstanding;
    item.order_ids.add(line.order_id);
    if (line.promised_ship_date && (!item.earliest_due || line.promised_ship_date < item.earliest_due)) {
      item.earliest_due = line.promised_ship_date;
    }
    item.lines.push(entry);
    byItem.set(line.item_id, item);
  }

  return { byLine, byItem };
}

/** The lines of one order, with where each one's units are coming from. */
function forOrder(orderId, prepared = null) {
  const { byLine } = prepared || plan();
  const out = new Map();
  for (const entry of byLine.values()) {
    if (entry.order_id === orderId) out.set(entry.id, entry);
  }
  return out;
}

/**
 * What the shelf cannot cover on one order — the lines that have to be
 * printed, and how many of each. This is what confirming an order queues.
 */
function shortfallFor(orderId) {
  const lines = [...forOrder(orderId).values()].filter((l) => l.to_print > 0);
  return new Map(lines.map((l) => [l.id, l.to_print]));
}

module.exports = { plan, forOrder, shortfallFor };
