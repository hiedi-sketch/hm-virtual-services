import { useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError } from '../api/print';
import { useScanner } from './ScanContext';

/**
 * Which basket this order lives in until it ships.
 *
 * An order confirmed is an order that will accumulate: a print today, another
 * tomorrow, a part off the shelf on Friday. All of it has to go somewhere
 * findable, so the order is scanned into a bin and everything made for it goes
 * in there. The bin is scanned, not picked from a list, because her hands are
 * already holding the scanner and the bin already has its code on the front.
 */
export default function ScanOrderBin({ order, bin, onChanged }) {
  const { scan } = useScanner();
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(bin || null);

  function scanBin() {
    scan({
      title: current ? 'Scan the bin to move it to' : 'Scan the bin this order goes in',
      hint: 'The barcode on the front of the basket',
      keepMatch: true,
      onCode: async (code) => {
        setBusy(true);
        try {
          const { data, message } = await printApi.assignBin(order.id, code);
          setCurrent(data.bin);
          toast.success(message);
          await onChanged?.();
        } catch (err) {
          toast.error(describeError(err, 'Could not put it in that bin'));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  async function takeOut() {
    setBusy(true);
    try {
      const { message } = await printApi.clearBin(order.id);
      setCurrent(null);
      toast.success(message);
      await onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not empty that bin'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-linen p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="label !mb-0">Bin</p>
        {current && (
          <button disabled={busy} onClick={takeOut} className="text-[11px] text-gray-400 hover:text-gray-600">
            Take out
          </button>
        )}
      </div>

      {current ? (
        <p className="text-2xl font-bold text-primary leading-none">{current.label}</p>
      ) : (
        <p className="text-xs text-gray-500">Not in a bin yet.</p>
      )}

      <button
        disabled={busy}
        onClick={scanBin}
        className={`w-full !py-2.5 text-sm ${current ? 'btn-ghost' : 'btn-secondary'}`}
      >
        {current ? 'Move it to another bin' : 'Scan a bin'}
      </button>
    </div>
  );
}
