const express = require('express');
const shopify = require('../utils/shopify');
const state = require('../services/oauth-state');

const router = express.Router();

/**
 * Where Shopify sends her back after she approves the app.
 *
 * Like the webhook, this sits outside the sign-in — Shopify is redirecting a
 * browser, and there is no way to carry an Authorization header through a
 * redirect. Three things stand in for it, and all three must hold:
 *
 *   1. the `state` nonce was issued by this shop, minutes ago, and is unused
 *   2. the shop it comes back for is the shop that nonce was issued for
 *   3. the parameters carry Shopify's signature, made with our client secret
 *
 * Nothing is stored until all three pass.
 */

/** Send her back to the settings page with the outcome in the address bar. */
function finish(res, params) {
  const query = new URLSearchParams(params).toString();
  return res.redirect(`/settings?${query}`);
}

router.get('/callback', async (req, res) => {
  const { code, shop, state: nonce } = req.query;

  const issued = state.redeem(nonce);
  if (!issued) {
    return finish(res, {
      shopify: 'error',
      reason: 'That connect link is stale. Start again from Settings.',
    });
  }

  // A signed callback for a different store than the one she asked to connect.
  const domain = shopify.normaliseDomain(shop);
  if (!domain || domain !== issued.shop) {
    return finish(res, { shopify: 'error', reason: 'That came back for a different store.' });
  }

  if (!shopify.verifyOAuthCallback(req.query)) {
    return finish(res, {
      shopify: 'error',
      reason: 'Shopify\'s signature did not check out. Confirm the client secret is right.',
    });
  }

  if (!code) {
    return finish(res, { shopify: 'error', reason: 'Shopify sent no authorisation code.' });
  }

  try {
    const result = await shopify.exchangeCode({ shop: domain, code });
    shopify.saveConfig({ domain: result.domain, token: result.token });

    // Approving with fewer scopes than asked for leaves the shop half-working;
    // better to say so now than to fail on the first sync.
    const missing = shopify.missingScopes(result.scopes);
    return finish(res, missing.length
      ? { shopify: 'partial', reason: `Connected, but without ${missing.join(' and ')}. Release a new app version with those scopes and connect again.` }
      : { shopify: 'connected' });
  } catch (err) {
    return finish(res, { shopify: 'error', reason: err.message });
  }
});

module.exports = router;
