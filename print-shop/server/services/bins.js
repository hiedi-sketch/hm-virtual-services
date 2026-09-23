const db = require('../db/database');

/**
 * Where an order lives between being agreed to and going out of the door.
 *
 * Six baskets on a shelf, each with its code on the front. An order is scanned
 * into one when it is confirmed, and everything printed for it goes into that
 * basket until the whole order is there and can be packed. So "where is order
 * 11011" is answered by looking at the shelf rather than remembering, and a
 * finished print has an obvious place to go.
 *
 * A bin holds one order at a time — that is the whole point of a bin — so
 * putting an order in an occupied one says whose it is rather than quietly
 * taking it over.
 */

/** Orders that are still using their bin. A shipped one has left. */
const HOLDING = "o.status NOT IN ('shipped', 'completed', 'cancelled')";

function binRow(bin) {
  if (!bin) return null;
  const order = db.prepare(`
    SELECT o.id, o.order_number, o.status, o.customer_name, o.promised_ship_date
      FROM orders o WHERE o.bin_id = ? AND ${HOLDING}
     ORDER BY o.id LIMIT 1
  `).get(bin.id);

  let contents = null;
  if (order) {
    const lines = db.prepare(`
      SELECT oi.id, oi.quantity, oi.packed_quantity, oi.description,
             i.name AS item_name, i.sku AS item_sku
        FROM order_items oi LEFT JOIN items i ON oi.item_id = i.id
       WHERE oi.order_id = ? ORDER BY oi.id
    `).all(order.id).map((line) => ({
      ...line,
      packed_quantity: Math.min(Number(line.packed_quantity) || 0, Number(line.quantity) || 0),
    }));
    const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
    const inBin = lines.reduce((sum, l) => sum + l.packed_quantity, 0);
    contents = { lines, total, in_bin: inBin, complete: total > 0 && inBin >= total };
  }

  return { ...bin, order: order || null, contents, empty: !order };
}

/** Every bin, in shelf order, with whatever is sitting in it. */
function list() {
  return db.prepare('SELECT * FROM bins WHERE is_active = 1 ORDER BY position, id').all().map(binRow);
}

function byCode(code) {
  const clean = String(code || '').trim();
  if (!clean) return null;
  const bin = db.prepare('SELECT * FROM bins WHERE code = ? AND is_active = 1').get(clean);
  return bin ? binRow(bin) : null;
}

function byId(id) {
  const bin = db.prepare('SELECT * FROM bins WHERE id = ?').get(id);
  return bin ? binRow(bin) : null;
}

/** The bin an order is in, if it is in one. */
function forOrder(orderId) {
  const order = db.prepare('SELECT bin_id FROM orders WHERE id = ?').get(orderId);
  if (!order?.bin_id) return null;
  const bin = db.prepare('SELECT * FROM bins WHERE id = ?').get(order.bin_id);
  return bin ? { id: bin.id, code: bin.code, label: bin.label } : null;
}

/**
 * Put an order in a bin, by the code scanned off the front of it.
 *
 * An order already in another bin is moved rather than duplicated, because it
 * is one physical pile of things and it can only be in one place.
 */
function assign(orderId, code) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }
  if (['shipped', 'completed', 'cancelled'].includes(order.status)) {
    const err = new Error(`${order.order_number} has already gone — it does not need a bin`);
    err.status = 400;
    throw err;
  }

  const bin = db.prepare('SELECT * FROM bins WHERE code = ? AND is_active = 1').get(String(code || '').trim());
  if (!bin) {
    const err = new Error(`${String(code || '').trim() || 'That code'} is not one of the bins`);
    err.status = 404;
    throw err;
  }

  const holder = db.prepare(`
    SELECT o.id, o.order_number FROM orders o
     WHERE o.bin_id = ? AND o.id <> ? AND ${HOLDING}
     LIMIT 1
  `).get(bin.id, order.id);
  if (holder) {
    const err = new Error(`${bin.label} already has ${holder.order_number} in it`);
    err.status = 400;
    throw err;
  }

  const from = order.bin_id ? db.prepare('SELECT label FROM bins WHERE id = ?').get(order.bin_id) : null;
  db.prepare('UPDATE orders SET bin_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(bin.id, order.id);

  return {
    bin: byId(bin.id),
    moved_from: from?.label || null,
    message: from && from.label !== bin.label
      ? `${order.order_number} moved from ${from.label} to ${bin.label}`
      : `${order.order_number} is in ${bin.label}`,
  };
}

/** Take an order out of its bin — on shipping, or because she emptied it. */
function release(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order?.bin_id) return null;
  const bin = db.prepare('SELECT label FROM bins WHERE id = ?').get(order.bin_id);
  db.prepare('UPDATE orders SET bin_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(order.id);
  return { label: bin?.label || null };
}

/**
 * Put finished units into the bin: the scan that happens with the prints still
 * warm in one hand and the scanner in the other.
 *
 * The count goes on the order line, which is the same count the packing check
 * reads later — a thing in the bin is a thing in the box, and two separate
 * tallies of it would be two chances to disagree.
 */
function putIn(orderId, { itemId = null, orderItemId = null, quantity = 1, code = null } = {}) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }

  // A code was scanned: it has to be this order's bin, or the units are going
  // in the wrong basket and nothing should be recorded.
  if (code) {
    const scanned = db.prepare('SELECT * FROM bins WHERE code = ? AND is_active = 1').get(String(code).trim());
    if (!scanned) {
      const err = new Error(`${String(code).trim()} is not one of the bins`);
      err.status = 404;
      throw err;
    }
    if (!order.bin_id) {
      const err = new Error(`${order.order_number} has no bin yet — scan one to give it ${scanned.label}`);
      err.status = 400;
      throw err;
    }
    if (scanned.id !== order.bin_id) {
      const holds = db.prepare('SELECT label FROM bins WHERE id = ?').get(order.bin_id);
      const err = new Error(`${order.order_number} lives in ${holds?.label} — that is ${scanned.label}`);
      err.status = 400;
      throw err;
    }
  }

  const line = orderItemId
    ? db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?').get(orderItemId, orderId)
    : db.prepare('SELECT * FROM order_items WHERE order_id = ? AND item_id = ? ORDER BY id').get(orderId, itemId);

  if (!line) {
    const err = new Error('That product is not on this order');
    err.status = 400;
    throw err;
  }

  const wanted = Number(line.quantity) || 0;
  const already = Math.min(Number(line.packed_quantity) || 0, wanted);
  const adding = Math.max(0, Number(quantity) || 0);
  const now = Math.min(wanted, already + adding);

  db.prepare('UPDATE order_items SET packed_quantity = ? WHERE id = ?').run(now, line.id);

  const bin = forOrder(orderId);
  const name = db.prepare('SELECT name FROM items WHERE id = ?').get(line.item_id)?.name
    || line.description || 'Item';

  return {
    bin,
    order_item_id: line.id,
    item_name: name,
    added: now - already,
    in_bin: now,
    quantity: wanted,
    message: bin
      ? `${now} of ${wanted} ${name} in ${bin.label}`
      : `${now} of ${wanted} ${name} set aside`,
  };
}

module.exports = { list, byCode, byId, forOrder, assign, release, putIn };
