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
 *
 * That count is also where the units physically are. A thing in the box, or in
 * the order's bin waiting to be boxed, is not on the shelf any more — so every
 * change to it moves stock, through `setAside` below and nowhere else.
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

/**
 * Set how many of a line are set aside for its order — in its bin, or in the
 * box — and move the shelf to match.
 *
 * This is the only place that figure is written, because it is two facts at
 * once: how far the box has got, and where the units are. Four in a bin are
 * four fewer to sell, and a shelf that says otherwise will happily promise
 * them to somebody else.
 *
 * Symmetric on the way back: taking them out of the box puts them back.
 */
function setAside(orderItemId, quantity, { reason = 'set aside for an order', reference = null } = {}) {
  const line = db.prepare(`
    SELECT oi.*, o.order_number FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
     WHERE oi.id = ?
  `).get(orderItemId);
  if (!line) return null;

  const wanted = Number(line.quantity) || 0;
  const before = Math.max(0, Math.min(wanted, Number(line.packed_quantity) || 0));
  const after = Math.max(0, Math.min(wanted, Number(quantity) || 0));
  const moved = after - before;

  db.prepare('UPDATE order_items SET packed_quantity = ? WHERE id = ?').run(after, orderItemId);

  // A line with no catalog product behind it — a gift note, a hand-written
  // line — has no shelf to come off.
  if (moved && line.item_id) {
    db.prepare('UPDATE items SET qty_on_hand = COALESCE(qty_on_hand, 0) - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(moved, line.item_id);
    // Required lazily: these reach back into orders, and loading them up top
    // would be a circle.
    require('../routes/helpers').logStock(
      'item', line.item_id, -moved, 'each', reason, reference || line.order_number
    );
    require('./inventory-sync').changed(line.item_id);
  }

  return { before, after, moved };
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

  setAside(line.id, quantity, { reason: 'packed into the box' });
  return packList(orderId);
}

/** Put everything back to nothing packed — for a box being repacked. */
function resetPacking(orderId) {
  const lines = db.prepare('SELECT id FROM order_items WHERE order_id = ?').all(orderId);
  db.transaction(() => {
    for (const line of lines) setAside(line.id, 0, { reason: 'taken back out of the box' });
  })();
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

  setAside(line.id, (Number(line.packed_quantity) || 0) + 1, { reason: 'packed into the box' });

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

module.exports = { packList, packScan, setPacked, resetPacking, setAside };
