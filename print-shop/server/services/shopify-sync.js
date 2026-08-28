const db = require('../db/database');
const { graphql, paginate } = require('../utils/shopify');
const { suggestShipDate } = require('../utils/planning');
const { computeItemCost } = require('../utils/costing');
const { freeOrderBarcode } = require('../db/schema');
const flow = require('./order-flow');

// ── Queries ──────────────────────────────────────────────────────────────────

const PRODUCTS_QUERY = `
  query Products($cursor: String) {
    products(first: 50, after: $cursor, sortKey: UPDATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        status
        variants(first: 100) {
          nodes { id sku title price barcode inventoryItem { id } }
        }
      }
    }
  }
`;

const ORDERS_QUERY = `
  query Orders($cursor: String, $query: String) {
    orders(first: 25, after: $cursor, query: $query, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        cancelledAt
        note
        email
        displayFinancialStatus
        displayFulfillmentStatus
        customer { firstName lastName email }
        shippingAddress { name }
        lineItems(first: 50) {
          nodes {
            id
            title
            quantity
            sku
            variant { id }
            originalUnitPriceSet { shopMoney { amount } }
          }
        }
      }
    }
  }
`;

// ── Helpers ──────────────────────────────────────────────────────────────────

function recordSync(provider, kind, ok, summary, error, startedAt) {
  db.prepare(`
    INSERT INTO sync_log (provider, kind, ok, summary, error, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(provider, kind, ok ? 1 : 0, summary ? JSON.stringify(summary) : null, error || null, startedAt);
}

function lastSuccessfulSync(kind) {
  return db.prepare(`
    SELECT finished_at FROM sync_log
     WHERE provider = 'shopify' AND kind = ? AND ok = 1
     ORDER BY id DESC LIMIT 1
  `).get(kind)?.finished_at || null;
}

/** A name Shopify variants rarely give us: "Product — Variant", tidied. */
function variantName(productTitle, variantTitle) {
  if (!variantTitle || variantTitle === 'Default Title') return productTitle;
  return `${productTitle} — ${variantTitle}`;
}

function freeOrderNumber(preferred) {
  const exists = db.prepare('SELECT 1 FROM orders WHERE order_number = ?');
  if (!exists.get(preferred)) return preferred;
  for (let n = 2; n < 50; n += 1) {
    const candidate = `${preferred}-${n}`;
    if (!exists.get(candidate)) return candidate;
  }
  return `${preferred}-${Date.now()}`;
}

// ── Products ─────────────────────────────────────────────────────────────────

/**
 * Bring Shopify products in as catalog items, matched on SKU.
 *
 * Deliberately additive: an item that already exists here keeps its name,
 * prices and recipe, and only gains the Shopify link. Overwriting would throw
 * away the costing work, which is the whole reason this app exists.
 */
async function pullProducts({ dryRun = false } = {}) {
  const startedAt = new Date().toISOString();
  const result = { created: [], linked: [], already_linked: 0, skipped: [], complete: true };

  try {
    const { nodes, complete } = await paginate(PRODUCTS_QUERY, {}, (d) => d.products);
    result.complete = complete;

    const findByVariant = db.prepare('SELECT * FROM items WHERE shopify_variant_id = ?');
    const findBySku = db.prepare('SELECT * FROM items WHERE sku = ?');
    const findByBarcode = db.prepare('SELECT id FROM items WHERE barcode = ?');

    for (const product of nodes) {
      for (const variant of product.variants?.nodes || []) {
        const sku = (variant.sku || '').trim();
        const label = variantName(product.title, variant.title);

        if (!sku) {
          result.skipped.push({ name: label, reason: 'no SKU in Shopify' });
          continue;
        }

        const linkFields = {
          shopify_product_id: product.id,
          shopify_variant_id: variant.id,
          shopify_inventory_item_id: variant.inventoryItem?.id || null,
        };

        const existing = findByVariant.get(variant.id) || findBySku.get(sku);
        if (existing) {
          if (existing.shopify_variant_id === variant.id) {
            result.already_linked += 1;
            continue;
          }
          if (!dryRun) {
            db.prepare(`
              UPDATE items SET shopify_product_id = ?, shopify_variant_id = ?,
                     shopify_inventory_item_id = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?
            `).run(linkFields.shopify_product_id, linkFields.shopify_variant_id,
                   linkFields.shopify_inventory_item_id, existing.id);
          }
          result.linked.push({ name: existing.name, sku });
          continue;
        }

        // Shopify's barcode is only worth taking if nothing here uses it.
        const barcode = variant.barcode && !findByBarcode.get(variant.barcode) ? variant.barcode : sku;
        const price = Number(variant.price) || 0;

        if (!dryRun) {
          try {
            const newId = db.prepare(`
              INSERT INTO items
                (name, item_type, sku, barcode, retail_override, qty_on_hand, is_active,
                 shopify_product_id, shopify_variant_id, shopify_inventory_item_id, notes)
              VALUES (?, 'product', ?, ?, ?, 0, ?, ?, ?, ?, ?)
            `).run(
              label, sku, barcode, price || null,
              product.status === 'ACTIVE' ? 1 : 0,
              linkFields.shopify_product_id, linkFields.shopify_variant_id,
              linkFields.shopify_inventory_item_id,
              'Pulled from Shopify. Add its filament, materials and print time to get costing.'
            ).lastInsertRowid;

            // Shopify's own price is exactly what the Shopify channel means.
            if (price) {
              db.prepare(`
                INSERT INTO item_channel_prices (item_id, channel, price)
                VALUES (?, 'Shopify', ?)
                ON CONFLICT(item_id, channel) DO NOTHING
              `).run(newId, price);
            }
          } catch (err) {
            result.skipped.push({ name: label, reason: String(err.message).includes('UNIQUE') ? 'SKU or barcode already used here' : err.message });
            continue;
          }
        }
        result.created.push({ name: label, sku, price });
      }
    }

    if (!dryRun) recordSync('shopify', 'products', true, summarise(result), null, startedAt);
    return result;
  } catch (err) {
    recordSync('shopify', 'products', false, null, err.message, startedAt);
    throw err;
  }
}

function summarise(result) {
  return {
    created: result.created.length,
    linked: result.linked.length,
    already_linked: result.already_linked,
    skipped: result.skipped.length,
    complete: result.complete,
  };
}

// ── Orders ───────────────────────────────────────────────────────────────────

/**
 * Turn a Shopify order into the shape this shop stores, matching each line to
 * a catalog item by variant id first and SKU second. Reads nothing but the
 * catalog, so a pull and a webhook get identical results.
 */
function prepareOrder(order) {
  const byVariant = db.prepare('SELECT * FROM items WHERE shopify_variant_id = ?');
  const bySku = db.prepare('SELECT * FROM items WHERE sku = ?');
  const unmatched = [];

  const customer = order.customer
    ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ')
    : order.shippingAddress?.name;

  const lines = (order.lineItems?.nodes || []).map((line) => {
    const match = (line.variant?.id && byVariant.get(line.variant.id))
      || (line.sku && bySku.get(line.sku.trim()));
    if (!match) unmatched.push({ order: order.name, line: line.title, sku: line.sku || null });
    return {
      item_id: match?.id || null,
      description: match ? null : line.title,
      quantity: Number(line.quantity) || 1,
      unit_price: Number(line.originalUnitPriceSet?.shopMoney?.amount) || 0,
      shopify_line_item_id: line.id,
    };
  });

  return {
    shopify_order_id: order.id,
    name: order.name,
    order_date: String(order.createdAt || new Date().toISOString()).slice(0, 10),
    cancelled: !!order.cancelledAt,
    customer: customer || null,
    email: order.customer?.email || order.email || null,
    note: order.note || null,
    lines,
    unmatched,
  };
}

/**
 * Write a prepared order in. Lands in New with a ticket code and nothing
 * queued — an order waits to be looked at before anything reaches a printer.
 */
function saveOrder(prepared) {
  const printMinutes = prepared.lines.reduce((sum, l) => (
    l.item_id ? sum + (computeItemCost(l.item_id)?.print_minutes_per_unit || 0) * l.quantity : sum
  ), 0);
  const suggestion = suggestShipDate(prepared.order_date, printMinutes);

  const create = db.transaction(() => {
    const orderNumber = freeOrderNumber(prepared.name);
    const orderId = db.prepare(`
      INSERT INTO orders
        (order_number, customer_name, customer_email, channel, order_type, status,
         order_date, promised_ship_date, notes, shopify_order_id)
      VALUES (?, ?, ?, 'shopify', 'retail', ?, ?, ?, ?, ?)
    `).run(
      orderNumber,
      prepared.customer,
      prepared.email,
      prepared.cancelled ? 'cancelled' : 'new',
      prepared.order_date,
      suggestion.suggested_ship_date,
      prepared.note,
      prepared.shopify_order_id
    ).lastInsertRowid;

    const taken = new Set(
      db.prepare('SELECT barcode FROM orders WHERE barcode IS NOT NULL').all().map((r) => r.barcode)
    );
    db.prepare('UPDATE orders SET barcode = ? WHERE id = ?')
      .run(freeOrderBarcode(orderNumber, orderId, taken), orderId);

    const insertLine = db.prepare(`
      INSERT INTO order_items (order_id, item_id, description, quantity, unit_price, shopify_line_item_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const line of prepared.lines) {
      insertLine.run(orderId, line.item_id, line.description, line.quantity, line.unit_price, line.shopify_line_item_id);
    }
    flow.logEvent(orderId, null, prepared.cancelled ? 'cancelled' : 'new', 'shopify');
    return orderId;
  });

  return create();
}


