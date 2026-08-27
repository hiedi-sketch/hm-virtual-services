const db = require('../db/database');
const { encrypt, decrypt, maskToken } = require('./secrets');

const DEFAULT_API_VERSION = '2026-01';

// ── Stored configuration ─────────────────────────────────────────────────────

function readSetting(key) {
  return db.prepare('SELECT value FROM integrations WHERE key = ?').get(key)?.value ?? null;
}

function writeSetting(key, value) {
  db.prepare(`
    INSERT INTO integrations (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, value);
}

/**
 * Accepts whatever someone pastes — "mystore", the admin URL, the storefront
 * domain — and returns the myshopify host the API actually wants.
 */
function normaliseDomain(input) {
  let text = String(input || '').trim().toLowerCase();
  if (!text) return null;
  text = text.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!text.includes('.')) text = `${text}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(text) ? text : null;
}

function getConfig() {
  // Environment wins, so the token can live in Render's settings instead of
  // the database if that is preferred.
  const domain = normaliseDomain(process.env.SHOPIFY_STORE_DOMAIN || readSetting('shopify_domain'));
  const token = process.env.SHOPIFY_ACCESS_TOKEN || decrypt(readSetting('shopify_token'));
  const apiVersion = process.env.SHOPIFY_API_VERSION || readSetting('shopify_api_version') || DEFAULT_API_VERSION;
  return {
    domain,
    token,
    apiVersion,
    configured: !!(domain && token),
    fromEnvironment: !!(process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_ACCESS_TOKEN),
  };
}

function saveConfig({ domain, token, apiVersion }) {
  if (domain !== undefined) {
    const clean = normaliseDomain(domain);
    if (domain && !clean) {
      const err = new Error('That does not look like a Shopify store address');
      err.status = 400;
      throw err;
    }
    writeSetting('shopify_domain', clean);
  }
  // An empty token means "leave what is stored alone"; null clears it.
  if (token !== undefined && token !== '') {
    writeSetting('shopify_token', token === null ? null : encrypt(String(token).trim()));
  }
  if (apiVersion !== undefined) {
    writeSetting('shopify_api_version', String(apiVersion || DEFAULT_API_VERSION).trim());
  }
  return getConfig();
}

/** Safe to hand to the browser: says whether it is set up, never the token. */
function publicConfig() {
  const config = getConfig();
  return {
    domain: config.domain,
    api_version: config.apiVersion,
    configured: config.configured,
    token_hint: maskToken(config.token),
    from_environment: config.fromEnvironment,
    default_api_version: DEFAULT_API_VERSION,
  };
}

// ── Calling Shopify ──────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class ShopifyError extends Error {
  constructor(message, { status, detail } = {}) {
    super(message);
    this.name = 'ShopifyError';
    this.status = status || 502;
    this.detail = detail;
  }
}

/**
 * One GraphQL call, with the two things Shopify will do to you: hand back a
 * 429 when you are going too fast, and hand back a 200 whose body says
 * THROTTLED. Both are retried; everything else is reported as it came.
 */
async function graphql(query, variables = {}, { attempt = 0 } = {}) {
  const { domain, token, apiVersion, configured } = getConfig();
  if (!configured) throw new ShopifyError('Shopify is not connected yet', { status: 400 });

  // SHOPIFY_API_BASE swaps the origin out so the sync can be exercised against
  // a stand-in server. Unset in normal use, which is every real deployment.
  const origin = process.env.SHOPIFY_API_BASE || `https://${domain}`;
  const url = `${origin}/admin/api/${apiVersion}/graphql.json`;
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw new ShopifyError(
      err.name === 'TimeoutError'
        ? 'Shopify took too long to answer'
        : `Could not reach ${domain}`,
      { status: 504, detail: err.message }
    );
  }

  if (response.status === 429) {
    if (attempt >= 4) throw new ShopifyError('Shopify is rate limiting us', { status: 429 });
    const wait = Number(response.headers.get('Retry-After') || 2) * 1000;
    await sleep(wait);
    return graphql(query, variables, { attempt: attempt + 1 });
  }

  if (response.status === 401 || response.status === 403) {
    throw new ShopifyError(
      'Shopify rejected the access token. Check it is right and that the app has read_products and read_orders.',
      { status: 401 }
    );
  }

  if (response.status === 404) {
    throw new ShopifyError(
      `Shopify has no API version "${apiVersion}". Set a supported version in Settings.`,
      { status: 400 }
    );
  }

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ShopifyError('Shopify sent something that was not JSON', {
      status: 502,
      detail: text.slice(0, 300),
    });
  }

  if (!response.ok) {
    throw new ShopifyError(body?.errors ? JSON.stringify(body.errors).slice(0, 300) : `Shopify returned ${response.status}`, {
      status: response.status,
    });
  }

  if (Array.isArray(body.errors) && body.errors.length) {
    const throttled = body.errors.some((e) => e?.extensions?.code === 'THROTTLED');
    if (throttled && attempt < 4) {
      await sleep(2000 * (attempt + 1));
      return graphql(query, variables, { attempt: attempt + 1 });
    }
    const first = body.errors[0];
    throw new ShopifyError(first?.message || 'Shopify rejected the query', {
      status: 400,
      detail: JSON.stringify(body.errors).slice(0, 500),
    });
  }

  // Ease off before the bucket runs dry rather than after.
  const throttle = body.extensions?.cost?.throttleStatus;
  if (throttle && throttle.currentlyAvailable < 200) {
    await sleep(1000);
  }

  return body.data;
}

/** Walk a connection to the end, one page at a time. */
async function paginate(query, variables, pick, { pageLimit = 40 } = {}) {
  const all = [];
  let cursor = null;
  for (let page = 0; page < pageLimit; page += 1) {
    const data = await graphql(query, { ...variables, cursor });
    const connection = pick(data);
    all.push(...(connection?.nodes || []));
    if (!connection?.pageInfo?.hasNextPage) return { nodes: all, complete: true };
    cursor = connection.pageInfo.endCursor;
  }
  // Stop rather than loop forever; the caller reports the partial result.
  return { nodes: all, complete: false };
}

/** Confirms the credentials work and says which shop they belong to. */
async function testConnection() {
  const data = await graphql(`{ shop { name myshopifyDomain currencyCode } }`);
  return data.shop;
}

module.exports = {
  DEFAULT_API_VERSION,
  normaliseDomain,
  getConfig,
  saveConfig,
  publicConfig,
  graphql,
  paginate,
  testConnection,
  ShopifyError,
};
