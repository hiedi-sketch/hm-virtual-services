const express = require('express');
const db = require('../db/database');
const { getSettings, NUMERIC_DEFAULTS, TEXT_DEFAULTS } = require('../utils/costing');

const router = express.Router();

// Everything the Settings screen may write. Both default lists are spread in,
// so a setting added to either is saveable the moment it exists rather than
// looking saved and quietly not being.
const ALLOWED = [
  'shop_name', 'sku_prefix', 'shelf_locations', 'ams_slots', 'sales_channels', 'stock_drawers',
  ...Object.keys(NUMERIC_DEFAULTS),
  ...Object.keys(TEXT_DEFAULTS),
];

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

/**
 * The key Claude connects with, and where to point it.
 *
 * Kept off the main settings payload: everything else there is a number she
 * tunes, and this is a credential. It is read deliberately, from the one card
 * that shows it.
 */
router.get('/mcp', (req, res) => {
  const { apiKey } = require('../mcp');
  res.json({
    data: {
      key: apiKey(),
      // Whatever host she reached this on, which is the one Claude must use.
      url: `${req.protocol}://${req.get('host')}/mcp`,
    },
  });
});

/** A new key, when the old one has been somewhere it should not have been. */
router.post('/mcp/rotate', (req, res) => {
  db.prepare("DELETE FROM settings WHERE key = 'mcp_api_key'").run();
  const { apiKey } = require('../mcp');
  res.json({
    data: { key: apiKey(), url: `${req.protocol}://${req.get('host')}/mcp` },
    message: 'New key made. Reconnect Claude with it — the old one stops working now.',
  });
});

module.exports = router;