/**
 * Bring Shopify orders in as orders here. Nothing is queued — an order lands
 * in New and waits to be looked at before anything reaches a printer.
 */
async function pullOrders({ sinceDays = null, dryRun = false } = {}) {
  const startedAt = new Date().toISOString();
  const result = { created: [], already_here: 0, unmatched_lines: [], skipped: [], complete: true };

  try {
    // Pick up where the last good run finished, or take a first slice of history.
    const last = lastSuccessfulSync('orders');
    const since = sinceDays
      ? new Date(Date.now() - sinceDays * 86400000)
      : last ? new Date(last) : new Date(Date.now() - 30 * 86400000);
    const query = `created_at:>='${since.toISOString()}'`;

    const { nodes, complete } = await paginate(ORDERS_QUERY, { query }, (d) => d.orders);
    result.complete = complete;

    const existing = db.prepare('SELECT id FROM orders WHERE shopify_order_id = ?');
    const byVariant = db.prepare('SELECT * FROM items WHERE shopify_variant_id = ?');
    const bySku = db.prepare('SELECT * FROM items WHERE sku = ?');

    for (const order of nodes) {
      if (existing.get(order.id)) {
        result.already_here += 1;
        continue;
      }

      const prepared = prepareOrder(order);
      result.unmatched_lines.push(...prepared.unmatched);

      if (dryRun) {
        result.created.push({ order_number: order.name, customer: prepared.customer, lines: prepared.lines.length });
        continue;
      }

      saveOrder(prepared);
      result.created.push({ order_number: order.name, customer: prepared.customer, lines: prepared.lines.length });

    }

    if (!dryRun) {
      recordSync('shopify', 'orders', true, {
        created: result.created.length,
        already_here: result.already_here,
        unmatched_lines: result.unmatched_lines.length,
        complete: result.complete,
      }, null, startedAt);
    }
    return result;
  } catch (err) {
    recordSync('shopify', 'orders', false, null, err.message, startedAt);
    throw err;
  }
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

/**
 * A webhook body is the REST shape — snake_case, numeric ids — while a pull
 * gives GraphQL nodes. Converting one into the other means orders arriving by
 * push and by pull go down exactly the same road.
 */
function fromWebhook(payload) {
  const gid = (kind, id) => (id == null ? null : `gid://shopify/${kind}/${id}`);
  return {
    id: gid('Order', payload.id),
    name: payload.name || payload.order_number || `#${payload.id}`,
    createdAt: payload.created_at || new Date().toISOString(),
    cancelledAt: payload.cancelled_at || null,
    note: payload.note || null,
    email: payload.email || payload.contact_email || null,
    customer: payload.customer
      ? {
        firstName: payload.customer.first_name || null,
        lastName: payload.customer.last_name || null,
        email: payload.customer.email || null,
      }
      : null,
    shippingAddress: payload.shipping_address ? { name: payload.shipping_address.name } : null,
    lineItems: {
      nodes: (payload.line_items || []).map((line) => ({
        id: gid('LineItem', line.id),
        title: line.title || line.name,
        sku: line.sku || null,
        quantity: line.quantity,
        variant: line.variant_id ? { id: gid('ProductVariant', line.variant_id) } : null,
        originalUnitPriceSet: { shopMoney: { amount: line.price } },
      })),
    },
  };
}

/**
 * Act on one verified webhook. Creating is the interesting case; an update to
 * an order already here only ever touches what Shopify owns — who bought it
 * and whether it is cancelled — never the stage she has scanned it to.
 */
function applyWebhook(topic, payload) {
  const startedAt = new Date().toISOString();
  const order = fromWebhook(payload);
  const existing = db.prepare('SELECT * FROM orders WHERE shopify_order_id = ?').get(order.id);

  let outcome;
  if (!existing) {
    const prepared = prepareOrder(order);
    const id = saveOrder(prepared);
    outcome = {
      action: 'created',
      order_number: db.prepare('SELECT order_number FROM orders WHERE id = ?').get(id).order_number,
      unmatched_lines: prepared.unmatched.length,
    };
  } else if (order.cancelledAt && existing.status !== 'cancelled' && existing.status !== 'shipped') {
    // A cancellation is worth knowing about even mid-print; a shipped order is
    // past caring.
    flow.setStatus(existing.id, 'cancelled', { source: 'shopify', note: 'cancelled in Shopify' });
    outcome = { action: 'cancelled', order_number: existing.order_number };
  } else {
    const prepared = prepareOrder(order);
    db.prepare(`
      UPDATE orders SET customer_name = IFNULL(?, customer_name), customer_email = IFNULL(?, customer_email),
                        notes = IFNULL(?, notes), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
    `).run(prepared.customer, prepared.email, prepared.note, existing.id);
    outcome = { action: 'updated', order_number: existing.order_number };
  }

  recordSync('shopify', `webhook ${topic}`, true, outcome, null, startedAt);
  return outcome;
}

function history(limit = 10) {
  return db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT ?').all(limit)
    .map((row) => ({ ...row, summary: row.summary ? JSON.parse(row.summary) : null }));
}

module.exports = {
  pullProducts, pullOrders, history, applyWebhook, fromWebhook, prepareOrder, saveOrder,
  PRODUCTS_QUERY, ORDERS_QUERY,
};
