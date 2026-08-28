const db = require('../db/database');
const shopify = require('../utils/shopify');
const { sellableQuantity } = require('./order-flow');

/**
 * Putting this shop's stock figure back onto Shopify.
 *
 * The shop is the master: whatever it says is on the shelf decides what the
 * store sells. What gets sent is not the raw on-hand count but what is still
 * sellable — on hand, less what is already sold and waiting to go out. Those
 * two differ for exactly as long as an order sits between its sale and its
 * shipment, and sending the raw count in that window would put back the unit
 * Shopify had already taken away, and oversell it.
 *
 * Changes go through an outbox rather than straight down the wire, so a push
 * that fails while Shopify is unreachable is retried rather than lost.
 */

const BATCH = 100;
let running = false;
let timer = null;

function setting(key, fallback = null) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? fallback;
}

function enabled() {
  return setting('shopify_push_inventory', '0') === '1'
    && !!setting('shopify_location_id')
    && shopify.getConfig().configured;
}

/** Note that an item's figure has moved. Cheap enough to call anywhere. */
function markChanged(itemId) {
  if (!itemId) return;
  try {
    db.prepare(`
      INSERT INTO inventory_outbox (item_id, queued_at, attempts, last_error)
      VALUES (?, CURRENT_TIMESTAMP, 0, NULL)
      ON CONFLICT(item_id) DO UPDATE SET queued_at = CURRENT_TIMESTAMP, attempts = 0, last_error = NULL
    `).run(itemId);
  } catch { /* the item may be on its way out; nothing to push then */ }
}

/** Every item on an order, for when the order itself moved rather than stock. */
function markOrderChanged(orderId) {
  const rows = db.prepare('SELECT DISTINCT item_id FROM order_items WHERE order_id = ? AND item_id IS NOT NULL')
    .all(orderId);
  for (const row of rows) markChanged(row.item_id);
}

/** Queue every linked product, for a full reconcile. */
function markAll() {
  const rows = db.prepare(
    "SELECT id FROM items WHERE shopify_inventory_item_id IS NOT NULL AND item_type <> 'tool'"
  ).all();
  for (const row of rows) markChanged(row.id);
  return rows.length;
}

/** What Shopify would be told about one item right now. */
function plannedFor(itemId) {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  if (!item || !item.shopify_inventory_item_id) return null;
  const counts = sellableQuantity(itemId);
  if (!counts) return null;
  return {
    item_id: item.id,
    name: item.name,
    sku: item.sku,
    inventory_item_id: item.shopify_inventory_item_id,
    ...counts,
    // Shopify cannot hold less than nothing; a negative shelf reads as zero
    // there while staying negative here, where it is a problem to look at.
    quantity: Math.max(0, counts.sellable),
    last_pushed: item.shopify_pushed_quantity,
  };
}

/**
 * Send everything waiting. Items whose figure has not actually moved since the
 * last push are dropped without a call — most changes touch one item, and a
 * reconcile of a whole catalog should not rewrite figures that already agree.
 */
async function flush({ force = false } = {}) {
  if (running) return null;
  if (!enabled()) return null;

  running = true;
  const result = { pushed: [], skipped: 0, failed: [] };
  try {
    const waiting = db.prepare('SELECT item_id FROM inventory_outbox ORDER BY queued_at LIMIT ?').all(BATCH);
    if (!waiting.length) return result;

    const entries = [];
    const clear = [];
    for (const row of waiting) {
      const plan = plannedFor(row.item_id);
      if (!plan) { clear.push(row.item_id); continue; }
      if (!force && plan.last_pushed === plan.quantity) {
        result.skipped += 1;
        clear.push(row.item_id);
        continue;
      }
      entries.push(plan);
    }

    if (entries.length) {
      await shopify.setInventory(
        entries.map((e) => ({ inventoryItemId: e.inventory_item_id, quantity: e.quantity })),
        {
          locationId: setting('shopify_location_id'),
          name: setting('shopify_quantity_name', 'available'),
        }
      );

      const remember = db.prepare(
        'UPDATE items SET shopify_pushed_quantity = ?, shopify_pushed_at = CURRENT_TIMESTAMP WHERE id = ?'
      );
      for (const e of entries) {
        remember.run(e.quantity, e.item_id);
        clear.push(e.item_id);
        result.pushed.push({ name: e.name, sku: e.sku, quantity: e.quantity, on_hand: e.on_hand, reserved: e.reserved });
      }
    }

    if (clear.length) {
      db.prepare(`DELETE FROM inventory_outbox WHERE item_id IN (${clear.map(() => '?').join(',')})`).run(...clear);
    }
    return result;
  } catch (err) {
    // Left in the outbox on purpose: whatever went wrong, the change still
    // needs to reach Shopify once it is fixed.
    const note = db.prepare('UPDATE inventory_outbox SET attempts = attempts + 1, last_error = ? WHERE item_id = ?');
    for (const row of db.prepare('SELECT item_id FROM inventory_outbox LIMIT ?').all(BATCH)) {
      note.run(String(err.message).slice(0, 300), row.item_id);
    }
    console.error('Shopify inventory push failed:', err.message);
    result.failed.push({ reason: err.message });
    return result;
  } finally {
    running = false;
  }
}

/** What is waiting, and why anything is stuck. */
function status() {
  const waiting = db.prepare(`
    SELECT o.item_id, o.attempts, o.last_error, i.name, i.sku
      FROM inventory_outbox o JOIN items i ON o.item_id = i.id
     ORDER BY o.queued_at LIMIT 20
  `).all();
  return {
    enabled: enabled(),
    push_on: setting('shopify_push_inventory', '0') === '1',
    location_id: setting('shopify_location_id'),
    quantity_name: setting('shopify_quantity_name', 'available'),
    waiting: db.prepare('SELECT COUNT(*) AS count FROM inventory_outbox').get().count,
    stuck: waiting.filter((w) => w.attempts > 0),
    next: waiting.slice(0, 10).map((w) => plannedFor(w.item_id)).filter(Boolean),
  };
}

/**
 * A short delay after a change rather than a call per change: finishing a print
 * run moves several items at once, and they belong in one request.
 */
function schedule(afterMs = 4000) {
  if (!enabled()) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; flush(); }, afterMs);
  if (timer.unref) timer.unref();
}

/** Stock changed here — tell Shopify shortly. */
function changed(itemId) {
  markChanged(itemId);
  schedule();
}

function orderChanged(orderId) {
  markOrderChanged(orderId);
  schedule();
}

module.exports = {
  markChanged, markOrderChanged, markAll, plannedFor, flush, status, schedule, changed, orderChanged, enabled,
};
