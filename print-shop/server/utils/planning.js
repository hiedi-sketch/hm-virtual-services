const db = require('../db/database');
const {
  getSettings,
  computeItemCost,
  filamentDemandForItem,
  materialDemandForItem,
  materialUnitCost,
  round2,
} = require('./costing');

const PRIORITY_RANK = { rush: 0, normal: 1, low: 2 };
const ACTIVE_QUEUE_STATUSES = ['queued', 'printing', 'post_processing'];

/**
 * What is actually waiting for a printer, or on one.
 *
 * A job in finishing is not in the print queue any more: it has come off the
 * bed and is on the bench, where the Finishing bin lists it. Leaving it on the
 * queue put a "Mark done" button next to work that only needed taking off the
 * printer — which is how a plate got marked finished, and its units went onto
 * the shelf, before anyone had touched it. It also charged the queue's hours
 * for printer time that had already been spent.
 *
 * It stays in ACTIVE_QUEUE_STATUSES because its filament has not been taken
 * off the spools yet — that happens at done — so the shop is still counting on
 * having it.
 */
const PRINTER_QUEUE_STATUSES = ['queued', 'printing'];

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const toISODate = (d) => new Date(d).toISOString().slice(0, 10);
const today = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00');

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

/** Active queue rows, in the order they will actually be printed. */
function activeQueue() {
  const rows = db
    .prepare(
      `SELECT q.*, IFNULL(i.name, q.custom_name) AS item_name, i.sku AS item_sku,
              i.print_time_minutes, i.units_per_print, q.item_id IS NULL AS is_custom,
              o.order_number, o.customer_name, o.order_date,
              o.promised_ship_date, o.status AS order_status
         FROM queue_jobs q
         LEFT JOIN items i ON q.item_id = i.id
         LEFT JOIN orders o ON q.order_id = o.id
        WHERE q.status IN (${ACTIVE_QUEUE_STATUSES.map(() => '?').join(',')})`
    )
    .all(...ACTIVE_QUEUE_STATUSES);

  const sorted = rows.sort((a, b) => {
    const p = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (p !== 0) return p;
    if (a.position !== b.position) return (a.position || 0) - (b.position || 0);
    return a.id - b.id;
  });

  return groupRuns(sorted);
}

/** Least advanced first: a run is only started when all of it is. */
const RUN_RANK = { queued: 0, printing: 1, post_processing: 2 };

/**
 * Jobs queued in one go are one plate, so the queue shows them as one job.
 *
 * Nine Fox openers is nine on the bed, whether they are three for Susie, six
 * for Pam, or one for the shelf — and a queue that lists those as three jobs
 * is describing the paperwork rather than the work. The shares are kept, and
 * listed underneath, because that is what comes off the plate and goes where.
 *
 * A job with no run behind it — started from an order, or made before runs
 * existed — is a run of one, so nothing has to know the difference.
 */
function groupRuns(rows) {
  const runs = new Map();

  for (const row of rows) {
    const key = row.run_id || `job:${row.id}`;
    const run = runs.get(key);
    if (!run) {
      runs.set(key, { key, rows: [row] });
      continue;
    }
    run.rows.push(row);
  }

  return [...runs.values()].map(({ key, rows: group }) => {
    const first = group[0];
    const quantity = group.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

    // What each order gets off this plate, and what is left for the shelf.
    const parts = group.map((r) => ({
      job_id: r.id,
      order_id: r.order_id || null,
      order_item_id: r.order_item_id || null,
      order_number: r.order_number || null,
      customer_name: r.customer_name || null,
      // Its own dates, not the plate's first order's — the turnaround floor a
      // projection is measured from is per order.
      order_date: r.order_date || null,
      promised_ship_date: r.promised_ship_date || null,
      quantity: Number(r.quantity) || 0,
      stock: !r.order_id,
      // Not a stock build: a one-off goes nowhere afterwards, and a plate
      // labelled "Stock build" would have her looking for it on the shelf.
      custom: !r.item_id,
    })).sort((a, b) => {
      if (a.stock !== b.stock) return a.stock ? 1 : -1;   // the shelf goes last
      return (a.promised_ship_date || '9999-12-31').localeCompare(b.promised_ship_date || '9999-12-31');
    });

    const status = group
      .map((r) => r.status)
      .sort((a, b) => (RUN_RANK[a] ?? 0) - (RUN_RANK[b] ?? 0))[0];

    return {
      ...first,
      // The plate's own figures, not the first share's.
      id: first.id,
      run_id: row_run_id(key),
      job_ids: group.map((r) => r.id),
      quantity,
      status,
      // Her figure for this plate if she has given one, and otherwise cleared
      // so the schedule works one out for the whole plate — nine in a run is
      // not three runs of three, and units_per_print is why it is not.
      //
      // A one-off is the exception, because there is nothing to work one out
      // from: its minutes came off her slicer and clearing them would price the
      // job at nothing and quietly shorten the whole queue.
      estimated_minutes: first.print_minutes_override
        ?? (first.item_id ? null : group.reduce((sum, r) => sum + (Number(r.estimated_minutes) || 0), 0)),
      print_minutes_override: first.print_minutes_override ?? null,
      parts,
      order_count: parts.filter((p) => !p.stock).length,
      stock_quantity: parts.filter((p) => p.stock).reduce((sum, p) => sum + p.quantity, 0),
    };
  });
}

