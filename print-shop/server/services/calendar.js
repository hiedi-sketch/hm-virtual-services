const db = require('../db/database');
const { shopToday } = require('../utils/planning');

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
function fortnight(days = 14, from = null) {
  // Her today, not the server's. A sheet that turns over at six in the evening
  // because the server is already on tomorrow is a sheet she cannot trust.
  const start = from ? new Date(`${toISO(from)}T00:00:00Z`) : shopToday();
  const today = toISO(start);
  const last = toISO(addDays(start, days - 1));

  const all = rows();
  const byDay = new Map();
  for (let i = 0; i < days; i += 1) {
    const date = toISO(addDays(start, i));
    byDay.set(date, { date, orders: [], units: 0, today: date === today });
  }

  const overdue = [];
  const withCarrier = [];
  const later = [];
  const undated = [];

  for (const order of all) {
    const due = order.promised_ship_date;
    if (!due) { undated.push(order); continue; }
    if (due < today) {
      // Boxed, labelled and in the Mail Bin: late by the calendar, but not
      // late in any way she can do something about — it is the carrier's turn.
      // Listing it as overdue beside work that really is waiting on her buries
      // the orders that need her under ones that do not.
      (order.status === 'mail_bin' ? withCarrier : overdue).push(order);
      continue;
    }
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
    // Past its date and gone as far as she can take it. Kept rather than
    // dropped: a parcel the carrier has not collected in three days is worth
    // noticing, and nothing else on the page would say so.
    with_carrier: withCarrier,
    later,
    undated,
    // What the sheet is actually promising, so the header can say it without
    // the reader adding up fourteen boxes. What is waiting on a carrier is not
    // counted — these are the numbers for what she still has to do.
    order_count: inWindow.reduce((n, d) => n + d.orders.length, 0) + overdue.length,
    unit_count: inWindow.reduce((n, d) => n + d.units, 0)
      + overdue.reduce((n, o) => n + o.units, 0),
    // Every channel on the sheet, for the key along the bottom.
    channels: [...new Set(all.map((o) => o.channel))].sort(),
  };
}

module.exports = { fortnight };
