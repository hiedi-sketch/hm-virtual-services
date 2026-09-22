const db = require('../db/database');

/**
 * The two questions a print shop asks all day: what is on the printer, and
 * what is waiting.
 *
 * Neither is answered by an order. An order is a promise to a customer; a
 * printer holds products. So both of these are counted by item across every
 * open order, which is the only shape a plate can be loaded from.
 */

/** Orders that still owe goods. */
const OPEN = "o.status NOT IN ('shipped', 'completed', 'cancelled')";

const sum = (rows, key = 'quantity') => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);

/**
 * What is on a printer now, and what has come off it and is on the bench.
 * A job with no order behind it is a stock run, and says so.
 */
function printingNow() {
  const jobs = db.prepare(`
    SELECT q.id, q.quantity, q.status, q.started_at, q.printer, q.estimated_minutes,
           i.id AS item_id, i.name AS item_name, i.sku AS item_sku, i.image_url,
           o.id AS order_id, o.order_number, o.promised_ship_date, o.customer_name
      FROM queue_jobs q
      JOIN items i ON q.item_id = i.id
      LEFT JOIN orders o ON q.order_id = o.id
     WHERE q.status IN ('printing', 'post_processing')
     ORDER BY CASE q.status WHEN 'printing' THEN 0 ELSE 1 END, q.started_at, q.id
  `).all();

  const printing = jobs.filter((j) => j.status === 'printing');
  const finishing = jobs.filter((j) => j.status === 'post_processing');

  return {
    jobs,
    printing,
    finishing,
    // The button shows one number, and it is the one that answers "is the
    // printer busy": units actually on a plate right now.
    units_printing: sum(printing),
    units_finishing: sum(finishing),
    job_count: jobs.length,
    idle: printing.length === 0,
  };
}

/**
 * Everything ordered that still has to be printed, gathered by product.
 *
 * One row per product, however many orders asked for it, because that is how
 * it gets printed. `to_print` is what is left once the shelf and the plates
 * are counted — the number that decides whether it goes on the next plate.
 */
function inQueue() {
  const rows = db.prepare(`
    SELECT i.id, i.name, i.sku, i.barcode, i.image_url, i.qty_on_hand,
           i.print_time_minutes, i.units_per_print,
           SUM(oi.quantity) AS ordered,
           COUNT(DISTINCT o.id) AS order_count,
           MIN(IFNULL(o.promised_ship_date, '9999-12-31')) AS earliest_due
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN items i ON oi.item_id = i.id
     WHERE ${OPEN} AND i.item_type <> 'tool'
     GROUP BY i.id
  `).all();

  const inProgress = db.prepare(`
    SELECT item_id, IFNULL(SUM(quantity), 0) AS quantity FROM queue_jobs
     WHERE status IN ('printing', 'post_processing')
     GROUP BY item_id
  `).all();
  const printingByItem = new Map(inProgress.map((r) => [r.item_id, Number(r.quantity) || 0]));

  const items = rows.map((row) => {
    const ordered = Number(row.ordered) || 0;
    const onHand = Number(row.qty_on_hand) || 0;
    const printing = printingByItem.get(row.id) || 0;
    return {
      ...row,
      ordered,
      on_hand: onHand,
      printing,
      // What the shelf and the plates between them cannot cover.
      to_print: Math.max(0, ordered - onHand - printing),
      covered: ordered <= onHand,
      earliest_due: row.earliest_due === '9999-12-31' ? null : row.earliest_due,
    };
  });

  // Soonest promise first; within a day, the biggest run first, because that
  // is the plate worth setting up.
  items.sort((a, b) => {
    const dueA = a.earliest_due || '9999-12-31';
    const dueB = b.earliest_due || '9999-12-31';
    if (dueA !== dueB) return dueA < dueB ? -1 : 1;
    return b.to_print - a.to_print;
  });

  // Lines that matched no catalog product cannot be printed and cannot be
  // counted. Saying how many there are keeps the list honest.
  const unmatched = db.prepare(`
    SELECT COUNT(*) AS count FROM order_items oi JOIN orders o ON oi.order_id = o.id
     WHERE ${OPEN} AND oi.item_id IS NULL
  `).get().count;

  const needing = items.filter((i) => i.to_print > 0);
  return {
    items,
    needing,
    product_count: needing.length,
    units_to_print: needing.reduce((total, i) => total + i.to_print, 0),
    units_ordered: items.reduce((total, i) => total + i.ordered, 0),
    unmatched_lines: unmatched,
  };
}

/** Both figures, for the buttons that sit at the top of every page. */
function board() {
  const printing = printingNow();
  const queue = inQueue();
  return {
    printing: {
      units: printing.units_printing,
      finishing: printing.units_finishing,
      job_count: printing.job_count,
      idle: printing.idle,
      // Enough to name what is on the printer without a second request.
      now: printing.printing.slice(0, 3).map((j) => ({ item_name: j.item_name, quantity: j.quantity })),
    },
    queue: {
      products: queue.product_count,
      units: queue.units_to_print,
    },
  };
}

module.exports = { printingNow, inQueue, board };