const row_run_id = (key) => (key.startsWith('job:') ? null : key);

function estimatedMinutes(row) {
  if (row.estimated_minutes != null) return row.estimated_minutes;
  // A one-off has no recipe to cost, so its time is whatever she typed. If she
  // typed none it is zero rather than a guess — the queue would rather be short
  // than invent hours for a test print.
  if (!row.item_id) return 0;
  const perUnit = computeItemCost(row.item_id)?.print_minutes_per_unit || 0;
  return perUnit * (row.quantity || 0);
}

/**
 * Walk the queue in print order, accumulating machine hours to work out when
 * each job finishes and therefore when each order can ship.
 */
function scheduleQueue(settings = getSettings()) {
  const capacityPerDay =
    Math.max(1, settings.print_hours_per_day) * Math.max(1, settings.printer_count);
  const start = today();
  const all = activeQueue();
  const rows = all.filter((row) => PRINTER_QUEUE_STATUSES.includes(row.status));

  let cumulativeMinutes = 0;
  const scheduled = rows.map((row, index) => {
    const minutes = estimatedMinutes(row);
    const startHours = cumulativeMinutes / 60;
    cumulativeMinutes += minutes;
    const finishHours = cumulativeMinutes / 60;

    return {
      ...row,
      sequence: index + 1,
      estimated_minutes: round2(minutes),
      estimated_hours: round2(minutes / 60),
      starts_on: toISODate(addDays(start, Math.floor(startHours / capacityPerDay))),
      prints_done_on: toISODate(addDays(start, Math.ceil(finishHours / capacityPerDay))),
      cumulative_hours: round2(finishHours),
    };
  });

  return {
    scheduled,
    // Off the printer and on the bench: not on the queue, but its order still
    // has to ship, so it carries a finish date of today for the projection.
    finishing: all.filter((row) => row.status === 'post_processing').map((row) => ({
      ...row,
      estimated_minutes: round2(estimatedMinutes(row)),
      prints_done_on: toISODate(start),
    })),
    capacity_hours_per_day: capacityPerDay,
    queue_hours: round2(cumulativeMinutes / 60),
  };
}

/**
 * Projected ship date per order: when the last job for that order comes off
 * the printer, plus finishing time — never earlier than the promised turnaround
 * floor. Flags anything that would blow past the turnaround window.
 */
