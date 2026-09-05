const db = require('../db/database');
const { estimatedMinutes, filamentSummary } = require('../utils/planning');
const { filamentDemandForItem } = require('../utils/costing');
const { suggestSpools } = require('../utils/picklist');
const flow = require('./order-flow');

/**
 * Printing one product against every order waiting for it.
 *
 * A plate holds what a plate holds, not what one order asked for. So when a
 * product's barcode is scanned at the printer the question is not "which order
 * is this" but "how many of these does the whole shop owe" — and then, once
 * they come off, which orders those units belong to.
 *
 * Answering the first question is `demandFor`. Answering the second is
 * `startRun`, which fills whole order lines oldest promise first and puts any
 * remainder on the shelf as stock.
 */

/** Orders that still owe goods. Shipped, completed and cancelled owe nothing. */
const OPEN = "o.status NOT IN ('shipped', 'completed', 'cancelled')";

/**
 * Every open order line for one product, with the print job each line has (if
 * any), soonest promise first. A line with no job has not reached the queue;
 * a line whose job is `queued` is waiting for a printer.
 */
function openLines(itemId) {
  return db.prepare(`
    SELECT o.id AS order_id, o.order_number, o.status AS order_status, o.customer_name,
           o.order_date, o.promised_ship_date,
           oi.id AS order_item_id, oi.quantity,
           q.id AS job_id, q.status AS job_status
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN queue_jobs q ON q.order_item_id = oi.id AND q.status <> 'cancelled'
     WHERE oi.item_id = ? AND ${OPEN}
     ORDER BY IFNULL(o.promised_ship_date, '9999-12-31'), o.order_date, o.id
  `).all(itemId);
}

/** A line nothing has started printing yet. */
const notStarted = (line) => !line.job_status || line.job_status === 'queued';

/**
 * How many of a product the shop owes, what is already on its way, and what is
 * worth putting on the plate.
 */
function demandFor(itemId) {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  if (!item) return null;

  const lines = openLines(itemId);
  const sum = (rows) => rows.reduce((total, row) => total + (Number(row.quantity) || 0), 0);

  const needed = sum(lines);
  const waiting = sum(lines.filter(notStarted));
  const onHand = Number(item.qty_on_hand) || 0;

  // Work already on a plate — for an order or for the shelf — counts against
  // what still has to be printed, or she prints the same batch twice.
  const printing = db.prepare(`
    SELECT IFNULL(SUM(quantity), 0) AS quantity FROM queue_jobs
     WHERE item_id = ? AND status IN ('printing', 'post_processing')
  `).get(itemId).quantity;

  const shortfall = Math.max(0, needed - onHand);

  return {
    item: {
      id: item.id,
      name: item.name,
      sku: item.sku,
      barcode: item.barcode,
      item_type: item.item_type,
      image_url: item.image_url,
      print_time_minutes: item.print_time_minutes,
    },
    on_hand: onHand,
    needed,
    waiting,
    printing,
    shortfall,
    // What is left to print once the shelf and the plates are counted. Never
    // less than one: she is standing at a printer about to print something.
    suggested: Math.max(1, shortfall - printing),
    filaments: filamentsFor(itemId),
    order_count: new Set(lines.map((l) => l.order_id)).size,
    orders: lines.map((line) => ({
      ...line,
      started: !notStarted(line),
    })),
  };
}

/**
 * The filament a product is made of — colour by colour, with the spool to load.
 *
 * Read at the printer, before anything is sliced: what to put in the machine,
 * how much of it a run of this size will eat, and whether the shelf can cover
 * it. Grams are per unit; the run's own total is worked out against whatever
 * quantity she settles on.
 */
