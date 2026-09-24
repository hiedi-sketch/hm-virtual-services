import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import printApi, { describeError, hoursMinutes, shortDate } from '../api/print';
import { Pill } from './ui';
import { useScanner } from './ScanContext';

/**
 * What is on the printer, and what is on the bench — from wherever she happens
 * to be standing.
 *
 * They are two different jobs in two different places: one is a machine
 * running, the other is her hands. So each has its own button and its own
 * sheet, and each sheet moves its work on, because the moment she looks is the
 * moment the print has finished.
 */

const MODES = {
  printing: {
    title: 'On the printer',
    status: 'printing',
    empty: 'Nothing is printing. Scan a product\'s barcode to start a run, or start one from an order.',
    count: (d) => `${d.units_printing} on the printer`,
  },
  bench: {
    title: 'On the bench',
    status: 'post_processing',
    empty: 'Nothing is waiting to be finished. Products land here when they come off the printer.',
    count: (d) => `${d.units_finishing} on the bench`,
  },
};

/** The distinct products on the plates, for adding a stock run beside one. */
function uniqueItems(jobs) {
  const seen = new Map();
  for (const job of jobs) if (!seen.has(job.item_id)) seen.set(job.item_id, job);
  return [...seen.values()];
}

export default function PrintingPanel({ open, mode = 'printing', onClose, onChanged }) {
  const { scan } = useScanner();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // A finished print is a handful of things with nowhere to be yet. This is
  // the job waiting to be put in its order's bin.
  const [toPutAway, setToPutAway] = useState(null);
  // A plate holds what it holds. Start says four because the order asked for
  // four; the bed took nine. This is the job being corrected to what is on it.
  const [counting, setCounting] = useState(null);   // { id, value }
  const [adding, setAdding] = useState(false);

  async function load() {
    setError(null);
    try {
      setData(await printApi.printingNow());
    } catch (err) {
      setError(describeError(err, 'Could not see what is printing'));
    }
  }

  useEffect(() => { if (open) load(); }, [open, mode]);

  const view = MODES[mode] || MODES.printing;
  const jobs = data ? data.jobs.filter((j) => j.status === view.status) : [];

  async function move(job, status) {
    setBusy(true);
    try {
      await printApi.updateQueue(job.id, { status });
      toast.success(status === 'done'
        ? `${job.item_name} is finished and on the shelf`
        : `${job.item_name} is off the printer`);
      // Finished units for an order have somewhere to go. Ask while they are
      // still in her hand rather than hoping she remembers at packing time.
      if (status === 'done' && job.order_id) setToPutAway(job);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not move that job on'));
    } finally {
      setBusy(false);
    }
  }

  async function setQuantity(job, quantity) {
    const n = Math.max(0, Number(quantity) || 0);
    if (!n) return;                                   // nothing on a plate is not a count
    if (n === job.quantity) { setCounting(null); return; }
    setBusy(true);
    try {
      await printApi.updateQueue(job.id, { quantity: n });
      const spare = job.order_number ? n - (job.order_quantity ?? n) : 0;
      toast.success(spare > 0
        ? `${n} on the plate — ${n - spare} for ${job.order_number}, ${spare} for the shelf`
        : `${n} × ${job.item_name} on the plate`);
      setCounting(null);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not change that count'));
    } finally {
      setBusy(false);
    }
  }

  /** A run that belongs to no order: straight onto the shelf when it comes off. */
  async function addStockRun(item) {
    setBusy(true);
    try {
      await printApi.addToQueue({ item_id: item.item_id, quantity: 1, status: 'printing' });
      toast.success(`${item.item_name} added — set the count to what is on the plate`);
      setAdding(false);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not add that run'));
    } finally {
      setBusy(false);
    }
  }

  function putAway(job) {
    scan({
      title: `Scan the bin for ${job.order_number}`,
      hint: job.bin ? `It lives in ${job.bin.label}` : 'The barcode on the front of the basket',
      keepMatch: true,
      onCode: async (code) => {
        setBusy(true);
        try {
          const { message } = await printApi.putInBin(job.order_id, {
            code,
            order_item_id: job.order_item_id,
            item_id: job.item_id,
            quantity: job.quantity,
          });
          toast.success(message);
          setToPutAway(null);
          onChanged?.();
        } catch (err) {
          toast.error(describeError(err, 'Could not put those in the bin'));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={view.title} size="md">
      {error ? (
        <div className="space-y-3">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={load} className="btn-secondary">Try again</button>
        </div>
      ) : !data ? (
        <p className="text-sm text-gray-500">Looking…</p>
      ) : toPutAway ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            <span className="font-bold text-primary">{toPutAway.quantity}× {toPutAway.item_name}</span>
            {' '}finished for <span className="font-semibold">{toPutAway.order_number}</span>.
          </p>
          {toPutAway.bin ? (
            <p className="text-sm">
              That order lives in <span className="text-2xl font-bold text-primary align-middle">{toPutAway.bin.label}</span>
            </p>
          ) : (
            <p className="text-xs text-amber-700">
              That order has no bin yet — scan the one you are putting these in and it will be given that bin.
            </p>
          )}
          <button disabled={busy} onClick={() => putAway(toPutAway)} className="btn-primary w-full !py-4 text-base">
            Scan the bin
          </button>
          <button onClick={() => setToPutAway(null)} className="btn-ghost w-full !py-2 text-sm">
            Not now
          </button>
        </div>
      ) : !jobs.length ? (
        <p className="text-sm text-gray-500">{view.empty}</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-xl border border-linen p-3">
              <div className="flex items-start gap-3">
                {job.image_url && (
                  <img src={job.image_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-greige shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-primary leading-tight flex items-baseline gap-1.5">
                    {counting?.id === job.id ? (
                      <input
                        type="number"
                        min="1"
                        inputMode="numeric"
                        autoFocus
                        value={counting.value}
                        onChange={(e) => setCounting({ id: job.id, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setQuantity(job, counting.value);
                          if (e.key === 'Escape') setCounting(null);
                        }}
                        onBlur={() => setQuantity(job, counting.value)}
                        className="input !w-16 !py-0.5 text-lg text-center font-bold"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCounting({ id: job.id, value: job.quantity })}
                        title="Change how many are on the plate"
                        className="text-lg hover:underline decoration-dotted"
                      >
                        {job.quantity}×
                      </button>
                    )}
                    <span className="min-w-0">{job.item_name}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {job.order_number
                      ? <>for {job.order_number}{job.customer_name ? ` · ${job.customer_name}` : ''}</>
                      : 'for stock'}
                    {job.promised_ship_date && ` · due ${shortDate(job.promised_ship_date)}`}
                  </p>
                  {/* More on the plate than the order asked for: the rest is
                      the shop's, and it says so rather than being a puzzle. */}
                  {job.order_number && job.order_quantity > 0 && job.quantity > job.order_quantity && (
                    <p className="text-xs italic text-teal-700/80">
                      {job.order_quantity} for {job.order_number}, {job.quantity - job.order_quantity} for the shelf
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {job.estimated_minutes > 0 && <Pill tone="gray">{hoursMinutes(job.estimated_minutes)}</Pill>}
                    {job.printer && <Pill tone="blue">{job.printer}</Pill>}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 mt-2.5">
                {job.status === 'printing' && (
                  <button disabled={busy} onClick={() => move(job, 'post_processing')} className="btn-secondary !py-1.5 !px-3 text-xs">
                    Off printer
                  </button>
                )}
                <button disabled={busy} onClick={() => move(job, 'done')} className="btn-primary !py-1.5 !px-3 text-xs">
                  Finished
                </button>
              </div>
            </div>
          ))}

          {mode === 'printing' && (
            adding ? (
              <div className="rounded-xl border border-dashed border-greige p-3 space-y-1.5">
                <p className="text-[11px] uppercase tracking-wide text-gray-500">Also on the plate</p>
                {(data.jobs.length ? uniqueItems(data.jobs) : []).map((item) => (
                  <button
                    key={item.item_id}
                    disabled={busy}
                    onClick={() => addStockRun(item)}
                    className="btn-secondary w-full !py-2 text-xs text-left"
                  >
                    {item.item_name} — for stock
                  </button>
                ))}
                <button onClick={() => setAdding(false)} className="btn-ghost w-full !py-1.5 text-xs">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="btn-ghost w-full !py-2 text-xs">
                Something else on the plate, for stock
              </button>
            )
          )}

          <p className="text-xs text-gray-500 pt-1">{view.count(data)}</p>
        </div>
      )}
    </Modal>
  );
}
