import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import printApi, { describeError, hoursMinutes, shortDate } from '../api/print';
import { Pill } from './ui';

/**
 * What is on the printer, from wherever she happens to be standing.
 *
 * A shop with one printer has one question all day — is it running, and on
 * what — so the answer is a button in the chrome rather than a page to go to.
 * The same sheet moves a job on, because the moment she looks is the moment
 * the print has finished.
 */

const STATUS_LABEL = { printing: 'On the printer', post_processing: 'On the bench' };

export default function PrintingPanel({ open, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError(null);
    try {
      setData(await printApi.printingNow());
    } catch (err) {
      setError(describeError(err, 'Could not see what is printing'));
    }
  }

  useEffect(() => { if (open) load(); }, [open]);

  async function move(job, status) {
    setBusy(true);
    try {
      await printApi.updateQueue(job.id, { status });
      toast.success(status === 'done'
        ? `${job.item_name} is printed and on the shelf`
        : `${job.item_name} is off the printer`);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not move that job on'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="On the printer" size="md">
      {error ? (
        <div className="space-y-3">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={load} className="btn-secondary">Try again</button>
        </div>
      ) : !data ? (
        <p className="text-sm text-gray-500">Looking…</p>
      ) : !data.jobs.length ? (
        <p className="text-sm text-gray-500">
          Nothing is printing. Scan a product's barcode to start a run, or start one from an order.
        </p>
      ) : (
        <div className="space-y-2">
          {data.jobs.map((job) => (
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
                    <Pill tone={job.status === 'printing' ? 'amber' : 'violet'}>
                      {STATUS_LABEL[job.status] || job.status}
                    </Pill>
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

          <p className="text-xs text-gray-500 pt-1">
            {data.units_printing} on the printer
            {data.units_finishing > 0 && ` · ${data.units_finishing} on the bench`}
          </p>
        </div>
      )}
    </Modal>
  );
}