function filamentsFor(itemId) {
  const perUnit = filamentDemandForItem(itemId);

  return Object.entries(perUnit)
    .map(([id, gramsPerUnit]) => {
      const [f] = filamentSummary(Number(id));
      if (!f) return null;

      // Asking for a single gram names the spool that would be reached for
      // first — the oldest open one, or a sealed one that has to be opened.
      const [next] = suggestSpools(f.id, 1);
      const spool = next
        ? db.prepare('SELECT location FROM filament_spools WHERE id = ?').get(next.spool_id)
        : null;

      return {
        id: f.id,
        brand: f.brand,
        material_type: f.material_type,
        color_name: f.color_name,
        color_hex: f.color_hex,
        grams_per_unit: gramsPerUnit,
        grams_on_hand: f.grams_on_hand,
        spools_opened: f.spools_opened,
        spools_new: f.spools_new,
        // How many units the shelf could cover on this colour alone.
        units_from_stock: gramsPerUnit > 0 ? Math.floor(f.grams_on_hand / gramsPerUnit) : null,
        next_spool: next && {
          spool_code: next.spool_code,
          status: next.status,
          needs_opening: next.needs_opening,
          grams_available: next.grams_available,
          location: spool?.location || null,
        },
      };
    })
    .filter(Boolean)
    // Most-used colour first: that is the one being loaded.
    .sort((a, b) => b.grams_per_unit - a.grams_per_unit);
}

function requireItem(itemId) {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  if (!item) {
    const err = new Error('Item not found');
    err.status = 404;
    throw err;
  }
  if (item.item_type === 'tool') {
    const err = new Error('Tools are not printed');
    err.status = 400;
    throw err;
  }
  return item;
}

/**
 * Start a print run of `quantity` units.
 *
 * The run fills whole order lines, soonest promise first, taking a line only
 * when the run covers all of it — half a line printed is not a line that can
 * ship, and splitting one would leave a job that looks started but is not.
 * Whatever the orders do not take becomes a stock job, so a plate printed six
 * up against two orders of two still puts the other two on the shelf.
 */
function startRun(itemId, quantity, { source = 'scan', printer = null, filamentId = null } = {}) {
  const item = requireItem(itemId);

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    const err = new Error('Say how many you are printing');
    err.status = 400;
    throw err;
  }

  const started = [];
  let remaining = qty;

  for (const line of openLines(itemId).filter(notStarted)) {
    const lineQty = Number(line.quantity) || 0;
    if (!lineQty || lineQty > remaining) continue;  // a bigger line waits for a bigger run
    try {
      flow.startProduction(line.order_id, { orderItemId: line.order_item_id, source });
    } catch {
      continue;  // it moved on while she was reading the popup
    }
    remaining -= lineQty;
    started.push({
      order_id: line.order_id,
      order_number: line.order_number,
      customer_name: line.customer_name,
      promised_ship_date: line.promised_ship_date,
      quantity: lineQty,
    });
    if (remaining <= 0) break;
  }

  // The rest of the plate is stock: nobody has bought it yet, but it is being
  // printed, so the queue should say so and the shelf should get it when done.
  let stockJob = null;
  if (remaining > 0) {
    const position = db.prepare('SELECT IFNULL(MAX(position), 0) AS max FROM queue_jobs').get().max + 1;
    const info = db.prepare(`
      INSERT INTO queue_jobs (item_id, quantity, status, position, estimated_minutes, printer, filament_id, started_at, notes)
      VALUES (?, ?, 'printing', ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
    `).run(
      item.id,
      remaining,
      position,
      estimatedMinutes({ item_id: item.id, quantity: remaining, estimated_minutes: null }),
      printer,
      filamentId,
      'For stock',
    );
    stockJob = { id: info.lastInsertRowid, quantity: remaining };
  }

  return {
    item: { id: item.id, name: item.name, sku: item.sku },
    printing: qty,
    orders: started,
    stock_quantity: remaining,
    stock_job: stockJob,
    demand: demandFor(item.id),
  };
}

/**
 * Put every open order for a product into the queue without starting anything
 * — for the scan that says "I know these are coming, line them up".
 */
function queueDemand(itemId, { source = 'scan' } = {}) {
  const item = requireItem(itemId);

  const queued = [];
  for (const line of openLines(itemId).filter((l) => !l.job_status)) {
    if (queued.some((q) => q.order_id === line.order_id)) continue;
    // An order sitting at New has not been confirmed yet; queueing it walks it
    // through confirmed on the way, which is what the stage chain is for.
    const moved = flow.advanceTo(line.order_id, 'queued', { source, note: `${item.name} queued from a scan` });
    if (!moved) flow.enqueueOrder(line.order_id);  // already past queued: just make the job
    queued.push({
      order_id: line.order_id,
      order_number: line.order_number,
      quantity: Number(line.quantity) || 0,
    });
  }

  return { item: { id: item.id, name: item.name }, queued, demand: demandFor(item.id) };
}

module.exports = { demandFor, startRun, queueDemand, openLines, filamentsFor };
