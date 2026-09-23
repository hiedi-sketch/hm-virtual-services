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

module.exports = router;
