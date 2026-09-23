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

export default function PrintingPanel({ open, mode = 'printing', onClose, onChanged }) {
  const { scan } = useScanner();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  // A finished print is a handful of things with nowhere to be yet. This is
  // the job waiting to be put in its order's bin.
  const [toPutAway, setToPutAway] = useState(null);

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
                  <p className="font-bold text-primary leading-tight">
                    <span className="text-lg mr-1.5">{job.quantity}×</span>
                    {job.item_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {job.order_number
                      ? <>for {job.order_number}{job.customer_name ? ` · ${job.customer_name}` : ''}</>
                      : 'for stock'}
                    {job.promised_ship_date && ` · due ${shortDate(job.promised_ship_date)}`}
                  </p>
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

          <p className="text-xs text-gray-500 pt-1">{view.count(data)}</p>
        </div>
      )}
    </Modal>
  );
}
