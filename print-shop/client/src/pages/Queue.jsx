import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import printApi, { clockWhen, describeError, grams, hoursMinutes, shortDate } from '../api/print';
import { EmptyState, Field, LoadError, Pill, StatCard } from '../components/ui';
import PickList from '../components/PickList';
import ShareEditor from '../components/ShareEditor';

const STATUS_TONE = { queued: 'gray', printing: 'blue', post_processing: 'violet', done: 'green', cancelled: 'gray' };
const STATUS_LABEL = { queued: 'Queued', printing: 'Printing', post_processing: 'Finishing', done: 'Done', cancelled: 'Cancelled' };
const NEXT_STATUS = { queued: 'printing', printing: 'post_processing', post_processing: 'done' };
const NEXT_LABEL = { queued: 'Start print', printing: 'Move to finishing', post_processing: 'Mark done' };

/** The spools of one filament, so the list to choose from is short. */
const spoolsFor = (spools, filamentId) =>
  (spools || []).filter((s) => !filamentId || s.filament_id === Number(filamentId));

/** Whether the finished list is folded open, remembered per browser. */
const DONE_OPEN = 'printshop.queue.doneOpen';

const BLANK_JOB = {
  item_id: '', custom_name: '', quantity: 1, priority: 'normal', filament_id: '',
  filament_grams: '', spool_id: '', minutes: '', printer: '', order_id: '', notes: '',
};

