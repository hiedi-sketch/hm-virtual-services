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

/**
 * Send her back to the settings page with the outcome in the address bar, and
 * put the same line in the server log. The page tidies the URL as soon as it
 * has read it, so the log is the only copy that survives — and it is the copy
 * available when the screen says something unhelpful.
 */
function finish(res, params) {
  if (params.shopify !== 'connected') {
    console.error(`Shopify connect ${params.shopify}: ${params.reason || '(no reason given)'}`);
  } else {
    console.log('Shopify connect: connected');
  }
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

  const domain = shopify.normaliseDomain(shop);
  if (!domain) {
    return finish(res, {
      shopify: 'error',
      reason: `Shopify came back naming a store this shop cannot read: "${String(shop || '').slice(0, 60)}".`,
    });
  }

  // A signed callback for a different store than the one she asked to connect.
  // Naming both is the difference between a dead end and an obvious fix — the
  // usual cause is being signed into a different store than the one typed in.
  if (domain !== issued.shop) {
    return finish(res, {
      shopify: 'error',
      reason: `You asked to connect ${issued.shop}, but Shopify sent you back from ${domain}. `
        + `Put ${domain} in the store address if that is the shop you want, then connect again.`,
    });
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
