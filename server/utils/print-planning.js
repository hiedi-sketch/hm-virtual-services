const db = require('../db/database');
const {
  getSettings,
  computeItemCost,
  filamentDemandForItem,
  materialDemandForItem,
  materialUnitCost,
  round2,
} = require('./print-costing');

const PRIORITY_RANK = { rush: 0, normal: 1, low: 2 };
const ACTIVE_QUEUE_STATUSES = ['queued', 'printing', 'post_processing'];

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
      `SELECT q.*, i.name AS item_name, i.sku AS item_sku, i.print_time_minutes,
              i.units_per_print, o.order_number, o.customer_name, o.order_date,
              o.promised_ship_date, o.status AS order_status
         FROM print_queue q
         JOIN print_items i ON q.item_id = i.id
         LEFT JOIN print_orders o ON q.order_id = o.id
        WHERE q.status IN (${ACTIVE_QUEUE_STATUSES.map(() => '?').join(',')})`
    )
    .all(...ACTIVE_QUEUE_STATUSES);

  return rows.sort((a, b) => {
    const p = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
    if (p !== 0) return p;
    if (a.position !== b.position) return (a.position || 0) - (b.position || 0);
    return a.id - b.id;
  });
}

function estimatedMinutes(row) {
  if (row.estimated_minutes != null) return row.estimated_minutes;
  const perUnit = computeItemCost(row.item_id).print_minutes_per_unit || 0;
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
  const rows = activeQueue();

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

  return { scheduled, capacity_hours_per_day: capacityPerDay, queue_hours: round2(cumulativeMinutes / 60) };
}

/**
 * Projected ship date per order: when the last job for that order comes off
 * the printer, plus finishing time — never earlier than the promised turnaround
 * floor. Flags anything that would blow past the turnaround window.
 */
function orderProjections(settings = getSettings()) {
  const { scheduled, capacity_hours_per_day, queue_hours } = scheduleQueue(settings);
  const byOrder = new Map();

  for (const row of scheduled) {
    if (!row.order_id) continue;
    const current = byOrder.get(row.order_id);
    if (!current || row.prints_done_on > current.prints_done_on) {
      byOrder.set(row.order_id, {
        order_id: row.order_id,
        order_number: row.order_number,
        customer_name: row.customer_name,
        order_date: row.order_date,
        promised_ship_date: row.promised_ship_date,
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

/** Everything the active queue will consume: filament grams and material units. */
function queueDemand() {
  const rows = activeQueue();
  const filament = {};
  const materials = {};

  for (const row of rows) {
    const qty = row.quantity || 0;
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
    ? [db.prepare('SELECT * FROM print_filaments WHERE id = ?').get(filamentId)].filter(Boolean)
    : db.prepare('SELECT * FROM print_filaments ORDER BY brand, material_type, color_name').all();

  return filaments.map((f) => {
    const spools = db
      .prepare('SELECT * FROM print_filament_spools WHERE filament_id = ? ORDER BY id')
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
    ? [db.prepare('SELECT * FROM print_materials WHERE id = ?').get(materialId)].filter(Boolean)
    : db.prepare('SELECT * FROM print_materials ORDER BY category, name').all();

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
