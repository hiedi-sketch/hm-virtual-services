const express = require('express');
const db = require('../db/database');
const { getSettings, NUMERIC_DEFAULTS } = require('../utils/costing');

const router = express.Router();

const ALLOWED = ['shop_name', 'sku_prefix', ...Object.keys(NUMERIC_DEFAULTS)];

router.get('/', (req, res) => res.json({ data: getSettings() }));

router.put('/', (req, res) => {
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  db.transaction(() => {
    for (const key of ALLOWED) {
      if (req.body[key] !== undefined) upsert.run(key, String(req.body[key]));
    }
  })();
  res.json({ data: getSettings(), message: 'Settings saved' });
});

module.exports = router;
