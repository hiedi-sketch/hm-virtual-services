const db = require('../db/database');

/**
 * The drawers finished stock is kept in, waiting for an order.
 *
 * The same shape as the filament rack: a list of names in Settings rather than
 * rows in a table, because a drawer is a place rather than a thing the shop
 * owns. What is *in* a drawer is not stored here either — a product carries the
 * drawer it lives in, so the drawer's contents are read back from the catalog
 * and the two can never disagree.
 *
 * A drawer holds one or two products and a product lives in one drawer, which
 * is a rule about her furniture rather than one worth enforcing in code: two
 * products in a drawer is normal, three is her problem to notice, and the
 * listing says how many so she can.
 */
const DEFAULT_DRAWERS = Array.from({ length: 24 }, (_, i) => `D${i + 1}`).join(',');

function parseList(value, fallback) {
  return String(value ?? fallback)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

/** Every drawer she has, in the order they are written down. */
function drawerList() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'stock_drawers'").get();
  return parseList(row?.value, DEFAULT_DRAWERS);
}

function normalise(value) {
  const text = String(value || '').trim().toUpperCase();
  return text || null;
}

function isKnown(code) {
  const at = normalise(code);
  return !!at && drawerList().includes(at);
}

/** What is kept in each drawer, read back from the products themselves. */
function occupancy() {
  const codes = drawerList();
  const rows = db.prepare(`
    SELECT id, name, sku, barcode, qty_on_hand, image_url, drawer
      FROM items
     WHERE drawer IS NOT NULL AND drawer <> '' AND is_active = 1
     ORDER BY name
  `).all();

  const byDrawer = new Map();
  for (const item of rows) {
    const at = normalise(item.drawer);
    if (!byDrawer.has(at)) byDrawer.set(at, []);
    byDrawer.get(at).push({
      id: item.id,
      name: item.name,
      sku: item.sku,
      barcode: item.barcode,
      qty_on_hand: Number(item.qty_on_hand) || 0,
      image_url: item.image_url,
    });
  }

  const describe = (code) => {
    const items = byDrawer.get(code) || [];
    return {
      code,
      items,
      units: items.reduce((sum, i) => sum + i.qty_on_hand, 0),
      empty: items.length === 0,
    };
  };

  // A product left in a drawer that has since been taken off the list still
  // has to be findable, the same way a spool on a retired shelf slot is.
  const known = new Set(codes);
  const strays = [...byDrawer.keys()].filter((code) => !known.has(code)).sort().map(describe);

  return {
    drawers: codes.map(describe),
    unlisted: strays,
    unassigned: db.prepare(`
      SELECT COUNT(*) AS count FROM items
       WHERE item_type = 'product' AND is_active = 1 AND (drawer IS NULL OR drawer = '')
    `).get().count,
  };
}

/** One drawer and what is in it, or null if there is no such drawer. */
function find(code) {
  const at = normalise(code);
  if (!at) return null;
  const rack = occupancy();
  return [...rack.drawers, ...rack.unlisted].find((d) => d.code === at) || null;
}

/**
 * Put a product in a drawer, or take it out of one with null.
 *
 * An unrecognised drawer is refused rather than stored, because a product filed
 * under a drawer that does not exist is lost in a way that looks like it is not.
 */
function assign(itemId, code) {
  const item = db.prepare('SELECT id, name FROM items WHERE id = ?').get(itemId);
  if (!item) {
    const err = new Error('That is not in the catalog');
    err.status = 404;
    throw err;
  }

  const at = normalise(code);
  if (at && !isKnown(at)) {
    const err = new Error(`${at} is not one of the drawers`);
    err.status = 400;
    throw err;
  }

  db.prepare('UPDATE items SET drawer = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(at, item.id);
  return {
    item_id: item.id,
    item_name: item.name,
    drawer: at,
    message: at ? `${item.name} lives in ${at}` : `${item.name} has no drawer now`,
  };
}

module.exports = { drawerList, occupancy, find, assign, normalise, isKnown, DEFAULT_DRAWERS };
