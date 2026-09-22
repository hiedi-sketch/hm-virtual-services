const db = require('../db/database');
const allocation = require('./allocation');

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

/** The catalogue details a row needs that the allocation does not carry. */
const catalogue = {
  get: (id) => db.prepare(
    'SELECT barcode, image_url, print_time_minutes, units_per_print FROM items WHERE id = ?'
  ).get(id),
};

/**
 * Everything ordered that still has to be printed, gathered by product.
 *
 * One row per product, however many orders asked for it, because that is how
 * it gets printed. What the shelf can already cover is picked rather than
 * printed, so it is counted here and left off the list of what to print.
 */
function inQueue() {
  const { byItem } = allocation.plan();

  // What is on a plate right now, counted from the jobs themselves: a stock
  // run belongs to nobody, but it is still the printer being busy with this
  // product, and that is what the figure on the row means.
  const plated = new Map(db.prepare(`
    SELECT item_id, IFNULL(SUM(quantity), 0) AS quantity FROM queue_jobs
     WHERE status IN ('printing', 'post_processing')
     GROUP BY item_id
  `).all().map((r) => [r.item_id, Number(r.quantity) || 0]));

  const items = [...byItem.values()].map((item) => ({
    id: item.item_id,
    name: item.name,
    sku: item.sku,
    barcode: catalogue.get(item.item_id)?.barcode || null,
    image_url: catalogue.get(item.item_id)?.image_url || null,
    print_time_minutes: catalogue.get(item.item_id)?.print_time_minutes || 0,
    units_per_print: catalogue.get(item.item_id)?.units_per_print || 1,
    on_hand: item.on_hand,
    ordered: item.ordered,
    // On a plate now — a job still waiting its turn is work, not progress.
    printing: plated.get(item.item_id) || 0,
    // What the shelf is covering, which is picked rather than printed.
    from_stock: item.from_stock,
    // Everything still to go on a plate: jobs waiting their turn, plus what
    // has no job at all yet.
    to_print: item.needs_printing,
    unqueued: item.to_print,
    covered: item.needs_printing === 0,
    order_count: item.order_ids.size,
    earliest_due: item.earliest_due,
  }));

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
    units_from_stock: items.reduce((total, i) => total + i.from_stock, 0),
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
