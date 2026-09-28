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
 *
 * The Mail Bin is the exception, and the only one. It is the bin by the door:
 * packed and labelled parcels wait in it for the post office run, so it holds
 * as many orders as are going out. Emptying it is the pickup — everything in
 * it is on the van, which is the moment those orders are shipped.
 */

/** Orders that are still using their bin. A shipped one has left. */
const HOLDING = "o.status NOT IN ('shipped', 'completed', 'cancelled')";

function binRow(bin) {
  if (!bin) return null;
  if (bin.kind === 'mail') return mailBinRow(bin);
  if (bin.kind === 'stock') return stockBinRow(bin);

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

/**
 * The Mail Bin: every parcel waiting for the post office, oldest first, since
 * that is the order they were packed in and the order they should go out in.
 */
function mailBinRow(bin) {
  const orders = db.prepare(`
    SELECT o.id, o.order_number, o.status, o.customer_name, o.promised_ship_date, o.tracking_number
      FROM orders o
     WHERE o.bin_id = ? AND ${HOLDING}
     ORDER BY o.updated_at, o.id
  `).all(bin.id);

  return {
    ...bin,
    order: null,
    orders,
    contents: null,
    waiting: orders.length,
    empty: orders.length === 0,
  };
}

/**
 * The Stock bin: finished things for the shelf that have not been carried to
 * the inventory shelves yet.
 *
 * It holds products rather than orders, so it is the one bin with a list of
 * its own. Nothing here is a second stock count — a print is on hand the moment
 * it is finished, whether it is on the inventory shelf or still in the basket
 * by the printer. What this answers is "what still has to be put away", which
 * is a question about her feet, not about her numbers.
 */
function stockBinRow(bin) {
  const items = db.prepare(`
    SELECT bi.item_id, bi.quantity, bi.updated_at,
           i.name AS item_name, i.sku AS item_sku, i.barcode, i.image_url,
           i.qty_on_hand
      FROM bin_items bi JOIN items i ON bi.item_id = i.id
     WHERE bi.bin_id = ? AND bi.quantity > 0
     ORDER BY bi.updated_at DESC, i.name
  `).all(bin.id).map((row) => ({ ...row, quantity: Number(row.quantity) || 0 }));

  const units = items.reduce((sum, r) => sum + r.quantity, 0);
  return {
    ...bin,
    order: null,
    contents: null,
    items,
    units,
    waiting: items.length,
    empty: items.length === 0,
  };
}

/** The bin by the printer, whatever it ends up being called. */
function stockBin() {
  const bin = db.prepare("SELECT * FROM bins WHERE kind = 'stock' AND is_active = 1 ORDER BY position, id").get();
  return bin ? binRow(bin) : null;
}

/** The raw row, for the writers below, without the cost of reading its list. */
function stockBinRaw() {
  return db.prepare("SELECT * FROM bins WHERE kind = 'stock' AND is_active = 1 ORDER BY position, id").get() || null;
}

const round2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

/**
 * Put finished units into the Stock bin.
 *
 * Called when a print for the shelf comes off, and by hand when she scans
 * something into the basket. It never touches qty_on_hand: those units are
 * already on hand, and this only records that they are still in the basket.
 *
 * A shop with no Stock bin — one she has deleted — simply has nowhere to put
 * them, and the print finishes as it always did.
 */
function putInStock(itemId, quantity = 1) {
  const bin = stockBinRaw();
  const qty = round2(quantity);
  if (!bin || !itemId || qty <= 0) return null;
  if (!db.prepare('SELECT id FROM items WHERE id = ?').get(itemId)) return null;

  db.prepare(`
    INSERT INTO bin_items (bin_id, item_id, quantity) VALUES (?, ?, ?)
    ON CONFLICT(bin_id, item_id) DO UPDATE
      SET quantity = quantity + excluded.quantity, updated_at = CURRENT_TIMESTAMP
  `).run(bin.id, itemId, qty);
  return { bin_id: bin.id, item_id: itemId, added: qty };
}

/**
 * Take units out of the Stock bin, because they have been put away.
 *
 * Nothing moves in the stock figures: they were on hand in the basket and they
 * are on hand on the shelf. `quantity` null means all of that line.
 */
function putAwayStock(itemId, quantity = null) {
  const bin = stockBinRaw();
  if (!bin) {
    const err = new Error('There is no Stock bin');
    err.status = 404;
    throw err;
  }
  const row = db.prepare('SELECT * FROM bin_items WHERE bin_id = ? AND item_id = ?').get(bin.id, itemId);
  const name = db.prepare('SELECT name FROM items WHERE id = ?').get(itemId)?.name || 'That';
  if (!row || row.quantity <= 0) {
    const err = new Error(`${name} is not in ${bin.label}`);
    err.status = 400;
    throw err;
  }

  const taking = quantity == null ? row.quantity : Math.min(row.quantity, round2(quantity));
  if (taking <= 0) {
    const err = new Error('Nothing to put away');
    err.status = 400;
    throw err;
  }
  const left = round2(row.quantity - taking);

  if (left > 0) {
    db.prepare('UPDATE bin_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(left, row.id);
  } else {
    db.prepare('DELETE FROM bin_items WHERE id = ?').run(row.id);
  }

  return {
    bin: byId(bin.id),
    item_name: name,
    put_away: taking,
    left,
    message: left > 0
      ? `${taking} × ${name} put away — ${left} still in ${bin.label}`
      : `${name} put away — none left in ${bin.label}`,
  };
}

/** Say exactly how many of something are in the basket, counted by hand. */
function countInStock(itemId, quantity) {
  const bin = stockBinRaw();
  if (!bin) {
    const err = new Error('There is no Stock bin');
    err.status = 404;
    throw err;
  }
  const item = db.prepare('SELECT name FROM items WHERE id = ?').get(itemId);
  if (!item) {
    const err = new Error('That is not in the catalog');
    err.status = 404;
    throw err;
  }
  const qty = Math.max(0, round2(quantity));

  if (qty > 0) {
    db.prepare(`
      INSERT INTO bin_items (bin_id, item_id, quantity) VALUES (?, ?, ?)
      ON CONFLICT(bin_id, item_id) DO UPDATE SET quantity = excluded.quantity, updated_at = CURRENT_TIMESTAMP
    `).run(bin.id, itemId, qty);
  } else {
    db.prepare('DELETE FROM bin_items WHERE bin_id = ? AND item_id = ?').run(bin.id, itemId);
  }

  return {
    bin: byId(bin.id),
    item_name: item.name,
    quantity: qty,
    message: qty > 0 ? `${qty} × ${item.name} in ${bin.label}` : `No ${item.name} in ${bin.label}`,
  };
}

/** The whole basket put away in one go, for when she carries the lot over. */
function emptyStock() {
  const bin = stockBinRaw();
  if (!bin) {
    const err = new Error('There is no Stock bin');
    err.status = 404;
    throw err;
  }
  const lines = db.prepare('SELECT COUNT(*) AS n, IFNULL(SUM(quantity), 0) AS units FROM bin_items WHERE bin_id = ?')
    .get(bin.id);
  if (!lines.n) {
    const err = new Error(`${bin.label} is already empty`);
    err.status = 400;
    throw err;
  }
  db.prepare('DELETE FROM bin_items WHERE bin_id = ?').run(bin.id);

  return {
    bin: byId(bin.id),
    put_away: lines.units,
    message: `${lines.units} put away — ${bin.label} is empty`,
  };
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

/** The bin by the door, whatever it ends up being called. */
function mailBin() {
  const bin = db.prepare("SELECT * FROM bins WHERE kind = 'mail' AND is_active = 1 ORDER BY position, id").get();
  return bin ? binRow(bin) : null;
}

/** The bin an order is in, if it is in one. */
function forOrder(orderId) {
  const order = db.prepare('SELECT bin_id FROM orders WHERE id = ?').get(orderId);
  if (!order?.bin_id) return null;
  const bin = db.prepare('SELECT * FROM bins WHERE id = ?').get(order.bin_id);
  return bin ? { id: bin.id, code: bin.code, label: bin.label, kind: bin.kind } : null;
}

/**
 * Put an order in a bin, by the code scanned off the front of it.
 *
 * An order already in another bin is moved rather than duplicated, because it
 * is one physical pile of things and it can only be in one place.
 */
function assign(orderId, code, { skipStage = false } = {}) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) {
    const err = new Error('Order not found');
    err.status = 404;
    throw err;
  }
  const bin = db.prepare('SELECT * FROM bins WHERE code = ? AND is_active = 1').get(String(code || '').trim());
  if (!bin) {
    const err = new Error(`${String(code || '').trim() || 'That code'} is not one of the bins`);
    err.status = 404;
    throw err;
  }

  // The Stock bin holds loose products for the shelf, not orders. An order
  // scanned into it is a mis-scan, and taking it would lose the order.
  if (bin.kind === 'stock') {
    const err = new Error(`${bin.label} is for finished things going to inventory — it does not hold orders`);
    err.status = 400;
    throw err;
  }

  if (['completed', 'cancelled'].includes(order.status)) {
    const err = new Error(`${order.order_number} is ${order.status} — it does not need a bin`);
    err.status = 400;
    throw err;
  }
  // A shipped order back in the Mail Bin is the correction for a parcel marked
  // shipped that never actually left, so that one is allowed and moves the
  // order back. Into a numbered bin it would mean the order is being made
  // again, which it is not.
  if (order.status === 'shipped' && bin.kind !== 'mail') {
    const err = new Error(`${order.order_number} has already gone — it does not need a bin`);
    err.status = 400;
    throw err;
  }

  // Every bin but the mail one holds a single order: a second order going into
  // an occupied bin is a mistake worth stopping, not a pile worth making.
  if (bin.kind !== 'mail') {
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
  }

  const from = order.bin_id ? db.prepare('SELECT label FROM bins WHERE id = ?').get(order.bin_id) : null;
  db.prepare('UPDATE orders SET bin_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(bin.id, order.id);

  // A parcel in the Mail Bin is packed and waiting for the carrier, which is a
  // stage of its own — so putting it there says so. advanceTo only ever moves
  // forward, so an order already past this is left alone.
  if (bin.kind !== 'mail' && !skipStage && order.status === 'mail_bin') {
    // Out of the Mail Bin and back on the making shelf: it is not waiting for
    // the carrier any more, whatever the stage said a moment ago.
    require('./order-flow').setStatus(order.id, 'packing', {
      source: 'bin',
      note: `Taken out of the Mail Bin into ${bin.label}`,
    });
  }

  if (bin.kind === 'mail' && !skipStage) {
    const flow = require('./order-flow');
    if (order.status === 'shipped') {
      // Said too early. The goods stay out of stock — they are in a sealed box
      // either way — but the order is honest about where the box is.
      flow.setStatus(order.id, 'mail_bin', { source: 'bin', note: 'Back in the Mail Bin — it had not left' });
    } else {
      flow.advanceTo(order.id, 'mail_bin', { source: 'bin', note: `Into ${bin.label}` });
    }
  }

  return {
    bin: byId(bin.id),
    moved_from: from?.label || null,
    message: from && from.label !== bin.label
      ? `${order.order_number} moved from ${from.label} to ${bin.label}`
      : `${order.order_number} is in ${bin.label}`,
  };
}

/**
 * Take an order out of its bin — on shipping, or because she emptied it.
 *
 * `keepStage` is for shipping, which calls this on its way to setting the
 * status: the row still says mail_bin at that moment, and without it the order
 * would be sent back to packing on its way out of the door.
 */
function release(orderId, { keepStage = false } = {}) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order?.bin_id) return null;
  const bin = db.prepare('SELECT * FROM bins WHERE id = ?').get(order.bin_id);
  db.prepare('UPDATE orders SET bin_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(order.id);

  // Emptied out of the Mail Bin by hand: it is packed, but nothing is waiting
  // for the carrier any more.
  if (!keepStage && bin?.kind === 'mail' && order.status === 'mail_bin') {
    require('./order-flow').setStatus(order.id, 'packing', {
      source: 'bin',
      note: 'Taken out of the Mail Bin',
    });
  }

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

  // Into the bin is off the shelf: packing owns that figure and the stock move
  // that goes with it.
  require('./packing').setAside(line.id, now, { reason: 'into the order bin' });

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

/**
 * The post office has been: everything in the Mail Bin is on the van.
 *
 * Emptying the bin and shipping the orders are the same event, so this is one
 * action rather than a list to work through one parcel at a time. Shipping an
 * order already releases its bin, so the bin empties itself as it goes.
 *
 * Pass `orderIds` when only some of the pile was collected.
 */
function pickedUp(code, { orderIds = null } = {}) {
  const bin = byCode(code);
  if (!bin) {
    const err = new Error(`${String(code || '').trim() || 'That code'} is not one of the bins`);
    err.status = 404;
    throw err;
  }
  if (bin.kind !== 'mail') {
    const err = new Error(`${bin.label} is not the Mail Bin — it holds an order being made, not a parcel going out`);
    err.status = 400;
    throw err;
  }

  const wanted = orderIds ? new Set(orderIds.map(Number)) : null;
  const going = bin.orders.filter((o) => !wanted || wanted.has(o.id));
  if (!going.length) {
    const err = new Error('Nothing in the Mail Bin to collect');
    err.status = 400;
    throw err;
  }

  // Lazily required: order-flow releases bins on shipping, so requiring it at
  // the top would be a circle.
  const flow = require('./order-flow');
  const shipped = [];
  const held = [];
  for (const order of going) {
    try {
      // advanceTo declines rather than throws for an order that cannot move —
      // one already shipped, or cancelled. Either way it is not on the van.
      const moved = flow.advanceTo(order.id, 'shipped', {
        source: 'mail-bin',
        note: 'Collected from the Mail Bin',
      });
      if (moved) shipped.push(order.order_number);
      else held.push({ order_number: order.order_number, reason: `Cannot ship from ${order.status}` });
    } catch (err) {
      held.push({ order_number: order.order_number, reason: err.message });
    }
  }

  return {
    bin: byCode(code),
    shipped,
    held,
    message: held.length
      ? `${shipped.length} shipped, ${held.length} still in ${bin.label}`
      : `${shipped.length} parcel${shipped.length === 1 ? '' : 's'} collected and marked shipped`,
  };
}

module.exports = {
  list, byCode, byId, mailBin, forOrder, assign, release, putIn, pickedUp,
  stockBin, putInStock, putAwayStock, countInStock, emptyStock,
};
