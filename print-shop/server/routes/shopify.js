const express = require('express');
const shopify = require('../utils/shopify');
const sync = require('../services/shopify-sync');
const poll = require('../services/shopify-poll');
const oauthState = require('../services/oauth-state');

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
      secret: req.body.secret,
      apiKey: req.body.api_key,
    });
    res.json({ data: shopify.publicConfig(), message: 'Saved' });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/', (req, res) => {
  shopify.saveConfig({ domain: null, token: null, secret: null, apiKey: null });
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

/**
 * Begin connecting. Only someone signed in here can start a round trip, which
 * is what makes the unauthenticated callback safe to have at all.
 */
router.post('/oauth/start', (req, res) => {
  const config = shopify.getConfig();
  const domain = shopify.normaliseDomain(req.body.shop || config.domain);
  if (!domain) {
    return res.status(400).json({ error: 'Enter your store address first, like mystore.myshopify.com' });
  }
  if (!config.apiKey || !config.secret) {
    return res.status(400).json({ error: 'Save your app\'s client ID and client secret first' });
  }

  try {
    const redirectUri = `${publicOrigin(req)}/api/shopify/oauth/callback`;
    const url = shopify.authorizeUrl({
      shop: domain,
      redirectUri,
      state: oauthState.issue(domain),
    });
    res.json({ data: { url, redirect_uri: redirectUri }, message: 'Off to Shopify' });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

/** The address Shopify must be told to allow, shown so it can be copied. */
router.get('/oauth/redirect-uri', (req, res) => {
  res.json({ data: { redirect_uri: `${publicOrigin(req)}/api/shopify/oauth/callback` } });
});

/**
 * Where this shop is reachable from the outside, which is what Shopify has to
 * be told to push to. Behind Render's proxy the request host is the public
 * one, so it can be read off rather than configured.
 */
function publicOrigin(req) {
  const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  return String(base).replace(/\/+$/, '');
}

function callbackUrl(req) {
  return `${publicOrigin(req)}/api/shopify/webhook`;
}

/** What Shopify is currently set up to push here, if anything. */
router.get('/webhooks', async (req, res) => {
  try {
    const hooks = await shopify.listWebhooks();
    const url = callbackUrl(req);
    res.json({
      data: {
        callback_url: url,
        has_secret: shopify.publicConfig().has_secret,
        order_topics: shopify.ORDER_TOPICS,
        subscriptions: hooks,
        live: shopify.ORDER_TOPICS.every((t) => hooks.some((h) => h.topic === t && h.url === url)),
        sweep_minutes: poll.intervalMinutes(),
      },
    });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message, detail: err.detail });
  }
});

/** Ask Shopify to push new orders here as they are placed. */
router.post('/webhooks', async (req, res) => {
  if (!shopify.publicConfig().has_secret) {
    return res.status(400).json({
      error: 'Paste your app\'s API secret key in first — without it a pushed order cannot be proved to have come from Shopify.',
    });
  }
  try {
    const url = req.body.callback_url || callbackUrl(req);
    const result = await shopify.registerOrderWebhooks(url);
    const total = result.created.length + result.kept.length;
    res.json({
      data: { ...result, callback_url: url },
      message: result.created.length
        ? `Shopify will push orders here now (${total} topic(s) set up)`
        : 'Already set up — Shopify is pushing orders here',
    });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message, detail: err.detail });
  }
});

/** Stop the push. The sweep still picks orders up on its own schedule. */
router.delete('/webhooks', async (req, res) => {
  try {
    const removed = await shopify.removeOrderWebhooks();
    res.json({ data: { removed }, message: `Stopped ${removed.length} subscription(s)` });
  } catch (err) {
    res.status(err.status || 502).json({ error: err.message, detail: err.detail });
  }
});

/** Run the backstop sweep now rather than waiting for the timer. */
router.post('/sweep', async (req, res) => {
  const result = await poll.sweep();
  if (!result) return res.status(400).json({ error: 'Nothing to sweep — Shopify is not connected' });
  res.json({
    data: result,
    message: `${result.created.length} new order(s), ${result.already_here} already here`,
  });
});

module.exports = router;
