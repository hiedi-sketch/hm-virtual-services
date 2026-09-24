const express = require('express');
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

module.exports = router;
