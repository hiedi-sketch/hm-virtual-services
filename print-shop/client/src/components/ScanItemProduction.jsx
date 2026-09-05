import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError, grams, shortDate } from '../api/print';
import { Pill } from './ui';

/**
 * What comes up when a product's barcode is scanned — off an order ticket, a
 * shelf label, or a bin.
 *
 * The question at the printer is never "what is this", it is "how many do I
 * owe". So the sheet leads with the demand across every open order, fills in
 * how many to print, and starting the run puts those orders into production —
 * oldest promise first, with anything spare going to stock.
 */
export default function ScanItemProduction({ match, onChanged, onDone, onStock, onScanAnother }) {
  const [demand, setDemand] = useState(null);
  const [error, setError] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const itemId = match.item.id;

  async function load() {
    setError(null);
    try {
      const data = await printApi.itemDemand(itemId);
      setDemand(data);
      setQuantity(String(data.suggested));
    } catch (err) {
      setError(describeError(err, 'Could not work out what is needed'));
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [itemId]);

  async function startRun() {
    setBusy(true);
    try {
      const { data, message } = await printApi.startPrintRun(itemId, { quantity: Number(quantity) });
      setResult(data);
      setDemand(data.demand);
      // What is left to do has changed; the box should not still hold the run
      // she just started, or a second tap prints the same plate twice.
      setQuantity(String(data.demand.suggested));
      toast.success(message || 'Printing');
      await onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not start that run'));
    } finally {
      setBusy(false);
    }
  }

  async function queueThem() {
    setBusy(true);
    try {
      const { data, message } = await printApi.queueItemDemand(itemId);
      setDemand(data.demand);
      toast.success(message || 'Queued');
      await onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not queue those orders'));
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">{error}</p>
        <button onClick={load} className="btn-secondary w-full">Try again</button>
        <button onClick={onStock} className="btn-ghost w-full">Adjust stock instead</button>
      </div>
    );
  }

  if (!demand) return <p className="text-sm text-gray-500">Working out what is needed…</p>;

  const waitingOrders = demand.orders.filter((o) => !o.started);

  return (
    <div className="space-y-4">
      {/* The whole point of the scan, in one line. */}
      <div className="rounded-xl bg-linen p-3 flex items-start gap-3">
        {demand.item.image_url && (
          // The photo from the shop listing: confirmation at a glance that the
          // code under the camera is the thing in her hand.
          <img
            src={demand.item.image_url}
            alt=""
            className="w-14 h-14 rounded-lg object-cover border border-greige shrink-0"
          />
        )}
        <div>
        <p className="text-3xl font-bold text-primary leading-none">
          {demand.needed}
          <span className="text-sm font-semibold text-gray-500 ml-2">
            needed across {demand.order_count} open order{demand.order_count === 1 ? '' : 's'}
          </span>
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Pill tone={demand.on_hand > 0 ? 'green' : 'gray'}>{demand.on_hand} on hand</Pill>
          {demand.printing > 0 && <Pill tone="amber">{demand.printing} printing</Pill>}
          {demand.shortfall > 0
            ? <Pill tone="red">{demand.shortfall} short</Pill>
            : <Pill tone="green">Enough on the shelf</Pill>}
        </div>
        </div>
      </div>

      {/* What to load before anything is sliced. */}
      <div className="space-y-1">
        <p className="label !mb-1">Filament</p>
        {demand.filaments.length === 0 ? (
          <p className="text-xs text-gray-500">
            Nothing on this product's <span className="font-semibold">Made from</span> list yet — add its
            filament in the Catalog and the colours will show up here.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {demand.filaments.map((f) => {
              const needs = f.grams_per_unit * (Number(quantity) || 0);
              const short = needs > f.grams_on_hand;
              return (
                <li key={f.id} className="flex items-start gap-2.5">
                  <span
                    className="w-7 h-7 rounded-full border border-greige shrink-0 mt-0.5"
                    style={{ background: f.color_hex || '#B0B5BC' }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-primary leading-tight">
                      {f.color_name}
                      <span className="font-normal text-gray-500 text-xs ml-1.5">
                        {f.brand} {f.material_type}
                      </span>
                    </p>
                    <p className="text-xs text-gray-600">
                      {grams(f.grams_per_unit)} each · <span className={short ? 'text-red-600 font-semibold' : ''}>
                        {grams(needs)} for this run
                      </span>
                      <span className="text-gray-400"> · {grams(f.grams_on_hand)} on hand</span>
                    </p>
                    {f.next_spool ? (
                      // Which spool to reach for, so the colour on screen and the
                      // one in the machine are the same spool.
                      <p className="text-[11px] text-gray-500">
                        Load <span className="font-mono">{f.next_spool.spool_code}</span>
                        {f.next_spool.location ? ` from ${f.next_spool.location}` : ' — no place recorded'}
                        {f.next_spool.needs_opening && ' · sealed, needs opening'}
                      </p>
                    ) : (
                      <p className="text-[11px] text-red-600">No spool of this colour on the shelf</p>
                    )}
                    {short && (
                      <p className="text-[11px] text-red-600">
                        {grams(needs - f.grams_on_hand)} short — enough for {f.units_from_stock} at this rate
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {waitingOrders.length > 0 && (
        <div className="space-y-1">
          <p className="label !mb-1">Waiting on this</p>
          <ul className="text-xs text-gray-600 space-y-0.5 max-h-32 overflow-y-auto">
            {waitingOrders.map((o) => (
              <li key={o.order_item_id} className="flex justify-between gap-2">
                <span className="font-mono">{o.order_number}</span>
                <span className="text-gray-500 truncate">{o.customer_name || 'No name'}</span>
                <span className="shrink-0">
                  <span className="font-bold">{o.quantity}</span>
                  {o.promised_ship_date && <span className="text-gray-400 ml-2">{shortDate(o.promised_ship_date)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && (
        // What the run actually did with the units, which is not always what
        // she expected: a line only starts when the run covers all of it.
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="font-semibold text-emerald-800">Printing {result.printing}</p>
          {result.orders.length > 0 ? (
            <ul className="mt-1 text-xs text-emerald-900 space-y-0.5">
              {result.orders.map((o) => (
                <li key={o.order_id}>{o.order_number} — {o.quantity} in production</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-emerald-900 mt-1">No order line was small enough for this run.</p>
          )}
          {result.stock_quantity > 0 && (
            <p className="text-xs text-emerald-900 mt-1">{result.stock_quantity} going to stock</p>
          )}
        </div>
      )}

      <div>
        <label className="label" htmlFor="print-run-quantity">How many are you printing?</label>
        <input
          id="print-run-quantity"
          type="number"
          inputMode="numeric"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="input text-2xl font-bold text-center"
        />
        <p className="text-[11px] text-gray-500 mt-1">
          Orders are filled soonest promise first; the rest goes to stock.
        </p>
      </div>

      <button
        disabled={busy || !Number(quantity)}
        onClick={startRun}
        className="btn-primary w-full !py-4 text-base"
      >
        {busy ? 'Starting…' : `Print ${Number(quantity) || 0} and move to production`}
      </button>

      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={busy || !demand.orders.some((o) => !o.job_status)}
          onClick={queueThem}
          className="btn-secondary"
        >
          Queue the orders
        </button>
        <button onClick={onStock} className="btn-secondary">Adjust stock</button>
      </div>

      <div className="flex gap-2">
        <button onClick={onScanAnother} className="btn-ghost flex-1">Scan another</button>
        <button onClick={onDone} className="btn-ghost">Done</button>
      </div>
    </div>
  );
}
