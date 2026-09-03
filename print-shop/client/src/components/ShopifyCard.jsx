import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError } from '../api/print';
import { Field, Pill } from './ui';

function Result({ result }) {
  if (!result) return null;
  const { created = [], linked = [], skipped = [], unmatched_lines: unmatched = [], complete } = result;

  return (
    <div className="text-xs space-y-2 border-t border-linen pt-3">
      {created.length > 0 && (
        <div>
          <p className="font-semibold text-emerald-700">Brought in</p>
          <ul className="text-gray-600 mt-0.5 space-y-0.5">
            {created.slice(0, 12).map((c, i) => (
              <li key={i}>{c.name || c.order_number}{c.sku ? ` · ${c.sku}` : ''}{c.customer ? ` · ${c.customer}` : ''}</li>
            ))}
            {created.length > 12 && <li className="text-gray-400">…and {created.length - 12} more</li>}
          </ul>
        </div>
      )}
      {linked.length > 0 && (
        <div>
          <p className="font-semibold text-primary">Matched to what you already had</p>
          <p className="text-gray-600">{linked.map((l) => l.name).join(', ')}</p>
        </div>
      )}
      {skipped.length > 0 && (
        <div>
          <p className="font-semibold text-amber-700">Skipped</p>
          <ul className="text-gray-600 mt-0.5">
            {skipped.map((s, i) => <li key={i}>{s.name} — {s.reason}</li>)}
          </ul>
        </div>
      )}
      {unmatched.length > 0 && (
        <div>
          <p className="font-semibold text-amber-700">Order lines with no matching item here</p>
          <ul className="text-gray-600 mt-0.5">
            {unmatched.map((u, i) => <li key={i}>{u.order} · {u.line}{u.sku ? ` (${u.sku})` : ' (no SKU)'}</li>)}
          </ul>
          <p className="text-gray-500 mt-1">
            They are on the order as text so nothing is lost, but they cannot be queued until a
            catalog item carries that SKU.
          </p>
        </div>
      )}
      {complete === false && (
        <p className="text-amber-700">Stopped part way through — run it again to carry on.</p>
      )}
    </div>
  );
}

