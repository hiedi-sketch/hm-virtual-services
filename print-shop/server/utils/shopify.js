const crypto = require('crypto');
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
  // Signs the webhooks Shopify pushes at us. Shopify calls it the API secret
  // key; it is not the access token and cannot be derived from it.
  const secret = process.env.SHOPIFY_API_SECRET || decrypt(readSetting('shopify_api_secret'));
  return {
    domain,
    token,
    apiVersion,
    secret,
    configured: !!(domain && token),
    fromEnvironment: !!(process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_ACCESS_TOKEN),
  };
}

function saveConfig({ domain, token, apiVersion, secret }) {
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
  if (secret !== undefined && secret !== '') {
    writeSetting('shopify_api_secret', secret === null ? null : encrypt(String(secret).trim()));
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
    has_secret: !!config.secret,
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

// ── Webhooks ─────────────────────────────────────────────────────────────────

/** The topics that keep orders here in step with orders there. */
const ORDER_TOPICS = ['ORDERS_CREATE', 'ORDERS_UPDATED', 'ORDERS_CANCELLED'];

/**
 * Is this really from Shopify? The body is signed with the app's API secret,
 * so anything that does not match the signature is thrown away unread.
 *
 * Compared with `timingSafeEqual`, and only after a length check, since that
 * function throws on a length mismatch rather than returning false.
 */
function verifyWebhook(rawBody, signature) {
  const { secret } = getConfig();
  if (!secret || !signature || !rawBody) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const WEBHOOK_LIST = `
  query webhooks($cursor: String) {
    webhookSubscriptions(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes { id topic endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } } }
    }
  }
`;

const WEBHOOK_CREATE = `
  mutation create($topic: WebhookSubscriptionTopic!, $url: URL!) {
    webhookSubscriptionCreate(topic: $topic, webhookSubscription: { callbackUrl: $url, format: JSON }) {
      webhookSubscription { id topic }
      userErrors { field message }
    }
  }
`;

const WEBHOOK_DELETE = `
  mutation destroy($id: ID!) {
    webhookSubscriptionDelete(id: $id) { deletedWebhookSubscriptionId userErrors { field message } }
  }
`;

async function listWebhooks() {
  const { nodes } = await paginate(WEBHOOK_LIST, {}, (d) => d.webhookSubscriptions);
  return nodes.map((n) => ({ id: n.id, topic: n.topic, url: n.endpoint?.callbackUrl || null }));
}

/**
 * Point Shopify's order topics at this shop. Idempotent: a topic already
 * pointing at the same URL is left alone, and one pointing somewhere stale is
 * replaced rather than duplicated.
 */
async function registerOrderWebhooks(callbackUrl) {
  if (!/^https:\/\//i.test(callbackUrl)) {
    throw new ShopifyError('Shopify only sends webhooks to an https address', { status: 400 });
  }

  const existing = await listWebhooks();
  const result = { created: [], kept: [], replaced: [] };

  for (const topic of ORDER_TOPICS) {
    const mine = existing.filter((w) => w.topic === topic);
    if (mine.some((w) => w.url === callbackUrl)) {
      result.kept.push(topic);
      continue;
    }
    // A stale address for the same topic would keep firing into nowhere.
    for (const stale of mine) {
      await graphql(WEBHOOK_DELETE, { id: stale.id });
      result.replaced.push({ topic, was: stale.url });
    }

    const data = await graphql(WEBHOOK_CREATE, { topic, url: callbackUrl });
    const errors = data?.webhookSubscriptionCreate?.userErrors || [];
    if (errors.length) {
      const message = errors.map((e) => e.message).join('; ');
      throw new ShopifyError(
        /access|scope|permission/i.test(message)
          ? 'Shopify would not let the app subscribe. Add the write_webhooks scope to your custom app, reinstall it, and paste the new token in.'
          : `Shopify refused the ${topic} subscription: ${message}`,
        { status: 400 }
      );
    }
    result.created.push(topic);
  }
  return result;
}

async function removeOrderWebhooks() {
  const existing = await listWebhooks();
  const removed = [];
  for (const hook of existing.filter((w) => ORDER_TOPICS.includes(w.topic))) {
    await graphql(WEBHOOK_DELETE, { id: hook.id });
    removed.push(hook.topic);
  }
  return removed;
}

module.exports = {
  DEFAULT_API_VERSION,
  ORDER_TOPICS,
  verifyWebhook,
  listWebhooks,
  registerOrderWebhooks,
  removeOrderWebhooks,
  normaliseDomain,
  getConfig,
  saveConfig,
  publicConfig,
  graphql,
  paginate,
  testConnection,
  ShopifyError,
};
