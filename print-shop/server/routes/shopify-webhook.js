const express = require('express');
const shopify = require('../utils/shopify');
const sync = require('../services/shopify-sync');

const router = express.Router();

/**
 * Where Shopify pushes orders. This is the one endpoint in the shop that is
 * not behind a sign-in — Shopify has no account here — so the signature on the
 * body is what stands in for one. Anything that does not verify is dropped
 * without being read.
 */
router.post('/', (req, res) => {
  const signature = req.get('X-Shopify-Hmac-Sha256');
  const topic = req.get('X-Shopify-Topic') || '';
  const shopDomain = req.get('X-Shopify-Shop-Domain');

  const { domain, secret } = shopify.getConfig();
  if (!secret) {
    // Answering 200 would tell Shopify this landed. It did not.
    return res.status(503).json({ error: 'No webhook secret is set up here yet' });
  }
  if (!shopify.verifyWebhook(req.rawBody, signature)) {
    return res.status(401).json({ error: 'Bad signature' });
  }
  // A valid signature from a shop this install does not serve is still not ours.
  if (domain && shopDomain && shopDomain.toLowerCase() !== domain.toLowerCase()) {
    return res.status(401).json({ error: 'Wrong shop' });
  }

  if (!topic.startsWith('orders/')) {
    return res.json({ ok: true, ignored: topic });
  }

  try {
    const outcome = sync.applyWebhook(topic, req.body || {});
    return res.json({ ok: true, ...outcome });
  } catch (err) {
    // A non-2xx makes Shopify try again, which is what a transient failure
    // deserves. The order is not lost either way — the poll picks it up.
    console.error(`Shopify webhook ${topic} failed:`, err.message);
    return res.status(500).json({ error: 'Could not take that order in' });
  }
});

module.exports = router;
