const db = require('../db/database');

/**
 * Two rows in the catalog that are the same product.
 *
 * A pull from Shopify creates an item when it cannot recognise one it already
 * has: it looks for the variant id, then the SKU, then the barcode, then the
 * name exactly. Miss all four and a second copy appears — so the pair is
 * nearly always "the one you made", carrying your costing and a Print Shop
 * SKU, and "the one Shopify made", carrying the link and Shopify's SKU.
 *
 * The name is what usually misses, because it only had to differ by a
 * character: "Pop-Tab" against "Pop Tab" is enough.
 */

// The same reduction the matcher uses, so what the pull considers a match and
// what this offers to merge can never drift apart.
const { shape } = require('./catalog-match');

/** Everything that would have to move if this item were merged away. */
function usage(itemId) {
  const one = (sql, ...args) => db.prepare(sql).get(...args).n;
  return {
    order_lines: one('SELECT COUNT(*) AS n FROM order_items WHERE item_id = ?', itemId),
    print_jobs: one('SELECT COUNT(*) AS n FROM queue_jobs WHERE item_id = ?', itemId),
    recipe_lines: one('SELECT COUNT(*) AS n FROM item_components WHERE item_id = ?', itemId),
    used_in_others: one(
      "SELECT COUNT(*) AS n FROM item_components WHERE component_type = 'item' AND ref_id = ?", itemId),
    channel_prices: one('SELECT COUNT(*) AS n FROM item_channel_prices WHERE item_id = ?', itemId),
  };
}

/**
 * How much of a real record an item is: the thing that decides which copy of a
 * pair should survive. Costing work and history beat a freshly pulled stub,
 * because the costing is the whole reason this app exists.
 */
function weight(item, use) {
  return (item.print_time_minutes > 0 ? 8 : 0)
    + (use.recipe_lines > 0 ? 8 : 0)
    + (use.order_lines > 0 ? 4 : 0)
    + (use.print_jobs > 0 ? 4 : 0)
    + (use.channel_prices > 0 ? 2 : 0)
    + (item.qty_on_hand > 0 ? 2 : 0)
    + (item.cost_override != null || item.retail_override != null ? 1 : 0)
    + (use.used_in_others > 0 ? 4 : 0);
}

/** Why these two look like the same product. */
function reason(a, b) {
  if (shape(a.name) === shape(b.name)) return 'same name, punctuated differently';
  if (shape(b.name).startsWith(`${shape(a.name)} `) || shape(a.name).startsWith(`${shape(b.name)} `)) {
    return 'one is a variant of the other';
  }
  return 'same product';
}

/**
 * Pairs of catalog items that look like the same product.
 *
 * Grouped by the shape of the name, plus the case a Shopify pull creates when
 * a product gains variants: "Pickle Opener" and "Pickle Opener — Small" are
 * the same product as far as a shelf is concerned.
 */
function find() {
  const items = db.prepare(`
    SELECT id, name, sku, barcode, item_type, qty_on_hand, print_time_minutes,
           cost_override, retail_override, image_url, shopify_variant_id, created_at
      FROM items WHERE is_active = 1 OR is_active IS NULL
     ORDER BY id
  `).all();

  const groups = new Map();
  const add = (key, item) => {
    if (!groups.has(key)) groups.set(key, []);
    const list = groups.get(key);
    if (!list.some((i) => i.id === item.id)) list.push(item);
  };

  for (const item of items) {
    const s = shape(item.name);
    if (!s) continue;
    add(s, item);

    // A product that gained variants in Shopify comes back as one item per
    // variant, leaving the original behind. The original's name is the prefix.
    for (const other of items) {
      if (other.id === item.id) continue;
      const o = shape(other.name);
      if (o && o !== s && s.startsWith(`${o} `)) add(o, item);
    }
  }

  const out = [];
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    const scored = list.map((item) => {
      const use = usage(item.id);
      return { ...item, usage: use, weight: weight(item, use), linked: !!item.shopify_variant_id };
    });
    // The fullest record first: that is the one to keep.
    scored.sort((a, b) => b.weight - a.weight || a.id - b.id);
    out.push({
      key: shape(scored[0].name),
      reason: reason(scored[0], scored[1]),
      keep: scored[0],
      others: scored.slice(1),
    });
  }

  out.sort((a, b) => a.keep.name.localeCompare(b.keep.name));
  return out;
}

/**
 * Fold one item into another: everything that pointed at the loser points at
 * the keeper, and the loser goes.
 *
 * The keeper's own details are left alone — its name, its costing, its recipe
 * are what you meant. It only gains what it was missing: a Shopify link, a
 * photo, a barcode, stock on hand. Filling a blank cannot lose anything;
 * overwriting could, which is why nothing is overwritten.
 */
