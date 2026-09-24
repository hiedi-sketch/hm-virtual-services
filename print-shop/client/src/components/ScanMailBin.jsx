import { useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError, shortDate } from '../api/print';
import { Pill } from './ui';

/**
 * The Mail Bin: every parcel packed, labelled and waiting for the post office.
 *
 * Unlike the numbered bins it holds a pile rather than one order, because a
 * pickup is a pile. So the question it answers is not "whose is this" but "is
 * this lot gone yet" — and emptying it is a single action, since the van does
 * not take them one at a time.
 */
export default function ScanMailBin({ bin, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [only, setOnly] = useState(null); // order ids, when the post takes some
  const orders = bin.orders || [];

  async function collect(orderIds = null) {
    setBusy(true);
    try {
      const { message } = await printApi.binPickedUp(bin.code, orderIds);
      toast.success(message);
      setOnly(null);
      await onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not mark those as collected'));
    } finally {
      setBusy(false);
    }
  }

  const picking = only !== null;
  const chosen = only || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-bold text-primary leading-tight text-lg">{bin.label}</p>
        <span className="font-mono text-xs text-gray-400">{bin.code}</span>
        <Pill tone={orders.length ? 'amber' : 'gray'}>
          {orders.length ? `${orders.length} waiting for the post` : 'Empty'}
        </Pill>
      </div>

      {!orders.length ? (
        <p className="text-sm text-gray-500">
          Nothing waiting. Packed orders go in here once the postage label is on, and leave it
          when the post office collects them.
        </p>
      ) : (
        <>
          <ul className="text-sm border-t border-linen divide-y divide-linen">
            {orders.map((o) => (
              <li key={o.id} className="py-2 flex items-center gap-2">
                {picking && (
                  <input
                    type="checkbox"
                    className="w-5 h-5 shrink-0 accent-primary"
                    checked={chosen.includes(o.id)}
                    onChange={(ev) => setOnly(ev.target.checked
                      ? [...chosen, o.id]
                      : chosen.filter((id) => id !== o.id))}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight">{o.order_number}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {o.customer_name || 'No customer name'}
                    {o.promised_ship_date && ` · due ${shortDate(o.promised_ship_date)}`}
                  </p>
                </div>
                {o.tracking_number
                  ? <span className="font-mono text-[10px] text-gray-400 shrink-0">{o.tracking_number}</span>
                  : <Pill tone="amber">No tracking</Pill>}
              </li>
            ))}
          </ul>

          {picking ? (
            <div className="flex gap-2">
              <button
                disabled={busy || !chosen.length}
                onClick={() => collect(chosen)}
                className="btn-primary flex-1 !py-3"
              >
                {chosen.length ? `Ship these ${chosen.length}` : 'Tick what went'}
              </button>
              <button onClick={() => setOnly(null)} className="btn-ghost">Cancel</button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                disabled={busy}
                onClick={() => collect()}
                className="btn-primary w-full !py-4 text-base"
              >
                Picked up — ship all {orders.length}
              </button>
              <button onClick={() => setOnly([])} className="btn-ghost w-full !py-2 text-sm">
                Only some of them went
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