function orderProjections(settings = getSettings()) {
  const { scheduled, finishing, capacity_hours_per_day, queue_hours } = scheduleQueue(settings);
  const byOrder = new Map();

  // Work on the bench counts towards when an order ships even though it is off
  // the queue — otherwise an order with nothing left to print would lose its
  // projected date entirely the moment its last plate came off.
  //
  // Every order on a plate, not just the first. A plate is one entry carrying
  // several orders' shares, and reading only its own order_id gave the second
  // and third orders on it no projected date at all — they simply were not in
  // the list, which reads as nothing to worry about rather than as a gap.
  for (const row of [...scheduled, ...finishing]) {
    const parts = row.parts?.length ? row.parts.filter((p) => p.order_id) : (row.order_id ? [row] : []);
    for (const part of parts) {
      const current = byOrder.get(part.order_id);
      if (current && current.prints_done_on >= row.prints_done_on) continue;
      byOrder.set(part.order_id, {
        order_id: part.order_id,
        order_number: part.order_number ?? row.order_number,
        customer_name: part.customer_name ?? row.customer_name,
        order_date: part.order_date ?? row.order_date,
        promised_ship_date: part.promised_ship_date ?? row.promised_ship_date,
        prints_done_on: row.prints_done_on,
      });
    }
  }

  const projections = [...byOrder.values()].map((o) => {
    const printsDone = new Date(o.prints_done_on + 'T00:00:00');
    const projected = addDays(printsDone, settings.finishing_days);
    const base = o.order_date ? new Date(o.order_date + 'T00:00:00') : today();
    const floor = addDays(base, settings.turnaround_min_days);
    const deadline = addDays(base, settings.turnaround_max_days);
    const projectedShip = projected > floor ? projected : floor;

    return {
      ...o,
      projected_ship_date: toISODate(projectedShip),
      turnaround_deadline: toISODate(deadline),
      days_out: daysBetween(today(), projectedShip),
      at_risk: projectedShip > deadline,
      late_by_days: projectedShip > deadline ? daysBetween(deadline, projectedShip) : 0,
    };
  });

  return { projections, capacity_hours_per_day, queue_hours };
}

/**
 * Ship date to promise a brand-new order: the turnaround floor, pushed out if
 * the queue is already backed up beyond it.
 */
function suggestShipDate(orderDate, extraMinutes = 0, settings = getSettings()) {
  const { queue_hours, capacity_hours_per_day } = scheduleQueue(settings);
  const base = orderDate ? new Date(orderDate + 'T00:00:00') : today();
  const floor = addDays(base, settings.turnaround_min_days);
  const queueDays = Math.ceil((queue_hours + extraMinutes / 60) / capacity_hours_per_day);
  const fromQueue = addDays(today(), queueDays + settings.finishing_days);
  const suggested = fromQueue > floor ? fromQueue : floor;

  return {
    suggested_ship_date: toISODate(suggested),
    turnaround_floor: toISODate(floor),
    turnaround_deadline: toISODate(addDays(base, settings.turnaround_max_days)),
    queue_hours,
    capacity_hours_per_day,
    at_risk: suggested > addDays(base, settings.turnaround_max_days),
  };
}

/**
 * What a one-off draws, from its own pick list — the lines she wrote when she
 * added it. A run groups jobs, so every job in it is asked, not just the first.
 */
function customDemand(run) {
  const ids = run.job_ids || [run.id];
  const lines = [];
  for (const id of ids) {
    const picks = db.prepare(
      "SELECT line_type, ref_id, quantity FROM queue_picks WHERE queue_id = ? AND line_type IN ('filament','material')"
    ).all(id);
    if (picks.length) { lines.push(...picks); continue; }
    // No list yet — fall back to the job's own figures.
    const job = db.prepare('SELECT filament_id, filament_grams FROM queue_jobs WHERE id = ?').get(id);
    if (job?.filament_id && job.filament_grams) {
      lines.push({ line_type: 'filament', ref_id: job.filament_id, quantity: job.filament_grams });
    }
  }
  return lines;
}

