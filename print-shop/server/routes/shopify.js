const express = require('express');
const shopify = require('../utils/shopify');
const sync = require('../services/shopify-sync');

const router = express.Router();

/** Connection state. Never returns the token itself. */
router.get('/', (req, res) => {
  res.json({ data: { ...shopify.publicConfig(), history: sync.history(8) } });
});

router.put('/', (req, res) => {
  try {
    shopify.saveConfig({
      domain: req.body.domain,
      token: req.body.token,
      apiVersion: req.body.api_version,
    });
    res.json({ data: shopify.publicConfig(), message: 'Saved' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/', (req, res) => {
  shopify.saveConfig({ domain: null, token: null });
  res.json({ data: shopify.publicConfig(), message: 'Disconnected from Shopify' });
});

router.post('/test', async (req, res) => {
  try {
    const shop = await shopify.testConnection();
    res.json({ data: shop, message: `Connected to ${shop.name}` });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message, detail: err.detail });
  }
});

router.post('/pull/products', async (req, res) => {
  try {
    const result = await sync.pullProducts({ dryRun: !!req.body.dry_run });
    const { created, linked, already_linked: already, skipped } = result;
    res.json({
      data: result,
      message: req.body.dry_run
        ? `Would add ${created.length} and link ${linked.length}`
        : `${created.length} added, ${linked.length} linked, ${already} already linked${skipped.length ? `, ${skipped.length} skipped` : ''}`,
    });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message, detail: err.detail });
  }
});

router.post('/pull/orders', async (req, res) => {
  try {
    const result = await sync.pullOrders({
      sinceDays: req.body.since_days ? Number(req.body.since_days) : null,
      dryRun: !!req.body.dry_run,
    });
    res.json({
      data: result,
      message: req.body.dry_run
        ? `Would bring in ${result.created.length} order(s)`
        : `${result.created.length} new order(s), ${result.already_here} already here`,
    });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message, detail: err.detail });
  }
});

module.exports = router;
