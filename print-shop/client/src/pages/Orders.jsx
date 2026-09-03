import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import printApi, { describeError, money, shortDate } from '../api/print';
import { EmptyState, Field, LoadError, Pill, StatCard } from '../components/ui';
import OrderTicket from '../components/OrderTicket';
import { useScanner } from '../components/ScanContext';

// How a single product's print job reads on the order card.
const JOB_LABEL = {
  queued: 'Waiting', printing: 'Printing', post_processing: 'Finishing', done: 'Printed', cancelled: 'Cancelled',
};
const JOB_TONE = {
  queued: 'gray', printing: 'amber', post_processing: 'violet', done: 'green', cancelled: 'gray',
};

// Only used until the real list arrives from the server, which owns it.
const FALLBACK_STAGES = [
  { key: 'new', label: 'New', tone: 'blue' },
  { key: 'confirmed', label: 'Confirmed', tone: 'violet' },
  { key: 'queued', label: 'Queued', tone: 'teal' },
  { key: 'in_production', label: 'Production', tone: 'amber' },
  { key: 'finishing', label: 'Finishing', tone: 'amber' },
  { key: 'packing', label: 'Packing', tone: 'violet' },
  { key: 'shipped', label: 'Shipped', tone: 'green' },
];

const BLANK = {
  customer_name: '', customer_email: '', channel: 'direct', order_type: 'retail',
  order_date: new Date().toISOString().slice(0, 10), promised_ship_date: '', notes: '',
  items: [],
};

