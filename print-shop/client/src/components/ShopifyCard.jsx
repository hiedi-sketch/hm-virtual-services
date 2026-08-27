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
  const [form, setForm] = useState({ domain: '', token: '', api_version: '' });
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const next = await printApi.shopify();
      setConfig(next);
      setForm((f) => ({ ...f, domain: next.domain || '', api_version: next.api_version || '' }));
    } catch (err) {
      toast.error(describeError(err, 'Could not load the Shopify settings'));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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
    setForm((f) => ({ ...f, token: '' }));
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

      <p className="text-xs text-gray-500">
        Create a custom app in your Shopify admin (Settings → Apps and sales channels → Develop apps),
        give it the <span className="font-mono">read_products</span> and <span className="font-mono">read_orders</span> scopes,
        install it, and paste its Admin API access token here. The token is encrypted before it is stored
        and never sent back to this page.
      </p>

      <form onSubmit={save} className="grid sm:grid-cols-2 gap-3">
        <Field label="Store address" hint="mystore.myshopify.com">
          <input
            className="input"
            placeholder="mystore.myshopify.com"
            value={form.domain}
            onChange={(e) => setForm({ ...form, domain: e.target.value })}
          />
        </Field>
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
        <Field label="API version" hint={`Default ${config.default_api_version}. Change it if Shopify says the version is unsupported.`}>
          <input
            className="input font-mono"
            value={form.api_version}
            onChange={(e) => setForm({ ...form, api_version: e.target.value })}
          />
        </Field>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn-primary" disabled={!!busy}>Save</button>
          <button
            type="button"
            className="btn-secondary"
            disabled={!!busy || !config.configured}
            onClick={() => run('test', printApi.testShopify)}
          >
            {busy === 'test' ? 'Checking…' : 'Test connection'}
          </button>
        </div>
      </form>

      {config.configured && (
        <div className="border-t border-linen pt-3 space-y-3">
          <div>
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
