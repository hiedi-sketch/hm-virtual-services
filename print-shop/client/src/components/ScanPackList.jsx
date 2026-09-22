import { useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError } from '../api/print';
import { useScanner } from './ScanContext';

/**
 * The box, checked against the order it is for.
 *
 * The last chance to catch a missing piece is while the box is still open, so
 * packing scans each thing in as it goes: the product's own barcode — the same
 * code as on the shelf and on the order ticket — ticks its line off. The
 * scanner stays open while anything is still outstanding, because putting six
 * things in a box should not be six trips through a menu.
 *
 * Every scan is saved as it happens, so closing the sheet half way through
 * leaves the box where she left it.
 */
export default function ScanPackList({ order, packing }) {
  const { scan } = useScanner();
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(packing);

  const state = list || packing;
  if (!state || !state.lines.length) return null;

  function scanOne() {
    scan({
      title: 'Scan what is going in the box',
      hint: 'The product label, its shelf tag, or its barcode on the order ticket',
      keepMatch: true,
      onCode: async (code) => {
        try {
          const { data, message } = await printApi.packScan(order.id, code);
          setList(data);
          toast.success(message);
          // Stay open while there is more to put in.
          if (!data.complete) setTimeout(scanOne, 350);
        } catch (err) {
          if (err.response?.data?.data) setList(err.response.data.data);
          toast.error(describeError(err, 'That is not on this order'));
        }
      },
    });
  }

  async function toggle(line) {
    setBusy(true);
    try {
      const data = await printApi.setPacked(order.id, {
        order_item_id: line.id,
        packed_quantity: line.packed ? 0 : line.quantity,
      });
      setList(data);
    } catch (err) {
      toast.error(describeError(err, 'Could not change that line'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-linen p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="label !mb-0">Items to be shipped</p>
        <p className={`text-xs font-semibold ${state.complete ? 'text-emerald-700' : 'text-gray-500'}`}>
          {state.packed} of {state.total} in
        </p>
      </div>

      <ul className="space-y-1">
        {state.lines.map((line) => (
          <li key={line.id}>
            <button
              type="button"
              disabled={busy}
              onClick={() => toggle(line)}
              className={`w-full text-left flex items-center gap-2.5 rounded-lg border p-2 transition-colors ${
                line.packed ? 'border-emerald-300 bg-emerald-50' : 'border-greige bg-white hover:bg-linen'
              }`}
            >
              <span
                className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center text-xs font-bold ${
                  line.packed ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-silver text-transparent'
                }`}
                aria-hidden
              >
                ✓
              </span>
              <span className="font-bold text-sm w-10 shrink-0">
                {line.packed_quantity}/{line.quantity}
              </span>
              <span className={`min-w-0 flex-1 truncate text-sm ${line.packed ? 'text-emerald-800 line-through' : 'text-primary'}`}>
                {line.item_name || line.description || 'Item'}
              </span>
              {!line.item_id && <span className="text-[10px] text-gray-400 shrink-0">no code</span>}
            </button>
          </li>
        ))}
      </ul>

      {state.complete ? (
        <p className="text-xs text-emerald-700 font-semibold">Everything is in the box.</p>
      ) : (
        <button
          disabled={busy}
          onClick={scanOne}
          className="btn-secondary w-full !py-2.5 text-sm"
        >
          Scan items to be shipped
        </button>
      )}

      {state.unscannable > 0 && (
        <p className="text-[11px] text-gray-500">
          {state.unscannable} line{state.unscannable === 1 ? '' : 's'} here match no catalog product, so
          {state.unscannable === 1 ? ' it has' : ' they have'} no code to scan — tap to tick off.
        </p>
      )}
    </div>
  );
}
