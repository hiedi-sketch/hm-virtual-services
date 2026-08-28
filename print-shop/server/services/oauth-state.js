const crypto = require('crypto');
const db = require('../db/database');

/**
 * The nonce that ties a Shopify connect back to the person who started it.
 *
 * Shopify sends her browser back to a URL that carries no sign-in — that is
 * simply how the redirect works — so the callback cannot ask who she is. What
 * it can do is check that the round trip began at this shop, minutes ago, and
 * has not been used before. That is what this table is.
 */

const LIFETIME_MINUTES = 15;

/** Start a connect attempt and hand back the nonce to send to Shopify. */
function issue(shop, provider = 'shopify') {
  const state = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO oauth_states (state, provider, shop) VALUES (?, ?, ?)')
    .run(state, provider, shop);
  sweep();
  return state;
}

/**
 * Spend a nonce. Returns what it was issued for, or null if it is unknown,
 * stale, or already used — a replayed callback finds nothing here.
 */
function redeem(state, provider = 'shopify') {
  if (!state) return null;

  const row = db.prepare(`
    SELECT *, CAST((julianday('now') - julianday(created_at)) * 1440 AS REAL) AS age_minutes
      FROM oauth_states WHERE state = ? AND provider = ?
  `).get(String(state), provider);
  if (!row) return null;

  // Single use, whether or not it turns out to be valid.
  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(row.state);
  if (row.age_minutes > LIFETIME_MINUTES) return null;

  return { shop: row.shop, created_at: row.created_at };
}

/** Abandoned attempts would otherwise sit here forever. */
function sweep() {
  db.prepare(
    "DELETE FROM oauth_states WHERE (julianday('now') - julianday(created_at)) * 1440 > ?"
  ).run(LIFETIME_MINUTES);
}

module.exports = { issue, redeem, sweep, LIFETIME_MINUTES };