function merge(keepId, dropIds) {
  const keep = db.prepare('SELECT * FROM items WHERE id = ?').get(keepId);
  if (!keep) {
    const err = new Error('The item to keep was not found');
    err.status = 404;
    throw err;
  }

  const drops = dropIds
    .map(Number)
    .filter((id) => id !== keepId)
    .map((id) => db.prepare('SELECT * FROM items WHERE id = ?').get(id))
    .filter(Boolean);

  if (!drops.length) {
    const err = new Error('Nothing to merge in');
    err.status = 400;
    throw err;
  }

  const moved = { order_lines: 0, print_jobs: 0, recipe_lines: 0, used_in_others: 0, channel_prices: 0, stock: 0 };
  const gained = [];

  db.transaction(() => {
    for (const drop of drops) {
      const use = usage(drop.id);
      moved.order_lines += use.order_lines;
      moved.print_jobs += use.print_jobs;
      moved.recipe_lines += use.recipe_lines;
      moved.used_in_others += use.used_in_others;

      db.prepare('UPDATE order_items SET item_id = ? WHERE item_id = ?').run(keepId, drop.id);
      db.prepare('UPDATE queue_jobs SET item_id = ? WHERE item_id = ?').run(keepId, drop.id);
      db.prepare("UPDATE item_components SET ref_id = ? WHERE component_type = 'item' AND ref_id = ?")
        .run(keepId, drop.id);
      db.prepare("UPDATE queue_picks SET ref_id = ? WHERE line_type = 'item' AND ref_id = ?")
        .run(keepId, drop.id);
      db.prepare("UPDATE stock_log SET entity_id = ? WHERE entity_type = 'item' AND entity_id = ?")
        .run(keepId, drop.id);

      // A recipe line the keeper does not already have. Two rows for the same
      // component would double that component's cost.
      const keepHas = new Set(db.prepare('SELECT component_type, ref_id FROM item_components WHERE item_id = ?')
        .all(keepId).map((c) => `${c.component_type}:${c.ref_id}`));
      for (const comp of db.prepare('SELECT * FROM item_components WHERE item_id = ?').all(drop.id)) {
        if (keepHas.has(`${comp.component_type}:${comp.ref_id}`)) continue;
        db.prepare(`INSERT INTO item_components (item_id, component_type, ref_id, quantity, notes)
                    VALUES (?, ?, ?, ?, ?)`)
          .run(keepId, comp.component_type, comp.ref_id, comp.quantity, comp.notes);
      }

      // A channel price only where the keeper has none for that channel.
      for (const price of db.prepare('SELECT * FROM item_channel_prices WHERE item_id = ?').all(drop.id)) {
        const done = db.prepare('SELECT 1 FROM item_channel_prices WHERE item_id = ? AND channel = ?')
          .get(keepId, price.channel);
        if (done) continue;
        db.prepare('INSERT INTO item_channel_prices (item_id, channel, price) VALUES (?, ?, ?)')
          .run(keepId, price.channel, price.price);
        moved.channel_prices += 1;
      }

      // Stock is a count of physical things. Both rows were counting the same
      // shelf, so the stock follows rather than being thrown away.
      const stock = Number(drop.qty_on_hand) || 0;
      if (stock) {
        db.prepare('UPDATE items SET qty_on_hand = COALESCE(qty_on_hand, 0) + ? WHERE id = ?').run(stock, keepId);
        moved.stock += stock;
      }

      // Blanks the keeper can fill from the copy. The unique codes have to come
      // free on the loser first, so it is emptied before the keeper takes them.
      const fillable = [
        ['shopify_product_id', drop.shopify_product_id],
        ['shopify_variant_id', drop.shopify_variant_id],
        ['shopify_inventory_item_id', drop.shopify_inventory_item_id],
        ['image_url', drop.image_url],
        ['barcode', drop.barcode],
        ['description', drop.description],
        ['category', drop.category],
      ];
      db.prepare(`UPDATE items SET sku = NULL, barcode = NULL, shopify_product_id = NULL,
                  shopify_variant_id = NULL, shopify_inventory_item_id = NULL WHERE id = ?`).run(drop.id);

      const current = db.prepare('SELECT * FROM items WHERE id = ?').get(keepId);
      for (const [column, value] of fillable) {
        if (!value || current[column]) continue;
        try {
          db.prepare(`UPDATE items SET ${column} = ? WHERE id = ?`).run(value, keepId);
          gained.push(column);
        } catch { /* another item holds that code */ }
      }

      db.prepare('DELETE FROM items WHERE id = ?').run(drop.id);
    }

    db.prepare('UPDATE items SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(keepId);
  })();

  const after = db.prepare('SELECT * FROM items WHERE id = ?').get(keepId);
  const names = drops.map((d) => d.name);
  return {
    item: after,
    merged: names,
    moved,
    gained: [...new Set(gained)],
    message: `${names.join(', ')} folded into ${after.name}`,
  };
}

module.exports = { find, merge, shape };
