const db = require('../db/database');

/**
 * The next fortnight of promises, by the day they are due.
 *
 * The orders page answers "what is this order". This answers the question
 * asked with a coffee in one hand: what is due, and when. Nothing is stored —
 * it is read fresh every time, so an order that ships at ten o'clock is off
 * the sheet by ten past.
 */

/** Orders that still owe something. A shipped one is somebody else's problem. */
const OUTSTANDING = "o.status NOT IN ('shipped', 'completed', 'cancelled')";

const toISO = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);

function rows() {
  return db.prepare(`
    SELECT o.id, o.order_number, o.status, o.channel, o.order_type,
           o.customer_name, o.promised_ship_date,
           IFNULL(SUM(oi.quantity), 0) AS units,
           COUNT(oi.id) AS lines
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE ${OUTSTANDING}
     GROUP BY o.id
     ORDER BY IFNULL(o.promised_ship_date, '9999-12-31'), o.order_number
  `).all().map((o) => ({
    ...o,
    units: Number(o.units) || 0,
    channel: o.channel || 'direct',
  }));
}

/**
 * `days` days from today, each with what is promised on it — plus the two
 * buckets a fortnight cannot hold: what is already late, and what is promised
 * beyond the end of the sheet.
 */
function fortnight(days = 14, from = new Date()) {
  const start = new Date(`${toISO(from)}T00:00:00`);
  const today = toISO(start);
  const last = toISO(addDays(start, days - 1));

  const all = rows();
  const byDay = new Map();
  for (let i = 0; i < days; i += 1) {
    const date = toISO(addDays(start, i));
    byDay.set(date, { date, orders: [], units: 0, today: date === today });
  }

  const overdue = [];
  const later = [];
  const undated = [];

  for (const order of all) {
    const due = order.promised_ship_date;
    if (!due) { undated.push(order); continue; }
    if (due < today) { overdue.push(order); continue; }
    if (due > last) { later.push(order); continue; }
    const day = byDay.get(due);
    day.orders.push(order);
    day.units += order.units;
  }

  const inWindow = [...byDay.values()];
  return {
    from: today,
    to: last,
    days: inWindow,
    overdue,
    later,
    undated,
    // What the sheet is actually promising, so the header can say it without
    // the reader adding up fourteen boxes.
    order_count: inWindow.reduce((n, d) => n + d.orders.length, 0) + overdue.length,
    unit_count: inWindow.reduce((n, d) => n + d.units, 0)
      + overdue.reduce((n, o) => n + o.units, 0),
    // Every channel on the sheet, for the key along the bottom.
    channels: [...new Set(all.map((o) => o.channel))].sort(),
  };
}

module.exports = { fortnight };
