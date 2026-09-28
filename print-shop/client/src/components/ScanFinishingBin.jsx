import { useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError, shortDate } from '../api/print';
import { Pill } from './ui';

/**
 * The Finishing bin: the basket on the bench, holding what is off the printer
 * and still being worked on — supports to pick off, a bow to glue, a sand.
 *
 * Nothing about this bin is stored. A thing is in the basket exactly when its
 * job is at the finishing stage, so the list is read from the queue every time
 * it is opened. It fills itself when a plate comes off a printer and empties
 * itself when the work is marked done, and the two can never disagree because
 * there is only one of them.
 *
 * One row per plate rather than per product: two lots of the same opener for
 * two different orders are two piles on the bench, and which pile is whose is
 * the reason to look in the basket at all.
 */
export default function ScanFinishingBin({ bin, onChanged }) {
  const [busy, setBusy] = useState(false);
  const jobs = bin.jobs || [];

  async function done(job) {
    setBusy(true);
    try {
      await printApi.updateQueue(job.id, { status: 'done' });
      toast.success(job.next
        ? `${job.item_name} finished — into ${job.next}`
        : `${job.item_name} finished`);
      await onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not mark that finished'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-bold text-primary leading-tight text-lg">{bin.label}</p>
        <span className="font-mono text-xs text-gray-400">{bin.code}</span>
        <Pill tone={bin.units ? 'violet' : 'gray'}>
          {bin.units ? `${bin.units} to finish` : 'Empty'}
        </Pill>
      </div>

      {!jobs.length ? (
        <p className="text-sm text-gray-500">
          Nothing on the bench. A plate lands here when it comes off the printer, and leaves when
          the work on it is done — so this basket keeps itself, and there is nothing to scan in.
        </p>
      ) : (
        <ul className="text-sm border-t border-linen divide-y divide-linen">
          {jobs.map((job) => (
            <li key={job.id} className="py-2 flex items-center gap-2">
              <span className="font-bold tabular-nums text-lg text-primary w-8 shrink-0 text-right">
                {job.quantity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight truncate">{job.item_name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {job.is_custom
                    ? 'a one-off'
                    : job.order_number
                      ? <>for {job.order_number}{job.customer_name ? ` · ${job.customer_name}` : ''}</>
                      : 'for stock'}
                  {job.promised_ship_date && ` · due ${shortDate(job.promised_ship_date)}`}
                </p>
                {/* Where it goes next, so the basket says what to do with it
                    rather than only what is in it. */}
                {job.next && (
                  <p className="text-xs text-gray-400">→ {job.next}</p>
                )}
              </div>
              <button
                disabled={busy}
                onClick={() => done(job)}
                className="btn-primary !py-1.5 !px-3 text-xs shrink-0"
              >
                Finished
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
