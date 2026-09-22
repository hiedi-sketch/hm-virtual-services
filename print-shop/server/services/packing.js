const db = require('../db/database');
const { findItem } = require('./catalog-match');

/**
 * Checking a box against the order it is for.
 *
 * The last chance to catch a missing piece is while the box is open, so an
 * order at packing gets a list of what should be in it and a scan that ticks
 * each one off. Every scan is written down as it happens — the box is packed
 * over minutes, with interruptions, and a count that only survives while the
 * sheet is open is a count that gets lost.
 */

function lineState(line) {
  const quantity = Number(line.quantity) || 0;
  const packed = Math.min(Number(line.packed_quantity) || 0, quantity);
  return {
    ...line,
    quantity,
    packed_quantity: packed,
    remaining: Math.max(0, quantity - packed),
    packed: packed >= quantity && quantity > 0,
  };
}

/** What should be in the box, and what is in it so far. */
function packList(orderId) {
  const lines = db.prepare(`
    SELECT oi.id, oi.item_id, oi.quantity, oi.packed_quantity, oi.description,
           i.name AS item_name, i.sku AS item_sku, i.barcode AS item_barcode
      FROM order_items oi LEFT JOIN items i ON oi.item_id = i.id
     WHERE oi.order_id = ? ORDER BY oi.id
  `).all(orderId).map(lineState);

  const total = lines.reduce((sum, l) => sum + l.quantity, 0);
  const packed = lines.reduce((sum, l) => sum + l.packed_quantity, 0);

  return {
    lines,
    total,
    packed,
    remaining: Math.max(0, total - packed),
    complete: total > 0 && packed >= total,
    // A line with nothing in the catalog behind it has no code to scan, so it
    // is ticked off by hand. Worth saying rather than leaving her scanning at
    // something that will never match.
    unscannable: lines.filter((l) => !l.item_id).length,
  };
}

/** Tick one line off, or back on. */
function setPacked(orderId, orderItemId, quantity) {
  const line = db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?')
    .get(orderItemId, orderId);
  if (!line) {
    const err = new Error('That line is not on this order');
    err.status = 404;
    throw err;
  }

  const wanted = Number(line.quantity) || 0;
  const packed = Math.max(0, Math.min(wanted, Number(quantity) || 0));
  db.prepare('UPDATE order_items SET packed_quantity = ? WHERE id = ?').run(packed, line.id);
  return packList(orderId);
}

/** Put everything back to nothing packed — for a box being repacked. */
function resetPacking(orderId) {
  db.prepare('UPDATE order_items SET packed_quantity = 0 WHERE order_id = ?').run(orderId);
  return packList(orderId);
}

/**
 * One scan of one thing going into the box.
 *
 * The code is resolved the same way a Shopify line is — variant, SKU, barcode,
 * then name — so a product tag, a shelf label and the small barcode on the
 * order ticket all tick off the same line.
 */
function packScan(orderId, rawCode) {
  const code = String(rawCode || '').trim();
  if (!code) {
    const err = new Error('Nothing scanned');
    err.status = 400;
    throw err;
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }

  // The ticket's own code is the one most likely to be scanned by accident,
  // since it is on the same sheet of paper as the product codes.
  if (code === order.barcode || code === order.order_number) {
    const err = new Error('That is the order ticket — scan the products going in the box');
    err.status = 400;
    throw err;
  }

  const hit = findItem({ sku: code, barcode: code });
  if (!hit) {
    const err = new Error(`Nothing in the catalog matches ${code}`);
    err.status = 404;
    throw err;
  }

  const lines = db.prepare(
    'SELECT * FROM order_items WHERE order_id = ? AND item_id = ? ORDER BY id'
  ).all(orderId, hit.item.id).map(lineState);

  if (!lines.length) {
    const err = new Error(`${hit.item.name} is not on this order`);
    err.status = 400;
    throw err;
  }

  const line = lines.find((l) => l.remaining > 0);
  if (!line) {
    const err = new Error(`All ${lines[0].quantity} of ${hit.item.name} are already in the box`);
    err.status = 400;
    throw err;
  }

  db.prepare('UPDATE order_items SET packed_quantity = ? WHERE id = ?')
    .run(line.packed_quantity + 1, line.id);

  const packing = packList(orderId);
  const after = packing.lines.find((l) => l.id === line.id);
  return {
    packing,
    matched: {
      order_item_id: line.id,
      item_name: hit.item.name,
      packed_quantity: after.packed_quantity,
      quantity: after.quantity,
    },
    message: after.quantity > 1
      ? `${hit.item.name} — ${after.packed_quantity} of ${after.quantity} in`
      : `${hit.item.name} — in the box`,
  };
}

module.exports = { packList, packScan, setPacked, resetPacking };
