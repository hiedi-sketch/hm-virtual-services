const db = require('../db/database');
const { graphql, paginate } = require('../utils/shopify');
const { suggestShipDate } = require('../utils/planning');
const { computeItemCost } = require('../utils/costing');

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

      const orderDate = String(order.createdAt).slice(0, 10);
      const customer = order.customer
        ? [order.customer.firstName, order.customer.lastName].filter(Boolean).join(' ')
        : order.shippingAddress?.name;

      const lines = (order.lineItems?.nodes || []).map((line) => {
        const match = (line.variant?.id && byVariant.get(line.variant.id))
          || (line.sku && bySku.get(line.sku.trim()));
        if (!match) {
          result.unmatched_lines.push({ order: order.name, line: line.title, sku: line.sku || null });
        }
        return {
          item_id: match?.id || null,
          description: match ? null : line.title,
          quantity: Number(line.quantity) || 1,
          unit_price: Number(line.originalUnitPriceSet?.shopMoney?.amount) || 0,
          shopify_line_item_id: line.id,
        };
      });

      if (dryRun) {
        result.created.push({ order_number: order.name, customer, lines: lines.length });
        continue;
      }

      const printMinutes = lines.reduce((sum, l) => (
        l.item_id ? sum + (computeItemCost(l.item_id)?.print_minutes_per_unit || 0) * l.quantity : sum
      ), 0);
      const suggestion = suggestShipDate(orderDate, printMinutes);

      const create = db.transaction(() => {
        const orderId = db.prepare(`
          INSERT INTO orders
            (order_number, customer_name, customer_email, channel, order_type, status,
             order_date, promised_ship_date, notes, shopify_order_id)
          VALUES (?, ?, ?, 'shopify', 'retail', ?, ?, ?, ?, ?)
        `).run(
          freeOrderNumber(order.name),
          customer || null,
          order.customer?.email || order.email || null,
          order.cancelledAt ? 'cancelled' : 'new',
          orderDate,
          suggestion.suggested_ship_date,
          order.note || null,
          order.id
        ).lastInsertRowid;

        const insertLine = db.prepare(`
          INSERT INTO order_items (order_id, item_id, description, quantity, unit_price, shopify_line_item_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const line of lines) {
          insertLine.run(orderId, line.item_id, line.description, line.quantity, line.unit_price, line.shopify_line_item_id);
        }
        return orderId;
      });

      create();
      result.created.push({ order_number: order.name, customer, lines: lines.length });
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

function history(limit = 10) {
  return db.prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT ?').all(limit)
    .map((row) => ({ ...row, summary: row.summary ? JSON.parse(row.summary) : null }));
}

module.exports = { pullProducts, pullOrders, history, PRODUCTS_QUERY, ORDERS_QUERY };
