import { useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError } from '../api/print';
import { Pill } from './ui';
import { useScanner } from './ScanContext';

/**
 * The Stock bin: finished things for the shelf, still in the basket.
 *
 * A print for an order has an obvious next place to be — that order's bin. A
 * print for the shelf had none, so it went from the printer into the stock
 * figures and out of sight, and the actual objects sat in a basket that nothing
 * knew about. This is that basket, written down.
 *
 * Nothing here changes what is in stock. Those units counted as on hand the
 * moment the print finished, and they still do while they are in the basket —
 * putting them away is her carrying them, not the shop gaining anything. So
 * every button on this panel moves objects, never numbers.
 */
export default function ScanStockBin({ bin, onChanged }) {
  const { scan } = useScanner();
  const [busy, setBusy] = useState(false);
  // The line being counted by hand, rather than scanned.
  const [counting, setCounting] = useState(null);

  const items = bin.items || [];

  async function run(work, fallback) {
    setBusy(true);
    try {
      const { message } = await work();
      if (message) toast.success(message);
      await onChanged?.();
    } catch (err) {
      toast.error(describeError(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  const putAway = (row, quantity) => run(
    () => printApi.stockBinAway(row.item_id, quantity),
    'Could not put that away'
  );

  const count = (row, value) => {
    setCounting(null);
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n === row.quantity) return;
    return run(
      () => printApi.stockBinAdd({ item_id: row.item_id, quantity: n, mode: 'count' }),
      'Could not change that count'
    );
  };

  /** Scan something into the basket — one beep, one more in the pile. */
  function scanIn() {
    scan({
      title: `Scan into ${bin.label}`,
      hint: 'The barcode on the product label',
      keepMatch: true,
      onCode: async (code) => {
        setBusy(true);
        try {
          const { message } = await printApi.stockBinAdd({ code, quantity: 1 });
          toast.success(message);
          await onChanged?.();
        } catch (err) {
          toast.error(describeError(err, 'Could not put that in the bin'));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-bold text-primary leading-tight text-lg">{bin.label}</p>
        <span className="font-mono text-xs text-gray-400">{bin.code}</span>
        <Pill tone={bin.units ? 'amber' : 'gray'}>
          {bin.units ? `${bin.units} to put away` : 'Empty'}
        </Pill>
      </div>

      {!items.length ? (
        <p className="text-sm text-gray-500">
          Nothing waiting. Prints for the shelf land here when they finish, and leave it when you
          carry them to the inventory shelves. They count as stock the whole time — this is only
          what has not been put away yet.
        </p>
      ) : (
        <ul className="text-sm border-t border-linen divide-y divide-linen">
          {items.map((row) => (
            <li key={row.item_id} className="py-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight truncate">{row.item_name}</p>
                <p className="text-xs text-gray-500 truncate">
                  {row.item_sku}
                  {row.qty_on_hand != null && ` · ${row.qty_on_hand} in stock all told`}
                </p>
                {/* Which drawer to carry it to, so putting away is one trip
                    rather than a hunt. */}
                <p className="text-xs">
                  {row.drawer
                    ? <span className="text-primary font-semibold font-mono">→ {row.drawer}</span>
                    : <span className="text-gray-400">no drawer yet</span>}
                </p>
              </div>

              {counting?.item_id === row.item_id ? (
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  autoFocus
                  value={counting.value}
                  onChange={(e) => setCounting({ item_id: row.item_id, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') count(row, counting.value);
                    if (e.key === 'Escape') setCounting(null);
                  }}
                  onBlur={() => count(row, counting.value)}
                  className="input !w-16 !py-0.5 text-center font-bold shrink-0"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setCounting({ item_id: row.item_id, value: row.quantity })}
                  title="Say how many are really in the basket"
                  className="font-bold text-lg text-primary shrink-0 hover:underline decoration-dotted"
                >
                  {row.quantity}
                </button>
              )}

              <div className="flex gap-1 shrink-0">
                {row.quantity > 1 && (
                  <button
                    disabled={busy}
                    onClick={() => putAway(row, 1)}
                    title="One of these put away"
                    className="btn-ghost !py-1 !px-2 text-xs"
                  >
                    −1
                  </button>
                )}
                <button
                  disabled={busy}
                  onClick={() => putAway(row)}
                  className="btn-secondary !py-1 !px-2.5 text-xs"
                >
                  Put away
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2">
        <button disabled={busy} onClick={scanIn} className="btn-secondary w-full !py-3">
          Scan something into the bin
        </button>
        {items.length > 1 && (
          <button
            disabled={busy}
            onClick={() => run(() => printApi.stockBinEmpty(), 'Could not empty the bin')}
            className="btn-ghost w-full !py-2 text-sm"
          >
            All of it put away
          </button>
        )}
      </div>
    </div>
  );
}
