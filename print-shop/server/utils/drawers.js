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

/**
 * The product a scanned code belongs to.
 *
 * At a drawer she scans what is in her hand, and what is in her hand is a
 * product label. Anything else — a spool, an order ticket, a bin — is said so
 * by name, because "not found" at a drawer with a spool in your hand is a
 * puzzle and "that is a spool" is not.
 */
function itemByCode(code) {
  const text = String(code || '').trim();
  if (!text) return null;
  return db.prepare(
    'SELECT id, name, sku FROM items WHERE barcode = ? OR sku = ? OR vendor_barcode = ?'
  ).get(text, text, text) || null;
}

/**
 * Put something in a drawer, by what was scanned at it or by what was picked
 * from the list. Answers with the drawer as it now stands, so the sheet she is
 * looking at can redraw itself without asking again.
 */
function fileInDrawer(code, { item_id: itemId, code: scanned }) {
  const at = normalise(code);
  if (!isKnown(at)) {
    const err = new Error(`${at || 'That'} is not one of the drawers`);
    err.status = 404;
    throw err;
  }

  let item = null;
  if (itemId) {
    item = db.prepare('SELECT id, name FROM items WHERE id = ?').get(Number(itemId));
    if (!item) {
      const err = new Error('That is not in the catalog');
      err.status = 404;
      throw err;
    }
  } else {
    item = itemByCode(scanned);
    if (!item) {
      const err = new Error(`Nothing in the catalog carries ${String(scanned || '').trim()}`);
      err.status = 404;
      throw err;
    }
  }

  const was = db.prepare('SELECT drawer FROM items WHERE id = ?').get(item.id)?.drawer;
  const from = normalise(was);
  db.prepare('UPDATE items SET drawer = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(at, item.id);

  return {
    drawer: find(at),
    // Moving something is worth saying out loud: a product lives in one drawer,
    // so filing it here is taking it out of wherever it was.
    message: from && from !== at
      ? `${item.name} moved from ${from} to ${at}`
      : from === at ? `${item.name} was already in ${at}` : `${item.name} filed in ${at}`,
  };
}

/** Take something out of a drawer, leaving it with no drawer at all. */
function clearFromDrawer(code, itemId) {
  const at = normalise(code);
  const item = db.prepare('SELECT id, name, drawer FROM items WHERE id = ?').get(Number(itemId));
  if (!item) {
    const err = new Error('That is not in the catalog');
    err.status = 404;
    throw err;
  }
  if (normalise(item.drawer) !== at) {
    const err = new Error(`${item.name} is not in ${at}`);
    err.status = 400;
    throw err;
  }

  db.prepare('UPDATE items SET drawer = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(item.id);
  return { drawer: find(at), message: `${item.name} taken out of ${at}` };
}

module.exports = {
  drawerList, occupancy, find, assign, normalise, isKnown, DEFAULT_DRAWERS,
  itemByCode, fileInDrawer, clearFromDrawer,
};
