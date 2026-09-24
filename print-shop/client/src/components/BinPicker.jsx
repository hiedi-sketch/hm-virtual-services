import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError } from '../api/print';

/**
 * Put an order in a bin without the scanner.
 *
 * Scanning is faster when the basket is in front of her and the scanner is in
 * her hand. Sitting at the screen sorting out yesterday, neither is true — so
 * the bins are also just buttons, showing which are free and which already
 * hold something, because a bin that is taken is the only thing that stops a
 * choice being made.
 */
export default function BinPicker({ order, onChanged, compact = false }) {
  const [bins, setBins] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setBins(await printApi.bins());
    } catch {
      setBins([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const here = order.bin?.id || null;

  async function put(bin) {
    setBusy(true);
    try {
      const { message } = bin.id === here
        ? await printApi.clearBin(order.id)
        : await printApi.assignBin(order.id, bin.code);
      toast.success(message);
      await load();
      await onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not put it in that bin'));
    } finally {
      setBusy(false);
    }
  }

  if (!bins) return <p className="text-[11px] text-gray-400">Loading bins…</p>;

  return (
    <div className={compact ? '' : 'space-y-1.5'}>
      {!compact && <p className="text-[11px] uppercase tracking-wide text-gray-500">Bin</p>}
      <div className="flex flex-wrap gap-1.5">
        {bins.map((bin) => {
          const mine = bin.id === here;
          // The Mail Bin holds a pile, so it is never in the way.
          const taken = !mine && bin.kind !== 'mail' && !bin.empty;
          const holder = taken ? bin.order?.order_number : null;
          return (
            <button
              key={bin.id}
              type="button"
              disabled={busy || taken}
              onClick={() => put(bin)}
              title={mine ? 'Take it out of this bin' : taken ? `${holder} is in it` : `Put it in ${bin.label}`}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                mine
                  ? 'bg-primary text-white border-primary'
                  : taken
                    ? 'border-linen text-gray-300 cursor-not-allowed'
                    : 'border-greige text-primary hover:bg-linen'
              }`}
            >
              {bin.label}
              {taken && <span className="block text-[9px] font-normal leading-none mt-0.5">{holder}</span>}
              {bin.kind === 'mail' && bin.waiting > 0 && !mine && (
                <span className="block text-[9px] font-normal leading-none mt-0.5">{bin.waiting} waiting</span>
              )}
            </button>
          );
        })}
      </div>
      {here && (
        <p className="text-[11px] text-gray-500">
          Tap {order.bin.label} again to take it out.
        </p>
      )}
    </div>
  );
}
