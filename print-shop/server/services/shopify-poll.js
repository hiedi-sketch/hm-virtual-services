const shopify = require('../utils/shopify');
const sync = require('./shopify-sync');

/**
 * A safety net under the webhooks, not a replacement for them.
 *
 * Webhooks are what make an order appear the moment it is placed, but Shopify
 * gives up after a few hours of failed deliveries and a deploy at the wrong
 * moment is enough to miss one. This sweeps up anything that never arrived.
 * Orders already here are recognised by their Shopify id, so a poll that finds
 * nothing new does nothing at all.
 */

const DEFAULT_MINUTES = 15;
let timer = null;
let running = false;

function intervalMinutes() {
  const raw = Number(process.env.SHOPIFY_POLL_MINUTES);
  if (Number.isFinite(raw) && raw <= 0) return 0;             // explicitly off
  if (Number.isFinite(raw) && raw >= 1) return raw;
  return DEFAULT_MINUTES;
}

async function sweep() {
  // Overlapping runs would both try to insert the same order.
  if (running) return null;
  if (!shopify.getConfig().configured) return null;

  running = true;
  try {
    const result = await sync.pullOrders({});
    if (result.created.length) {
      console.log(`Shopify sweep picked up ${result.created.length} order(s) the webhooks missed.`);
    }
    return result;
  } catch (err) {
    // Already written to the sync log by pullOrders; a backstop failing is not
    // worth taking the shop down for.
    console.error('Shopify sweep failed:', err.message);
    return null;
  } finally {
    running = false;
  }
}

function start() {
  const minutes = intervalMinutes();
  if (!minutes) {
    console.log('Shopify order sweep is off (SHOPIFY_POLL_MINUTES=0).');
    return null;
  }
  stop();
  timer = setInterval(sweep, minutes * 60000);
  // Never hold the process open on its own account.
  if (timer.unref) timer.unref();
  console.log(`Shopify order sweep every ${minutes} minutes, behind the webhooks.`);
  return timer;
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, sweep, intervalMinutes, DEFAULT_MINUTES };
