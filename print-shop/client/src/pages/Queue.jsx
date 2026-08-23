import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import printApi, { describeError, grams, hoursMinutes, shortDate } from '../api/print';
import { EmptyState, Field, LoadError, Pill, StatCard } from '../components/ui';
import PickList from '../components/PickList';

const STATUS_TONE = { queued: 'gray', printing: 'blue', post_processing: 'violet', done: 'green', cancelled: 'gray' };
const STATUS_LABEL = { queued: 'Queued', printing: 'Printing', post_processing: 'Finishing', done: 'Done', cancelled: 'Cancelled' };
const NEXT_STATUS = { queued: 'printing', printing: 'post_processing', post_processing: 'done' };
const NEXT_LABEL = { queued: 'Start print', printing: 'Move to finishing', post_processing: 'Mark done' };

export default function Queue() {
  const { refreshKey, refresh } = useOutletContext();

  const [data, setData] = useState(null);
  const [shortages, setShortages] = useState({ filament: [], materials: [] });
  const [options, setOptions] = useState({ items: [], filaments: [] });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ item_id: '', quantity: 1, priority: 'normal', filament_id: '', printer: '', order_id: '' });
  const [picking, setPicking] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [queue, short, opts, orderList] = await Promise.all([
        printApi.queue(), printApi.shortages(), printApi.catalogOptions(), printApi.orders(),
      ]);
      setData(queue);
      setShortages(short);
      setOptions(opts);
      setOrders(orderList.filter((o) => ['new', 'in_production'].includes(o.status)));
    } catch (err) {
      const message = describeError(err, 'Could not load the production queue');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function setStatus(entry, status) {
    try {
      setData(await printApi.updateQueue(entry.id, { status }));
      if (status === 'done') toast.success('Filament and materials deducted, stock added');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update that job');
    }
  }

  async function setPriority(entry, priority) {
    try {
      setData(await printApi.updateQueue(entry.id, { priority }));
    } catch (err) {
      toast.error(describeError(err, 'Could not change the priority'));
    }
  }

  async function move(index, delta) {
    const list = data.queue;
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const ids = list.map((q) => q.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    // Ordering only holds inside a priority band, so match the neighbour's band.
    if (list[index].priority !== list[target].priority) {
      await printApi.updateQueue(list[index].id, { priority: list[target].priority });
    }
    setData(await printApi.reorderQueue(ids));
  }

  async function remove(entry) {
    if (!window.confirm('Take this off the queue?')) return;
    setData(await printApi.removeFromQueue(entry.id));
    refresh();
  }

  async function addJob(e) {
    e.preventDefault();
    if (!form.item_id) return;
    try {
      setData(await printApi.addToQueue({
        item_id: Number(form.item_id),
        quantity: Number(form.quantity) || 1,
        priority: form.priority,
        printer: form.printer || null,
        filament_id: form.filament_id ? Number(form.filament_id) : null,
        order_id: form.order_id ? Number(form.order_id) : null,
      }));
      toast.success('Added to the queue');
      setAdding(false);
      setForm({ item_id: '', quantity: 1, priority: 'normal', filament_id: '', printer: '', order_id: '' });
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not queue that');
    }
  }

  if (error && !data) {
    return <LoadError message={error} onRetry={load} what="the production queue" />;
  }
  if (loading || !data) {
    return <div className="card text-center py-12 text-sm text-gray-500">Loading the queue…</div>;
  }

  const atRisk = data.projections.filter((p) => p.at_risk);
  const hasShortage = shortages.filament.length || shortages.materials.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-primary">Production queue</h1>
          <p className="text-sm text-gray-500">
            In print order. Ship dates come from a {data.settings.turnaround_min_days}–{data.settings.turnaround_max_days} day
            turnaround and what is already ahead in the queue.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setAdding(true)}>Add to queue</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Jobs waiting" value={data.queue.length} sub={`${data.queue.filter((q) => q.status === 'printing').length} printing now`} />
        <StatCard label="Print hours queued" value={`${data.queue_hours}h`} sub={`${data.capacity_hours_per_day}h/day capacity`} />
        <StatCard label="Queue clears in" value={`${data.queue_days} day${data.queue_days === 1 ? '' : 's'}`} />
        <StatCard label="Orders at risk" value={atRisk.length} tone={atRisk.length ? 'danger' : 'good'} sub={atRisk.length ? 'Past the turnaround window' : 'All inside turnaround'} />
      </div>

      {hasShortage ? (
        <div className="card !p-4 border-l-4 border-amber-400">
          <p className="font-bold text-primary text-sm mb-2">Stock this queue will run into</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {shortages.filament.map((f) => (
              <Pill key={`f${f.id}`} tone={f.short_by_grams > 0 ? 'red' : 'amber'}>
                {f.brand} {f.color_name}: {f.short_by_grams > 0 ? `short ${grams(f.short_by_grams)}` : `${grams(f.grams_projected)} left after`}
              </Pill>
            ))}
            {shortages.materials.map((m) => (
              <Pill key={`m${m.id}`} tone={m.short_by > 0 ? 'red' : 'amber'}>
                {m.name}: {m.short_by > 0 ? `short ${m.short_by}` : `${m.qty_projected} left after`}
              </Pill>
            ))}
          </div>
        </div>
      ) : null}

      {!data.queue.length ? (
        <EmptyState
          title="Nothing in the queue"
          action={<button className="btn-primary" onClick={() => setAdding(true)}>Queue something</button>}
        >
          Send an order to production from the Orders tab, or queue a batch to build up stock.
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {data.queue.map((entry, index) => (
            <div key={entry.id} className={`card !p-4 ${entry.projection?.at_risk ? 'border-l-4 border-red-400' : ''}`}>
              <div className="flex flex-wrap items-start gap-3">
                <span className="w-8 h-8 rounded-lg bg-linen flex items-center justify-center font-bold text-primary text-sm shrink-0">
                  {entry.sequence}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-primary leading-tight">{entry.quantity} × {entry.item_name}</p>
                    <Pill tone={STATUS_TONE[entry.status]}>{STATUS_LABEL[entry.status]}</Pill>
                    {entry.priority === 'rush' && <Pill tone="red">Rush</Pill>}
                    {entry.priority === 'low' && <Pill tone="gray">Low</Pill>}
                  </div>
                  <p className="text-xs text-gray-500">
                    {entry.order_number ? `${entry.order_number} · ${entry.customer_name || 'no name'}` : 'Stock build'}
                    {' · '}{hoursMinutes(entry.estimated_minutes)} of print time
                    {entry.printer && ` · ${entry.printer}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-gray-500">Off the printer</p>
                  <p className="font-bold text-primary leading-tight">{shortDate(entry.prints_done_on)}</p>
                  {entry.projection && (
                    <p className={`text-[11px] ${entry.projection.at_risk ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      Ships {shortDate(entry.projection.projected_ship_date)}
                      {entry.projection.at_risk && ` · ${entry.projection.late_by_days}d late`}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                {entry.status === 'queued' ? (
                  <button className="btn-primary !py-1 !px-3" onClick={() => setPicking(entry)}>
                    Start print
                  </button>
                ) : NEXT_STATUS[entry.status] ? (
                  <button className="btn-primary !py-1 !px-3" onClick={() => setStatus(entry, NEXT_STATUS[entry.status])}>
                    {NEXT_LABEL[entry.status]}
                  </button>
                ) : null}
                <button className="btn-ghost !py-1 !px-2" onClick={() => setPicking(entry)}>Pick list</button>
                <select
                  className="input !w-auto !py-1 !px-2 text-xs"
                  value={entry.priority}
                  onChange={(e) => setPriority(entry, e.target.value)}
                >
                  <option value="rush">Rush</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
                <button className="btn-ghost !py-1 !px-2" onClick={() => move(index, -1)} disabled={index === 0}>↑</button>
                <button className="btn-ghost !py-1 !px-2" onClick={() => move(index, 1)} disabled={index === data.queue.length - 1}>↓</button>
                <button className="btn-ghost !py-1 !px-2 text-red-600 ml-auto" onClick={() => remove(entry)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {data.done.length > 0 && (
        <div className="card !p-4">
          <p className="font-bold text-primary text-sm mb-2">Recently finished</p>
          <div className="space-y-1 text-xs text-gray-600">
            {data.done.map((d) => (
              <div key={d.id} className="flex items-center gap-2">
                <Pill tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Pill>
                <span>{d.quantity} × {d.item_name}</span>
                {d.order_number && <span className="text-gray-400">{d.order_number}</span>}
                <span className="ml-auto text-gray-400">{d.completed_at ? new Date(d.completed_at).toLocaleDateString() : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <PickList
        open={!!picking}
        queueId={picking?.id}
        onClose={() => setPicking(null)}
        onStart={async () => {
          if (picking.status === 'queued') await setStatus(picking, 'printing');
        }}
      />

      <Modal open={adding} onClose={() => setAdding(false)} title="Add to the queue">
        <form onSubmit={addJob} className="space-y-4">
          <Field label="Item">
            <select className="input" required value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
              <option value="">Choose an item…</option>
              {options.items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity">
              <input type="number" min="1" className="input" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
            </Field>
            <Field label="Priority">
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="rush">Rush</option>
                <option value="normal">Normal</option>
                <option value="low">Low</option>
              </select>
            </Field>
            <Field label="For an order" hint="Leave blank to build stock.">
              <select className="input" value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })}>
                <option value="">No order</option>
                {orders.map((o) => <option key={o.id} value={o.id}>{o.order_number} — {o.customer_name}</option>)}
              </select>
            </Field>
            <Field label="Printer">
              <input className="input" placeholder="P1S #2" value={form.printer} onChange={(e) => setForm({ ...form, printer: e.target.value })} />
            </Field>
            <Field label="Print it in" hint="Overrides the colour on the recipe." className="col-span-2">
              <select className="input" value={form.filament_id} onChange={(e) => setForm({ ...form, filament_id: e.target.value })}>
                <option value="">Use the recipe colours</option>
                {options.filaments.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Add</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