export default function Orders() {
  const { refreshKey, refresh } = useOutletContext();

  const [orders, setOrders] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [suggestion, setSuggestion] = useState(null);
  const [saving, setSaving] = useState(false);
  const [stages, setStages] = useState(FALLBACK_STAGES);
  const [offChain, setOffChain] = useState([]);
  const [ticket, setTicket] = useState(null);
  const [shopName, setShopName] = useState('Print Shop');
  const { scan } = useScanner();

  // The pipeline is defined once, on the server.
  useEffect(() => {
    printApi.orderStages()
      .then((d) => { setStages(d.stages); setOffChain(d.off_chain); })
      .catch(() => { /* the fallback list still renders */ });
    printApi.getSettings().then((s) => setShopName(s.shop_name || 'Print Shop')).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, items] = await Promise.all([
        printApi.orders(filter ? { status: filter } : undefined),
        printApi.catalog({ item_type: 'product', active: '1' }),
      ]);
      setOrders(list);
      setCatalog(items);
    } catch (err) {
      const message = describeError(err, 'Could not load orders');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Show the date the shop can realistically promise while the order is typed.
  useEffect(() => {
    if (!editing) return;
    const minutes = form.items.reduce((sum, line) => {
      const item = catalog.find((c) => c.id === Number(line.item_id));
      return sum + (item?.cost_breakdown.print_minutes_per_unit || 0) * (Number(line.quantity) || 0);
    }, 0);
    printApi.suggestShipDate({ order_date: form.order_date, minutes })
      .then(setSuggestion)
      .catch(() => setSuggestion(null));
  }, [editing, form.items, form.order_date, catalog]);

  function openNew() {
    setForm(BLANK);
    setEditing('new');
  }

  function openEdit(order) {
    setForm({
      ...BLANK,
      ...order,
      promised_ship_date: order.promised_ship_date || '',
      items: order.items.map((l) => ({
        item_id: l.item_id || '', description: l.description || '', quantity: l.quantity, unit_price: l.unit_price,
      })),
    });
    setEditing(order.id);
  }

  function addLine() {
    const first = catalog[0];
    if (!first) {
      toast.error('Add a product to the catalog first');
      return;
    }
    setForm((f) => ({
      ...f,
      items: [...f.items, {
        item_id: first.id,
        quantity: 1,
        unit_price: f.order_type === 'wholesale' ? first.wholesale_price : first.retail_price,
      }],
    }));
  }

  function updateLine(index, patch) {
    setForm((f) => ({
      ...f,
      items: f.items.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        // Swapping the product re-prices the line at the order's price band.
        if (patch.item_id !== undefined) {
          const item = catalog.find((c) => c.id === Number(patch.item_id));
          if (item) next.unit_price = f.order_type === 'wholesale' ? item.wholesale_price : item.retail_price;
        }
        return next;
      }),
    }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        promised_ship_date: form.promised_ship_date || null,
        items: form.items.map((l) => ({
          item_id: l.item_id ? Number(l.item_id) : null,
          description: l.description || null,
          quantity: Number(l.quantity) || 1,
          unit_price: Number(l.unit_price) || 0,
        })),
      };
      if (editing === 'new') await printApi.createOrder(payload);
      else await printApi.updateOrder(editing, payload);
      toast.success('Order saved');
      setEditing(null);
      load();
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save that order');
    } finally {
      setSaving(false);
    }
  }

  async function sendToQueue(order) {
    try {
      const { message } = await printApi.queueOrder(order.id, {});
      toast.success(message);
      load();
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not queue that order');
    }
  }

  async function setStatus(order, status) {
    try {
      await printApi.updateOrder(order.id, {
        status,
        shipped_date: status === 'shipped' ? new Date().toISOString().slice(0, 10) : order.shipped_date,
      });
      load();
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update that order');
    }
  }

  async function startProduction(order, orderItemId) {
    try {
      const { message } = await printApi.startProduction(order.id, orderItemId ? { order_item_id: orderItemId } : {});
      toast.success(message);
      load();
      refresh();
    } catch (err) {
      toast.error(describeError(err, 'Could not start that print'));
    }
  }

  async function advance(order) {
    try {
      const { message } = await printApi.advanceOrder(order.id, {});
      toast.success(message);
      load();
      refresh();
    } catch (err) {
      toast.error(describeError(err, 'Could not move that order on'));
    }
  }

  async function remove(order) {
    if (!window.confirm(`Delete ${order.order_number}?`)) return;
    await printApi.deleteOrder(order.id);
    toast.success('Deleted');
    load();
  }

  const chain = stages.map((s) => s.key);
  const open = orders.filter((o) => chain.includes(o.status) && o.status !== 'shipped');
  const stageOf = (key) => [...stages, ...offChain].find((s) => s.key === key);
  const labelOf = (key) => stageOf(key)?.label || key;
  const atRisk = orders.filter((o) => o.projection?.at_risk);
  const openValue = open.reduce((sum, o) => sum + o.revenue, 0);
  const formTotal = form.items.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-primary">Orders</h1>
          <p className="text-sm text-gray-500">What is sold, what is promised, and what still has to be printed.</p>
        </div>
        <div className="flex gap-2">
          {orders.length > 0 && (
            <button className="btn-secondary" onClick={() => setTicket(orders)}>Print tickets</button>
          )}
          <button className="btn-secondary" onClick={() => scan({ title: 'Scan an order ticket' })}>Scan</button>
          <button className="btn-primary" onClick={openNew}>New order</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Open orders" value={open.length} />
        <StatCard label="Open value" value={money(openValue)} />
        <StatCard label="Ready to ship" value={orders.filter((o) => o.status === 'packing').length} tone="good" />
        <StatCard label="Past turnaround" value={atRisk.length} tone={atRisk.length ? 'danger' : 'good'} />
      </div>

      <div className="card !p-3 flex flex-wrap gap-1">
        {[{ key: '', label: 'All' }, ...stages].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              filter === f.key ? 'bg-primary text-white' : 'text-primary hover:bg-linen'
            }`}
          >
            {f.label}
            {f.key && orders.length > 0 && filter === '' && (
              <span className="ml-1.5 text-xs opacity-60">{orders.filter((o) => o.status === f.key).length}</span>
            )}
          </button>
        ))}
      </div>

      {error && !orders.length ? (
        <LoadError message={error} onRetry={load} what="orders" />
      ) : loading ? (
        <div className="card text-center py-12 text-sm text-gray-500">Loading…</div>
      ) : !orders.length ? (
        <EmptyState title="No orders yet" action={<button className="btn-primary" onClick={openNew}>Add an order</button>}>
          Add an order and send it straight to the production queue — the ship date is worked out from your turnaround and what is already printing.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <div key={o.id} className={`card !p-4 ${o.projection?.at_risk ? 'border-l-4 border-red-400' : ''}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-primary leading-tight">{o.order_number}</p>
                    <Pill tone={stageOf(o.status)?.tone || 'gray'}>{labelOf(o.status)}</Pill>
                    {o.order_type === 'wholesale' && <Pill tone="teal">Wholesale</Pill>}
                    {o.needs_queueing && <Pill tone="amber">Not queued</Pill>}
                  </div>
                  <p className="text-xs text-gray-500">
                    {o.customer_name || 'No customer name'}
                    {o.channel && o.channel !== 'direct' && ` · ${o.channel}`}
                    {' · ordered '}{shortDate(o.order_date)}
                    {o.items.length ? ` · ${o.items.length} line${o.items.length === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-primary leading-tight">{money(o.revenue)}</p>
                  <p className="text-[11px] text-gray-500">{money(o.profit)} profit</p>
                </div>
                <div className="text-right shrink-0 min-w-[7rem]">
                  <p className="text-[11px] text-gray-500">Promised</p>
                  <p className="font-semibold text-sm">{shortDate(o.promised_ship_date)}</p>
                  {o.projection && (
                    <p className={`text-[11px] ${o.projection.at_risk ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      projected {shortDate(o.projection.projected_ship_date)}
                    </p>
                  )}
                </div>
              </div>

              {/* Where this one has got to, and how far is left. */}
              {chain.includes(o.status) && (
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {stages.map((stage, i) => {
                    const at = chain.indexOf(o.status);
                    return (
                      <span
                        key={stage.key}
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          i < at ? 'bg-primary/10 text-primary'
                            : i === at ? 'bg-primary text-white font-bold'
                            : 'bg-linen text-gray-400'
                        }`}
                      >
                        {stage.label}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* An order moves in one piece, but production does not: start one
                  product or the lot, and the order follows on the first. */}
              {['queued', 'in_production'].includes(o.status) && o.items.some((l) => l.job_status) && (
                <div className="mt-3 border border-linen rounded-lg p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Products on this order</p>
                    {o.items.some((l) => l.can_start) && (
                      <button
                        className="btn-primary !py-1 !px-2.5 text-xs"
                        onClick={() => startProduction(o)}
                      >
                        Start all
                      </button>
                    )}
                  </div>
                  <div className="space-y-1">
                    {o.items.filter((l) => l.job_status).map((line) => (
                      <div key={line.id} className="flex items-center gap-2 text-xs">
                        <span className="font-semibold w-8 shrink-0">{line.quantity} ×</span>
                        <span className="min-w-0 flex-1 truncate">{line.item_name || line.description}</span>
                        <Pill tone={JOB_TONE[line.job_status] || 'gray'}>{JOB_LABEL[line.job_status] || line.job_status}</Pill>
                        {line.can_start ? (
                          <button
                            className="btn-secondary !py-0.5 !px-2 text-xs shrink-0"
                            onClick={() => startProduction(o, line.id)}
                          >
                            Start
                          </button>
                        ) : (
                          <span className="w-[3.1rem] shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                {o.next_stage && (
                  <button className="btn-primary !py-1 !px-3" onClick={() => advance(o)}>
                    Move to {labelOf(o.next_stage).toLowerCase()}
                  </button>
                )}
                {/* Still offered on a new order: it is the one-press way to get
                    work started, and it takes the order to Queued with it. */}
                {o.needs_queueing && (
                  <button className="btn-secondary !py-1 !px-3" onClick={() => sendToQueue(o)}>Send to queue</button>
                )}
                <button className="btn-ghost !py-1 !px-2" onClick={() => setTicket([o])}>Print</button>
                <select
                  className="input !w-auto !py-1 !px-2 text-xs"
                  value={o.status}
                  onChange={(e) => setStatus(o, e.target.value)}
                >
                  {[...stages, ...offChain].map((stage) => (
                    <option key={stage.key} value={stage.key}>{stage.label}</option>
                  ))}
                </select>
                <button className="btn-ghost !py-1 !px-2" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                  {expanded === o.id ? 'Hide' : 'Details'}
                </button>
                <button className="btn-ghost !py-1 !px-2" onClick={() => openEdit(o)}>Edit</button>
                <button className="btn-ghost !py-1 !px-2 text-red-600 ml-auto" onClick={() => remove(o)}>Delete</button>
              </div>

              {expanded === o.id && (
                <div className="mt-3 border-t border-linen pt-3 space-y-1 text-xs">
                  {o.items.map((line) => (
                    <div key={line.id} className="flex items-center gap-2">
                      <span className="font-semibold">{line.quantity} ×</span>
                      <span>{line.item_name || line.description || 'Custom line'}</span>
                      {line.item_sku && <span className="font-mono text-gray-400">{line.item_sku}</span>}
                      <span className="ml-auto">{money(line.unit_price)} ea</span>
                      <span className="w-20 text-right font-semibold">{money(line.line_total)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t border-linen text-sm">
                    <span className="text-gray-500">Cost {money(o.cost)}</span>
                    <span className="font-bold text-primary">{money(o.revenue)}</span>
                  </div>
                  {o.queue_entries.length > 0 && (
                    <p className="text-gray-500 pt-1">
                      {o.queue_entries.length} job{o.queue_entries.length === 1 ? '' : 's'} on the queue
                      {o.projection && ` · off the printer ${shortDate(o.projection.prints_done_on)}`}
                    </p>
                  )}
                  {o.notes && <p className="text-gray-500 pt-1">{o.notes}</p>}
                  {o.history?.length > 0 && (
                    <div className="pt-2 border-t border-linen">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">How it got here</p>
                      {o.history.map((e) => (
                        <p key={e.id} className="text-gray-500">
                          {labelOf(e.to_status)}
                          <span className="text-gray-400"> · {e.source} · {shortDate(e.created_at)}</span>
                          {e.note && <span className="text-gray-400"> · {e.note}</span>}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <OrderTicket
        open={!!ticket}
        orders={ticket || []}
        shopName={shopName}
        stages={stages}
        onClose={() => setTicket(null)}
      />

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New order' : 'Edit order'} size="xl">
        <form onSubmit={save} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Customer">
              <input className="input" value={form.customer_name || ''} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input type="email" className="input" value={form.customer_email || ''} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} />
            </Field>
            <Field label="Where it came from">
              <input list="order-channels" className="input" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} />
              <datalist id="order-channels">
                {['direct', 'etsy', 'shopify', 'market', 'wholesale', 'custom'].map((c) => <option key={c} value={c} />)}
              </datalist>
            </Field>
            <Field label="Pricing">
              <select className="input" value={form.order_type} onChange={(e) => setForm({ ...form, order_type: e.target.value })}>
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
              </select>
            </Field>
            <Field label="Order date">
              <input type="date" className="input" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} />
            </Field>
            <Field
              label="Promised ship date"
              hint={suggestion ? `Suggested ${shortDate(suggestion.suggested_ship_date)} — ${suggestion.queue_hours}h already queued` : undefined}
            >
              <div className="flex gap-2">
                <input type="date" className="input" value={form.promised_ship_date || ''} onChange={(e) => setForm({ ...form, promised_ship_date: e.target.value })} />
                {suggestion && (
                  <button
                    type="button"
                    className="btn-secondary shrink-0"
                    onClick={() => setForm({ ...form, promised_ship_date: suggestion.suggested_ship_date })}
                  >
                    Use
                  </button>
                )}
              </div>
            </Field>
          </div>

          <div className="border border-linen rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-bold text-primary text-sm">Items</p>
              <button type="button" className="btn-secondary !py-1 !px-2 text-xs" onClick={addLine}>+ Add line</button>
            </div>
            {!form.items.length && <p className="text-xs text-gray-500">No lines yet.</p>}
            {form.items.map((line, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 sm:col-span-6">
                  <label className="label">Product</label>
                  <select className="input" value={line.item_id} onChange={(e) => updateLine(index, { item_id: e.target.value })}>
                    {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.sku})</option>)}
                  </select>
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <label className="label">Qty</label>
                  <input type="number" min="1" className="input" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
                </div>
                <div className="col-span-5 sm:col-span-2">
                  <label className="label">Price</label>
                  <input type="number" step="0.01" className="input" value={line.unit_price} onChange={(e) => updateLine(index, { unit_price: e.target.value })} />
                </div>
                <div className="col-span-3 sm:col-span-2 flex justify-end">
                  <button
                    type="button"
                    className="btn-ghost text-red-600 !px-2"
                    onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <p className="text-right text-sm font-bold text-primary">Total {money(formTotal)}</p>
          </div>

          <Field label="Notes">
            <textarea className="input" rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save order'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
