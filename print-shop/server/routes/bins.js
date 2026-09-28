const express = require('express');
const db = require('../db/database');
const bins = require('../services/bins');

const router = express.Router();

/** The shelf: every bin, in order, with whatever is sitting in it. */
router.get('/', (req, res) => res.json({ data: bins.list() }));

/** One bin, by the code on its front. */
router.get('/:code', (req, res) => {
  const bin = bins.byCode(req.params.code);
  if (!bin) return res.status(404).json({ error: 'No bin with that code' });
  res.json({ data: bin });
});

/**
 * The post office has been. Everything in the Mail Bin — or just the parcels
 * named — goes out and is marked shipped in one move.
 */
router.post('/:code/picked-up', (req, res) => {
  try {
    const orderIds = Array.isArray(req.body?.order_ids) ? req.body.order_ids : null;
    res.json(bins.pickedUp(req.params.code, { orderIds }));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * The Stock bin's own list: what has come off the printer for the shelf and
 * has not been carried to inventory yet.
 *
 * Everything below moves things between the basket and the inventory shelves,
 * and none of it moves stock — those units are on hand either way.
 */

/** Resolve an item by id or by whatever was scanned off it. */
function findItem(body) {
  if (body.item_id) return db.prepare('SELECT * FROM items WHERE id = ?').get(body.item_id);
  const code = String(body.code || '').trim();
  if (!code) return null;
  return db.prepare('SELECT * FROM items WHERE barcode = ? OR sku = ? OR vendor_barcode = ?').get(code, code, code);
}

/** Put something into the Stock bin — scanned in, or added by hand. */
router.post('/stock/items', (req, res) => {
  const item = findItem(req.body || {});
  if (!item) return res.status(404).json({ error: 'Nothing in the catalog matches that' });
  try {
    const quantity = req.body.quantity === undefined ? 1 : Number(req.body.quantity);
    // "count" is the number she has just counted in the basket; otherwise the
    // number is added to what is already in there, which is what a scan means.
    if (req.body.mode === 'count') return res.json(bins.countInStock(item.id, quantity));
    if (!(quantity > 0)) return res.status(400).json({ error: 'How many?' });
    bins.putInStock(item.id, quantity);
    const bin = bins.stockBin();
    const now = bin?.items.find((r) => r.item_id === item.id)?.quantity ?? quantity;
    return res.json({ bin, item_name: item.name, quantity: now, message: `${now} × ${item.name} in ${bin?.label || 'the Stock bin'}` });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
});

/** Carried to the inventory shelves. Pass no quantity to put the lot away. */
router.post('/stock/items/:itemId/away', (req, res) => {
  try {
    const quantity = req.body?.quantity === undefined ? null : Number(req.body.quantity);
    res.json(bins.putAwayStock(Number(req.params.itemId), quantity));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/** The whole basket carried over at once. */
router.post('/stock/empty', (req, res) => {
  try {
    res.json(bins.emptyStock());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