/** Connect a Shopify store and pull products and orders in from it. */
export default function ShopifyCard() {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState({ domain: '', token: '', api_version: '', secret: '', api_key: '' });
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);
  const [push, setPush] = useState(null);
  const [redirectUri, setRedirectUri] = useState('');
  const [outcome, setOutcome] = useState(null);
  const [stock, setStock] = useState(null);
  const [locations, setLocations] = useState([]);
  const [locationError, setLocationError] = useState('');

  const load = useCallback(async () => {
    try {
      const next = await printApi.shopify();
      setConfig(next);
      setForm((f) => ({
        ...f,
        domain: next.domain || '',
        api_version: next.api_version || '',
        api_key: next.api_key || '',
      }));
    } catch (err) {
      toast.error(describeError(err, 'Could not load the Shopify settings'));
    }
  }, []);

  // What Shopify is currently pushing here, if the connection is good enough
  // to ask. A store that is not connected simply has nothing to report.
  const loadPush = useCallback(async () => {
    try { setPush(await printApi.shopifyWebhooks()); } catch { setPush(null); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (config?.configured) loadPush(); }, [config?.configured, loadPush]);

  const loadStock = useCallback(async () => {
    try { setStock(await printApi.shopifyInventory()); } catch { setStock(null); }
    try {
      setLocations(await printApi.shopifyLocations());
      setLocationError('');
    } catch (err) {
      // An empty dropdown with no reason is the worst of both. Say why.
      setLocations([]);
      setLocationError(describeError(err, 'Could not read your Shopify locations'));
    }
  }, []);
  useEffect(() => { if (config?.configured) loadStock(); }, [config?.configured, loadStock]);
  useEffect(() => {
    printApi.shopifyRedirectUri().then((d) => setRedirectUri(d.redirect_uri)).catch(() => {});
  }, []);

  // Coming back from Shopify, the result is in the address bar. Read it, say
  // so, and tidy the URL so a refresh does not repeat the message.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get('shopify');
    if (!outcome) return;

    const reason = params.get('reason');
    if (outcome === 'connected') {
      toast.success('Connected to Shopify');
    } else {
      // Something to act on. A toast would be gone before it was read.
      setOutcome({ kind: outcome, reason });
      if (outcome === 'partial') toast('Connected, but not with everything asked for', { icon: '⚠️' });
      else toast.error('Shopify did not finish connecting');
    }

    window.history.replaceState({}, '', window.location.pathname);
    load();
  }, [load]);

  async function connect() {
    setBusy('connect');
    try {
      const { data } = await printApi.startShopifyConnect({ shop: form.domain });
      // Leaving the app entirely: Shopify wants the top window, not a frame.
      window.location.assign(data.url);
    } catch (err) {
      toast.error(describeError(err, 'Could not start connecting'));
      setBusy('');
    }
  }

  async function run(label, fn, onDone) {
    setBusy(label);
    setResult(null);
    try {
      const response = await fn();
      toast.success(response.message || 'Done');
      onDone?.(response);
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(describeError(err, 'Shopify would not play ball'));
      if (detail) console.warn('Shopify said:', detail);
    } finally {
      setBusy('');
      load();
    }
  }

  async function save(e) {
    e.preventDefault();
    await run('save', () => printApi.saveShopify(form).then(() => ({ message: 'Saved' })));
    setForm((f) => ({ ...f, token: '', secret: '' }));
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Shopify? Products and orders already brought in stay put.')) return;
    await run('disconnect', () => printApi.disconnectShopify().then(() => ({ message: 'Disconnected' })));
  }

  if (!config) return <div className="card !p-4 text-sm text-gray-500">Loading Shopify…</div>;

  return (
    <div className="card !p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-bold text-primary text-sm">Shopify</p>
        {config.configured
          ? <Pill tone="green">Connected{config.domain ? ` · ${config.domain}` : ''}</Pill>
          : <Pill tone="gray">Not connected</Pill>}
        {config.from_environment && <Pill tone="blue">Set by environment variables</Pill>}
      </div>

      {outcome && (
        <div
          className={`rounded-lg p-3 text-sm border ${
            outcome.kind === 'partial'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-start gap-2">
            <p className="flex-1">{outcome.reason || 'Shopify did not finish connecting.'}</p>
            <button
              onClick={() => setOutcome(null)}
              className="text-lg leading-none opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500">
        In Shopify, open the <span className="font-mono">Dev Dashboard</span> and create an app.
        Release a version whose scopes include <span className="font-mono">read_products</span> and{' '}
        <span className="font-mono">read_orders</span>, and whose allowed redirect URLs include the
        address below. Then paste the app&apos;s client ID and secret here and press Connect —
        Shopify will ask you to approve, and the token is handled for you.
      </p>

      {redirectUri && (
        <div className="text-xs bg-linen rounded-lg p-2.5 space-y-1">
          <p className="font-semibold text-primary">Allowed redirection URL</p>
          <p className="font-mono break-all text-gray-600">{redirectUri}</p>
          <p className="text-gray-500">Shopify refuses to connect unless this exact address is on its list.</p>
        </div>
      )}

      <form onSubmit={save} className="grid sm:grid-cols-2 gap-3">
        <Field label="Store address" hint="mystore.myshopify.com">
          <input
            className="input"
            placeholder="mystore.myshopify.com"
            value={form.domain}
            onChange={(e) => setForm({ ...form, domain: e.target.value })}
          />
        </Field>
        <Field label="Client ID" hint="From the app's settings in the Dev Dashboard.">
          <input
            className="input font-mono"
            autoComplete="off"
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
          />
        </Field>
        <Field
          label="Client secret"
          hint={config.has_secret
            ? 'Stored. Leave blank to keep it.'
            : 'Next to the client ID. Also what signs orders pushed to you.'}
        >
          <input
            type="password"
            className="input font-mono"
            autoComplete="off"
            placeholder={config.has_secret ? '••••••••' : 'shpss_…'}
            value={form.secret}
            onChange={(e) => setForm({ ...form, secret: e.target.value })}
          />
        </Field>
        <Field label="API version" hint={`Default ${config.default_api_version}. Change it if Shopify says the version is unsupported.`}>
          <input
            className="input font-mono"
            value={form.api_version}
            onChange={(e) => setForm({ ...form, api_version: e.target.value })}
          />
        </Field>
        <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
          <button type="submit" className="btn-secondary" disabled={!!busy}>Save</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!!busy || !form.domain || !(form.api_key || config.api_key) || !(form.secret || config.has_secret)}
            onClick={connect}
            title={config.can_connect ? '' : 'Save your store address, client ID and secret first'}
          >
            {busy === 'connect' ? 'Off to Shopify…' : config.configured ? 'Reconnect to Shopify' : 'Connect to Shopify'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            disabled={!!busy || !config.configured}
            onClick={() => run('test', printApi.testShopify)}
          >
            {busy === 'test' ? 'Checking…' : 'Test connection'}
          </button>
        </div>
      </form>

      <details className="text-xs">
        <summary className="cursor-pointer text-gray-500 hover:text-primary">
          I already have an access token to paste
        </summary>
        <div className="pt-2">
          <p className="text-gray-500 mb-2">
            Older stores could make an app in the admin that handed you a token starting{' '}
            <span className="font-mono">shpat_</span>. If you have one, it still works — paste it
            here instead of connecting.
          </p>
          <Field
            label="Admin API access token"
            hint={config.token_hint ? `Stored: ${config.token_hint}. Leave blank to keep it.` : 'Starts with shpat_'}
          >
            <input
              type="password"
              className="input font-mono"
              autoComplete="off"
              placeholder={config.token_hint ? '••••••••' : 'shpat_…'}
              value={form.token}
              onChange={(e) => setForm({ ...form, token: e.target.value })}
            />
          </Field>
          <button type="button" className="btn-secondary mt-2" disabled={!!busy} onClick={save}>
            Save the token
          </button>
        </div>
      </details>

      {config.configured && (
        <div className="border-t border-linen pt-3 space-y-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-primary text-sm">Orders as they come in</p>
              {push?.live
                ? <Pill tone="green">Shopify is pushing orders here</Pill>
                : <Pill tone="gray">Not pushing yet</Pill>}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              With this on, an order placed in Shopify appears here within seconds instead of waiting
              for you to press Pull. It arrives as New with a ticket to print — nothing is queued and
              nothing reaches a printer on its own.
              {push?.sweep_minutes > 0 && ` A sweep every ${push.sweep_minutes} minutes catches anything a push missed.`}
            </p>
            {!config.has_secret && (
              <p className="text-xs text-amber-700 mt-1">
                Paste your app&apos;s API secret key above first — without it a pushed order cannot be
                proved to have come from Shopify, so none are accepted.
              </p>
            )}
            {push?.callback_url && (
              <p className="text-[11px] text-gray-400 font-mono mt-1 break-all">{push.callback_url}</p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {push?.live ? (
              <button
                className="btn-secondary"
                disabled={!!busy}
                onClick={() => run('unhook', printApi.disableShopifyWebhooks, loadPush)}
              >
                {busy === 'unhook' ? 'Stopping…' : 'Stop the push'}
              </button>
            ) : (
              <button
                className="btn-primary"
                disabled={!!busy || !config.has_secret}
                onClick={() => run('hook', () => printApi.enableShopifyWebhooks(), loadPush)}
              >
                {busy === 'hook' ? 'Setting it up…' : 'Push new orders here'}
              </button>
            )}
            <button
              className="btn-ghost"
              disabled={!!busy}
              onClick={() => run('sweep', printApi.sweepShopifyOrders, (r) => setResult(r.data))}
            >
              {busy === 'sweep' ? 'Checking…' : 'Check for missed orders'}
            </button>
          </div>

          {/* ── Stock going the other way ─────────────────────────── */}
          <div className="border-t border-linen pt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-primary text-sm">Stock back to Shopify</p>
              {stock?.enabled ? <Pill tone="green">On</Pill> : <Pill tone="gray">Off</Pill>}
              {stock?.waiting > 0 && <Pill tone="amber">{stock.waiting} waiting</Pill>}
            </div>
            <p className="text-xs text-gray-500">
              This shop decides what the store has. Every time stock moves here — a print run
              finishing, a count, a receipt, an order shipping — Shopify is told the new figure.
              What gets sent is what is still <span className="font-semibold">sellable</span>: what is on
              the shelf, less what is already sold and waiting to go out. That is what keeps a sale
              from being offered twice in the gap between someone buying and you posting it.
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Where the stock lives" hint="The Shopify location the figure is written to.">
                <select
                  className="input"
                  value={stock?.location_id || ''}
                  onChange={(e) => run('loc', () => printApi.saveShopifyInventory({ location_id: e.target.value }), loadStock)}
                >
                  <option value="">
                    {locations.length ? 'Choose a location…' : 'No locations to choose from'}
                  </option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}{l.fulfils_online === false ? ' (not online orders)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Which figure to set" hint="Available is what a shopper can buy. Change this only if Shopify refuses it.">
                <select
                  className="input"
                  value={stock?.quantity_name || 'available'}
                  onChange={(e) => run('qty', () => printApi.saveShopifyInventory({ quantity_name: e.target.value }), loadStock)}
                >
                  <option value="available">Available to sell</option>
                  <option value="on_hand">On hand</option>
                </select>
              </Field>
            </div>

            {locationError && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2.5">
                {locationError}
              </p>
            )}
            {locations.some((l) => l.unnamed) && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                Shopify would not give the names of your locations, only their ids — that needs the{' '}
                <span className="font-mono">read_locations</span> scope. Stock still writes correctly to
                whichever you pick. Add the scope in a new app version and reconnect to see them named.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              {stock?.push_on ? (
                <button
                  className="btn-secondary"
                  disabled={!!busy}
                  onClick={() => run('stockoff', () => printApi.saveShopifyInventory({ enabled: false }), loadStock)}
                >
                  Stop pushing stock
                </button>
              ) : (
                <button
                  className="btn-primary"
                  disabled={!!busy || !stock?.location_id}
                  title={stock?.location_id ? '' : 'Choose a location first'}
                  onClick={() => run('stockon', () => printApi.saveShopifyInventory({ enabled: true }), loadStock)}
                >
                  {busy === 'stockon' ? 'Turning it on…' : 'Push stock to Shopify'}
                </button>
              )}
              <button
                className="btn-ghost"
                disabled={!!busy || !stock?.enabled}
                onClick={() => run('pushnow', () => printApi.pushShopifyInventory({ all: true }), loadStock)}
              >
                {busy === 'pushnow' ? 'Sending…' : 'Send every product now'}
              </button>
            </div>

            {stock?.next?.length > 0 && (
              <div className="text-xs border border-linen rounded-lg p-2.5">
                <p className="font-semibold text-primary mb-1">Waiting to go</p>
                <ul className="space-y-0.5 text-gray-600">
                  {stock.next.map((n) => (
                    <li key={n.item_id} className="flex flex-wrap gap-2">
                      <span className="text-gray-800">{n.name}</span>
                      <span className="ml-auto">
                        {n.on_hand} on the shelf
                        {n.reserved > 0 && ` less ${n.reserved} sold`}
                        {' → '}
                        <span className="font-semibold">{n.quantity}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {stock?.stuck?.length > 0 && (
              <div className="text-xs text-red-700 border border-red-200 bg-red-50 rounded-lg p-2.5">
                <p className="font-semibold mb-1">Not getting through</p>
                <p>{stock.stuck[0].last_error}</p>
                <p className="text-red-600 mt-1">
                  {stock.stuck.length} product(s) are still queued and will go as soon as that is fixed.
                </p>
              </div>
            )}
          </div>

          <div className="border-t border-linen pt-3">
            <p className="font-semibold text-primary text-sm">Bring things in</p>
            <p className="text-xs text-gray-500">
              Products match on SKU. Anything already here keeps its name, prices and recipe and just
              gains the Shopify link — nothing you have costed gets overwritten. Orders arrive as New;
              none of them reach a printer until you send them to the queue yourself.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              disabled={!!busy}
              onClick={() => run('products', () => printApi.pullShopifyProducts(), (r) => setResult(r.data))}
            >
              {busy === 'products' ? 'Pulling products…' : 'Pull products'}
            </button>
            <button
              className="btn-secondary"
              disabled={!!busy}
              onClick={() => run('orders', () => printApi.pullShopifyOrders(), (r) => setResult(r.data))}
            >
              {busy === 'orders' ? 'Pulling orders…' : 'Pull orders'}
            </button>
            <button
              className="btn-ghost"
              disabled={!!busy}
              onClick={() => run('preview', () => printApi.pullShopifyProducts({ dry_run: true }), (r) => setResult(r.data))}
            >
              Preview products only
            </button>
            <button className="btn-ghost text-red-600 ml-auto" disabled={!!busy} onClick={disconnect}>
              Disconnect
            </button>
          </div>

          <Result result={result} />

          {config.history?.length > 0 && (
            <div className="text-xs border-t border-linen pt-3">
              <p className="font-semibold text-primary mb-1">Recent syncs</p>
              <ul className="space-y-0.5 text-gray-600">
                {config.history.map((h) => (
                  <li key={h.id} className="flex flex-wrap gap-2">
                    <span className={h.ok ? 'text-emerald-700' : 'text-red-600'}>{h.ok ? '✓' : '✕'}</span>
                    <span className="font-semibold">{h.kind}</span>
                    <span>{h.ok
                      ? Object.entries(h.summary || {}).filter(([k]) => k !== 'complete').map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ')
                      : h.error}</span>
                    <span className="ml-auto text-gray-400">{new Date(h.finished_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