/** Everything the active queue will consume: filament grams and material units. */
function queueDemand() {
  const rows = activeQueue();
  const filament = {};
  const materials = {};

  for (const row of rows) {
    const qty = row.quantity || 0;

    // A one-off has no recipe. What it takes is what she wrote down, which is
    // also exactly what comes off the spool when it finishes — so the queue's
    // claim on the shelf and the deduction agree by construction.
    if (!row.item_id) {
      for (const line of customDemand(row)) {
        const bucket = line.line_type === 'filament' ? filament : materials;
        bucket[line.ref_id] = (bucket[line.ref_id] || 0) + line.quantity;
      }
      continue;
    }

    const perUnitFilament = filamentDemandForItem(row.item_id);
    // A queue entry can pin a specific colour, which overrides the BOM default.
    if (row.filament_id) {
      const totalGrams = Object.values(perUnitFilament).reduce((a, b) => a + b, 0) * qty;
      filament[row.filament_id] = (filament[row.filament_id] || 0) + totalGrams;
    } else {
      for (const [fid, grams] of Object.entries(perUnitFilament)) {
        filament[fid] = (filament[fid] || 0) + grams * qty;
      }
    }
    for (const [mid, amount] of Object.entries(materialDemandForItem(row.item_id))) {
      materials[mid] = (materials[mid] || 0) + amount * qty;
    }
  }

  return { filament, materials };
}

/**
 * Filament stock picture: spools by state, grams on hand, grams the queue has
 * already spoken for, and whether that leaves enough to reorder against.
 */
function filamentSummary(filamentId = null) {
  const settings = getSettings();
  const demand = queueDemand().filament;
  const filaments = filamentId
    ? [db.prepare('SELECT * FROM filaments WHERE id = ?').get(filamentId)].filter(Boolean)
    : db.prepare('SELECT * FROM filaments ORDER BY brand, material_type, color_name').all();

  return filaments.map((f) => {
    const spools = db
      .prepare('SELECT * FROM filament_spools WHERE filament_id = ? ORDER BY id')
      .all(f.id);
    const fullGrams = (f.spool_size_kg || 1) * 1000;

    const counts = { new: 0, opened: 0, ordered: 0, empty: 0 };
    let gramsOnHand = 0;
    for (const s of spools) {
      counts[s.status] = (counts[s.status] || 0) + 1;
      if (s.status === 'new') gramsOnHand += fullGrams;
      else if (s.status === 'opened') {
        gramsOnHand += s.grams_remaining != null ? s.grams_remaining : fullGrams;
      }
    }

    const committed = demand[f.id] || 0;
    const projected = gramsOnHand - committed;
    const reorderGrams = (f.reorder_point_spools || 0) * fullGrams;
    const onOrderGrams = counts.ordered * fullGrams;

    return {
      ...f,
      full_spool_grams: fullGrams,
      spools_new: counts.new,
      spools_opened: counts.opened,
      spools_ordered: counts.ordered,
      spools_empty: counts.empty,
      grams_on_hand: round2(gramsOnHand),
      grams_committed: round2(committed),
      grams_projected: round2(projected),
      spools_on_hand: round2(gramsOnHand / fullGrams),
      spools_projected: round2(projected / fullGrams),
      reorder_grams: round2(reorderGrams),
      value_on_hand: round2((gramsOnHand / 1000) * (f.cost_per_kg || 0)),
      needs_reorder: projected <= reorderGrams && onOrderGrams <= 0,
      out_of_stock: gramsOnHand <= 0,
      short_by_grams: projected < 0 ? round2(-projected) : 0,
      spools,
    };
  });
}

function materialSummary(materialId = null) {
  const demand = queueDemand().materials;
  const materials = materialId
    ? [db.prepare('SELECT * FROM materials WHERE id = ?').get(materialId)].filter(Boolean)
    : db.prepare('SELECT * FROM materials ORDER BY category, name').all();

  return materials.map((m) => {
    const committed = demand[m.id] || 0;
    const onHand = m.qty_on_hand || 0;
    const projected = onHand - committed;
    const unitCost = materialUnitCost(m);
    return {
      ...m,
      unit_cost: round2(unitCost),
      qty_committed: round2(committed),
      qty_projected: round2(projected),
      value_on_hand: round2(onHand * unitCost),
      needs_reorder: projected <= (m.reorder_point || 0) && (m.qty_on_order || 0) <= 0,
      out_of_stock: onHand <= 0,
      short_by: projected < 0 ? round2(-projected) : 0,
    };
  });
}

module.exports = {
  activeQueue,
  scheduleQueue,
  orderProjections,
  suggestShipDate,
  queueDemand,
  filamentSummary,
  materialSummary,
  estimatedMinutes,
  toISODate,
  addDays,
  today,
  ACTIVE_QUEUE_STATUSES,
};