export default function Queue() {
  const { refreshKey, refresh } = useOutletContext();

  const [data, setData] = useState(null);
  const [options, setOptions] = useState({ items: [], filaments: [], materials: [], spools: [] });
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(BLANK_JOB);
  // Two kinds of thing go on a queue: something out of the catalog, and a
  // one-off that is not in it and must never end up in it.
  const [kind, setKind] = useState('catalog');
  // What else a one-off needs: a material, or a part already on the shelf.
  const [extras, setExtras] = useState([]);
  // Who a catalog plate is for. One plate can serve several orders at once.
  const [shares, setShares] = useState([]);
  const [picking, setPicking] = useState(null);
  // Recently finished is history, not work, so it folds away — and stays
  // folded, because a preference that resets on every visit is not one.
  const [showDone, setShowDone] = useState(() => {
    try { return localStorage.getItem(DONE_OPEN) !== '0'; } catch { return true; }
  });
  // The finished job she is setting up again, and how many this time.
  const [again, setAgain] = useState(null);
  // The job whose print time is being corrected.
  const [timing, setTiming] = useState(null);
  // The plate whose shares are being changed: who its units are for, once it
  // is already on the queue.
  const [sharing, setSharing] = useState(null);
  const [savingShares, setSavingShares] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [queue, opts, orderList] = await Promise.all([
        printApi.queue(), printApi.catalogOptions(), printApi.orders(),
      ]);
      setData(queue);
      setOptions(opts);
      // Every order still being made. It used to be 'new' and 'in_production'
      // only, which left out 'confirmed' — the state an order sits in for most
      // of its life, and exactly the one she is queuing work for.
      setOrders(orderList.filter((o) => !['shipped', 'completed', 'cancelled'].includes(o.status)));
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

  /**
   * What this plate really takes. The figure from the recipe assumes one
   * product at a time; a bed of six rarely takes six times as long, and the
   * queue's hours are only worth reading if they say what she says.
   */
  async function saveTime(entry, minutes) {
    const n = Math.max(0, Number(minutes) || 0);
    setTiming(null);
    if (!n || n === Math.round(entry.estimated_minutes)) return;
    try {
      setData(await printApi.updateQueue(entry.id, { print_minutes_override: n }));
      toast.success(`${entry.item_name}: ${hoursMinutes(n)} on the plate`);
      refresh();
    } catch (err) {
      toast.error(describeError(err, 'Could not change that print time'));
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

  function closeAdding() {
    setAdding(false);
    setForm(BLANK_JOB);
    setExtras([]);
    setShares([]);
    setKind('catalog');
  }

  function toggleDone() {
    setShowDone((open) => {
      const next = !open;
      try { localStorage.setItem(DONE_OPEN, next ? '1' : '0'); } catch { /* private window */ }
      return next;
    });
  }

  /** Set the same plate up again — the whole point of keeping the list. */
  async function printAgain(e) {
    e.preventDefault();
    const quantity = Number(again.quantity);
    if (!(quantity > 0)) return;
    try {
      const { data: fresh, message } = await printApi.queueAgain(again.job.id, quantity);
      setData(fresh);
      toast.success(message);
      setAgain(null);
      refresh();
    } catch (err) {
      toast.error(describeError(err, 'Could not queue that again'));
    }
  }

  async function addJob(e) {
    e.preventDefault();
    const custom = kind === 'custom';
    if (custom ? !form.custom_name.trim() : !form.item_id) return;

    const claimed = custom ? [] : shares.filter((sh) => sh.order_id && Number(sh.quantity) > 0);
    try {
      const response = await printApi.addToQueue({
        // One or the other, never both: the server reads a job with no item as
        // a one-off and keeps it away from stock and orders entirely.
        item_id: custom ? null : Number(form.item_id),
        custom_name: custom ? form.custom_name.trim() : null,
        quantity: Number(form.quantity) || 1,
        priority: form.priority,
        printer: form.printer || null,
        notes: form.notes || null,
        filament_id: form.filament_id ? Number(form.filament_id) : null,
        // A one-off has no recipe, so these are hers to give and nobody else's
        // to work out.
        ...(custom ? {
          estimated_minutes: Number(form.minutes) || 0,
          filament_grams: Number(form.filament_grams) || 0,
          spool_id: form.spool_id ? Number(form.spool_id) : null,
          picks: extras
            .filter((x) => x.ref_id && Number(x.quantity) > 0)
            .map((x) => ({ line_type: x.line_type, ref_id: Number(x.ref_id), quantity: Number(x.quantity) })),
        } : {
          // Several orders off one plate, or one, or none at all. A plate with
          // shares is queued as a run, so it stays one entry on the queue with
          // the shares listed underneath.
          ...(claimed.length
            ? { shares: claimed.map((sh) => ({ order_id: Number(sh.order_id), quantity: Number(sh.quantity) })) }
            : { order_id: form.order_id ? Number(form.order_id) : null }),
        }),
      });
      setData(response.data ?? response);
      toast.success(response.message
        || (custom ? `${form.custom_name.trim()} is on the queue` : 'Added to the queue'));
      closeAdding();
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not queue that');
    }
  }

  /**
   * Open the share editor on a plate already on the queue, filled in with who
   * it is for now. A one-off is left out: it belongs to nobody by definition.
   */
  function editShares(entry) {
    setSharing({
      entry,
      total: entry.quantity,
      shares: (entry.parts || [])
        .filter((part) => part.order_id)
        .map((part) => ({ order_id: String(part.order_id), quantity: String(part.quantity) })),
    });
  }

  async function saveShares() {
    setSavingShares(true);
    try {
      const body = {
        total: Number(sharing.total),
        shares: sharing.shares
          .filter((sh) => sh.order_id && Number(sh.quantity) > 0)
          .map((sh) => ({ order_id: Number(sh.order_id), quantity: Number(sh.quantity) })),
      };
      const res = await printApi.setQueueShares(sharing.entry.id, body);
      setData(res.data);
      setSharing(null);
      toast.success(res.message || 'Shares changed');
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not change who the plate is for');
    } finally {
      setSavingShares(false);
    }
  }

  // What the orders on this plate have claimed, and what is left for stock.
  const spokenFor = shares.reduce((sum, sh) => sum + (Number(sh.quantity) || 0), 0);
  const leftover = (Number(form.quantity) || 0) - spokenFor;

  if (error && !data) {
    return <LoadError message={error} onRetry={load} what="the production queue" />;
  }
  if (loading || !data) {
    return <div className="card text-center py-12 text-sm text-gray-500">Loading the queue…</div>;
  }

  const atRisk = data.projections.filter((p) => p.at_risk);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-primary">Print Queue</h1>
          <p className="text-sm text-gray-500">
            What is waiting for a printer, or on one, in print order and with its pick list. A plate
            leaves this list when it comes off the printer — it is on the bench then, in the{' '}
            <b>Finishing</b> bin. Ship dates come from a{' '}
            {data.settings.turnaround_min_days}–{data.settings.turnaround_max_days} day turnaround and what is
            already ahead of it. For what still has to be printed by product, see <b>To Print</b>.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setAdding(true)}>Add to queue</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Jobs waiting" value={data.queue.length} sub={`${data.queue.filter((q) => q.status === 'printing').length} printing now`} />
        <StatCard label="Print hours queued" value={`${data.queue_hours}h`} sub={`${data.capacity_hours_per_day}h/day capacity`} />
        {/* When the last plate comes off, if it all runs to estimate — the
            clock answer to the same question the day count gives roughly. */}
        <StatCard
          label="Last plate off"
          value={data.queue_clear_at ? clockWhen(data.queue_clear_at) : '—'}
          sub={`${data.queue_days} day${data.queue_days === 1 ? '' : 's'} at ${data.capacity_hours_per_day}h/day`}
        />
        <StatCard label="Orders at risk" value={atRisk.length} tone={atRisk.length ? 'danger' : 'good'} sub={atRisk.length ? 'Past the turnaround window' : 'All inside turnaround'} />
      </div>

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
                    {entry.is_custom ? <Pill tone="violet">One-off</Pill> : null}
                    {entry.priority === 'rush' && <Pill tone="red">Rush</Pill>}
                    {entry.priority === 'low' && <Pill tone="gray">Low</Pill>}
                  </div>
                  <p className="text-xs text-gray-500">
                    {/* The plate's own time, and hers if she has given one —
                        six on a bed is not six times one. */}
                    {timing?.id === entry.id ? (
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        autoFocus
                        value={timing.value}
                        onChange={(e) => setTiming({ id: entry.id, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveTime(entry, timing.value);
                          if (e.key === 'Escape') setTiming(null);
                        }}
                        onBlur={() => saveTime(entry, timing.value)}
                        className="input !w-20 !py-0 !px-1 text-xs text-center"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setTiming({ id: entry.id, value: Math.round(entry.estimated_minutes) })}
                        title="Say what this plate really takes"
                        className="hover:underline decoration-dotted"
                      >
                        {hoursMinutes(entry.estimated_minutes)}
                      </button>
                    )}
                    {' of print time'}
                    {entry.print_minutes_override != null && <span className="text-teal-700"> · yours</span>}
                    {entry.printer && ` · ${entry.printer}`}
                  </p>

                  {/* What comes off this plate and where it goes. One line each,
                      because a plate serving two orders is still one plate. */}
                  <ul className="mt-1.5 text-xs space-y-0.5">
                    {entry.parts?.map((part) => (
                      <li key={part.job_id} className="flex items-baseline gap-2">
                        <span className="font-bold tabular-nums w-7 shrink-0 text-right text-gray-700">
                          {part.quantity}
                        </span>
                        <span className={`min-w-0 truncate ${part.custom ? 'text-violet-800' : part.stock ? 'text-emerald-800' : 'text-gray-600'}`}>
                          {part.custom
                            ? 'One-off — not stock'
                            : part.stock
                              ? 'Stock build'
                              : `${part.order_number} · ${part.customer_name || 'no name'}`}
                        </span>
                        {part.promised_ship_date && (
                          <span className="text-gray-400 shrink-0">due {shortDate(part.promised_ship_date)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="text-right shrink-0">
                  {/* When this plate goes on and comes off. A plate already
                      running shows the time it really started; everything
                      after it is strung off the one before, plus the minutes
                      it takes to clear the bed. */}
                  <p className="text-[11px] text-gray-500 leading-tight">
                    {entry.started_at_iso ? 'Started' : 'Starts'}
                  </p>
                  <p className="text-sm font-semibold text-gray-700 leading-tight tabular-nums">
                    {clockWhen(entry.estimated_start)}
                  </p>
                  <p className="text-[11px] text-gray-500 leading-tight mt-1">
                    {entry.running_late ? 'Was due off' : 'Off at'}
                  </p>
                  <p className={`font-bold leading-tight tabular-nums ${entry.running_late ? 'text-amber-600' : 'text-primary'}`}>
                    {clockWhen(entry.estimated_finish)}
                  </p>
                  {entry.running_late && (
                    <p className="text-[10px] text-amber-600 leading-tight">running over</p>
                  )}
                  {/* The day-level date this plate used to show has gone: the
                      clock above says when it comes off, and to the day it
                      rounded every plate up to a whole one — three hours of
                      work read as tomorrow. What is left is the date she acts
                      on, which is when the order ships. */}
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
                {/* A plate's units change hands while it is on the bed: an
                    order turns up for the two that were going to the shelf.
                    A one-off has nobody to share out to. */}
                {entry.item_id && (
                  <button className="btn-ghost !py-1 !px-2" onClick={() => editShares(entry)}>
                    Who it is for
                  </button>
                )}
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
          <button
            type="button"
            onClick={toggleDone}
            className="w-full flex items-center gap-2 text-left"
            aria-expanded={showDone}
          >
            <span className="font-bold text-primary text-sm">Recently finished</span>
            <span className="text-xs text-gray-400">{data.done.length}</span>
            <span className={`ml-auto text-gray-400 text-xs transition-transform ${showDone ? 'rotate-90' : ''}`}>
              ▶
            </span>
          </button>

          {showDone && (
            <div className="space-y-1 text-xs text-gray-600 mt-2">
              {/* Each one is a plate she has already set up once, so clicking
                  it is the fastest way to set it up again. */}
              {data.done.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setAgain({ job: d, quantity: d.quantity })}
                  title={`Print ${d.item_name} again`}
                  className="w-full flex items-center gap-2 text-left rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-linen transition-colors"
                >
                  <Pill tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Pill>
                  <span>{d.quantity} × {d.item_name}</span>
                  {!d.item_id && <Pill tone="violet">One-off</Pill>}
                  {d.order_number && <span className="text-gray-400">{d.order_number}</span>}
                  <span className="ml-auto text-gray-400 shrink-0">
                    {d.completed_at ? new Date(d.completed_at).toLocaleDateString() : ''}
                  </span>
                  <span className="text-primary font-semibold shrink-0">Print again</span>
                </button>
              ))}
            </div>
          )}
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

      {/* Who a plate is for, changed after it is on the queue. The plate does
          not move: it is the labels on what comes off it that change. */}
      <Modal open={!!sharing} onClose={() => setSharing(null)} title="Who the plate is for">
        {sharing && (
          <form
            onSubmit={(e) => { e.preventDefault(); saveShares(); }}
            className="space-y-4"
          >
            <div className="rounded-xl bg-linen p-3">
              <p className="font-bold text-primary">{sharing.entry.item_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {STATUS_LABEL[sharing.entry.status]}
                {sharing.entry.printer && ` · ${sharing.entry.printer}`}
                {' · '}
                {hoursMinutes(sharing.entry.estimated_minutes)} of print time
              </p>
            </div>

            <Field
              label="How many the plate makes"
              hint="Leave it as it is to move units between orders without changing the print."
            >
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                className="input"
                value={sharing.total}
                onChange={(e) => setSharing({ ...sharing, total: e.target.value })}
              />
            </Field>

            <ShareEditor
              shares={sharing.shares}
              onChange={(next) => setSharing({ ...sharing, shares: next })}
              orders={orders}
              total={sharing.total}
            />

            <p className="text-xs text-gray-400">
              Only orders with {sharing.entry.item_name} on them can take a share of it.
            </p>

            <div className="flex gap-2 justify-end pt-1">
              <button type="button" className="btn-ghost" onClick={() => setSharing(null)}>Cancel</button>
              <button
                type="submit"
                className="btn-primary"
                disabled={savingShares
                  || (Number(sharing.total) || 0) < sharing.shares.reduce((sum, sh) => sum + (Number(sh.quantity) || 0), 0)}
              >
                {savingShares ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!again} onClose={() => setAgain(null)} title="Print it again">
        {again && (
          <form onSubmit={printAgain} className="space-y-4">
            <div>
              <p className="font-bold text-primary">{again.job.item_name}</p>
              <p className="text-xs text-gray-500">
                {again.job.quantity} finished
                {again.job.completed_at && ` on ${new Date(again.job.completed_at).toLocaleDateString()}`}
                {again.job.order_number && ` for ${again.job.order_number}`}
              </p>
            </div>

            <Field label="How many this time" hint="It goes on the end of the queue as a stock build.">
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                autoFocus
                className="input text-lg"
                value={again.quantity}
                onChange={(e) => setAgain({ ...again, quantity: e.target.value })}
              />
            </Field>

            {/* A figure about one particular plate does not survive a change
                of plate, and saying so beats her finding out later. */}
            {Number(again.quantity) !== Number(again.job.quantity) && (
              <p className="text-xs text-amber-700">
                A different number from last time, so the print time
                {!again.job.item_id && ', the filament'} will need setting again.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setAgain(null)}>Cancel</button>
              <button type="submit" className="btn-primary">Add to the queue</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={adding} onClose={closeAdding} title="Add to the queue">
        <form onSubmit={addJob} className="space-y-4">
          {/* Which kind of thing this is. It decides everything below it, because
              a product is costed from its recipe and a one-off is not costed at
              all — she says what it takes. */}
          <div className="flex gap-1 p-1 bg-linen rounded-xl">
            {[
              ['catalog', 'From the catalog'],
              ['custom', 'A one-off'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setKind(key)}
                className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition ${
                  kind === key ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {kind === 'catalog' ? (
            <Field label="Item">
              <select className="input" required value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
                <option value="">Choose an item…</option>
                {options.items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="What is it" hint="A test piece, a bracket, a spare for the printer. It stays off the catalog and never counts as stock.">
              <input
                className="input"
                required
                autoFocus
                placeholder="Bed level test — 0.2 layer"
                value={form.custom_name}
                onChange={(e) => setForm({ ...form, custom_name: e.target.value })}
              />
            </Field>
          )}

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

            {kind === 'catalog' ? (
              <Field label="Printer">
                <input className="input" placeholder="P1S #2" value={form.printer} onChange={(e) => setForm({ ...form, printer: e.target.value })} />
              </Field>
            ) : (
              <Field label="Print time (minutes)" hint="What the slicer says for the whole plate.">
                <input
                  type="number"
                  min="0"
                  className="input"
                  placeholder="45"
                  value={form.minutes}
                  onChange={(e) => setForm({ ...form, minutes: e.target.value })}
                />
              </Field>
            )}

            {kind === 'custom' && (
              <Field label="Printer">
                <input className="input" placeholder="P1S #2" value={form.printer} onChange={(e) => setForm({ ...form, printer: e.target.value })} />
              </Field>
            )}

            <Field
              label={kind === 'custom' ? 'Filament' : 'Print it in'}
              hint={kind === 'custom' ? null : 'Overrides the colour on the recipe.'}
              className={kind === 'custom' ? '' : 'col-span-2'}
            >
              <select
                className="input"
                value={form.filament_id}
                onChange={(e) => setForm({ ...form, filament_id: e.target.value, spool_id: '' })}
              >
                <option value="">{kind === 'custom' ? 'No filament' : 'Use the recipe colours'}</option>
                {options.filaments.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </Field>

            {kind === 'custom' && (
              <>
                <Field label="Grams" hint="Comes off the spool when it finishes. Two decimals if you need them.">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    className="input"
                    placeholder="24"
                    value={form.filament_grams}
                    onChange={(e) => setForm({ ...form, filament_grams: e.target.value })}
                  />
                </Field>
                {/* Which physical spool. Only the ones of that colour, because
                    the half-empty spool is the point of choosing at all. */}
                <Field label="Off which spool" hint="Leave on whichever is open." className="col-span-2">
                  <select
                    className="input"
                    value={form.spool_id}
                    disabled={!form.filament_id}
                    onChange={(e) => setForm({ ...form, spool_id: e.target.value })}
                  >
                    <option value="">Whichever is open</option>
                    {spoolsFor(options.spools, form.filament_id).map((sp) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.label} · {grams(sp.grams_remaining)}{sp.location ? ` · ${sp.location}` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Notes" className="col-span-2">
                  <input
                    className="input"
                    placeholder="For the shop printer, not an order"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </Field>
              </>
            )}
          </div>

          {/* Who the plate is for. Nine openers is nine on the bed whether
              three are Susie's and six are Pam's, so a plate can carry several
              orders at once and whatever is left over is stock. */}
          {kind === 'catalog' && (
            <div className="border-t border-linen pt-3">
              <ShareEditor
                shares={shares}
                onChange={setShares}
                orders={orders}
                total={form.quantity}
              />
            </div>
          )}

          {/* Anything else it needs gathered. These go onto the same pick list
              the printer already prints for every other job. */}
          {kind === 'custom' && (
            <div className="border-t border-linen pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="label !mb-0">Anything else it needs</p>
                <button
                  type="button"
                  className="text-xs font-semibold text-primary hover:underline"
                  onClick={() => setExtras([...extras, { line_type: 'material', ref_id: '', quantity: '' }])}
                >
                  + Add a line
                </button>
              </div>
              {extras.length === 0 ? (
                <p className="text-xs text-gray-400">Magnets, screws, a part off the shelf — optional.</p>
              ) : (
                <ul className="space-y-2">
                  {extras.map((line, i) => (
                    <li key={i} className="flex gap-2">
                      <select
                        className="input !w-28 shrink-0"
                        value={line.line_type}
                        onChange={(e) => setExtras(extras.map((x, j) => (j === i ? { ...x, line_type: e.target.value, ref_id: '' } : x)))}
                      >
                        <option value="material">Material</option>
                        <option value="item">Part</option>
                      </select>
                      <select
                        className="input min-w-0 flex-1"
                        value={line.ref_id}
                        onChange={(e) => setExtras(extras.map((x, j) => (j === i ? { ...x, ref_id: e.target.value } : x)))}
                      >
                        <option value="">Choose…</option>
                        {(line.line_type === 'material' ? options.materials : options.items)
                          .map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        className="input !w-20 shrink-0"
                        placeholder="Qty"
                        value={line.quantity}
                        onChange={(e) => setExtras(extras.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                      />
                      <button
                        type="button"
                        onClick={() => setExtras(extras.filter((_, j) => j !== i))}
                        className="text-silver hover:text-red-600 px-1 text-lg leading-none shrink-0"
                        title="Take this line off"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={closeAdding}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={kind === 'catalog' && leftover < 0}>Add</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
