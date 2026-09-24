import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError } from '../api/print';
import { Pill } from './ui';
import { useScanner } from './ScanContext';

/**
 * What is actually in a bin, line by line, and how to change it.
 *
 * A bin fills over days: three off one plate, four off the next, the rest
 * pulled from the shelf on Friday. "0 of 17" is only ever true on the first
 * day, so the count has to be sayable — by scanning what goes in, which is
 * what the hands are doing anyway, or by typing it, which is what you do when
 * you are looking at a basket that filled while you were not counting.
 *
 * Both write the same figure, and that figure is what takes the units off the
 * shelf: a thing in this basket has a customer's name on it.
 */
export default function BinContents({ order, lines: given, onChanged }) {
  const { scan } = useScanner();
  const [list, setList] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);   // { id, value }

  useEffect(() => {
    if (given) setList({ lines: given });
    else if (order?.id) printApi.packing(order.id).then(setList).catch(() => setList(null));
  }, [order?.id, given]);

  async function reload() {
    try {
      const fresh = await printApi.packing(order.id);
      setList(fresh);
      await onChanged?.();
    } catch { /* the sheet still shows what it had */ }
  }

  async function setLine(line, value) {
    const n = Math.max(0, Math.min(Number(line.quantity) || 0, Number(value) || 0));
    setEditing(null);
    if (n === (Number(line.packed_quantity) || 0)) return;
    setBusy(true);
    try {
      const data = await printApi.setPacked(order.id, { order_item_id: line.id, packed_quantity: n });
      setList(data);
      toast.success(`${line.item_name || line.description}: ${n} of ${line.quantity} in`);
      await onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not change that count'));
    } finally {
      setBusy(false);
    }
  }

  function scanIn() {
    scan({
      title: 'Scan what is going in the bin',
      hint: 'The product label, its shelf tag, or its barcode on the order ticket',
      keepMatch: true,
      onCode: async (code) => {
        try {
          const { data, message } = await printApi.packScan(order.id, code);
          setList(data);
          toast.success(message);
          await onChanged?.();
          if (!data.complete) setTimeout(scanIn, 350);
        } catch (err) {
          if (err.response?.data?.data) setList(err.response.data.data);
          toast.error(describeError(err, 'That is not on this order'));
          setTimeout(scanIn, 600);
        }
      },
    });
  }

  const lines = list?.lines || [];
  if (!lines.length) return <p className="text-sm text-gray-500">Nothing on this order yet.</p>;

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  const inBin = lines.reduce((sum, l) => sum + Math.min(Number(l.packed_quantity) || 0, Number(l.quantity) || 0), 0);

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-linen border-y border-linen">
        {lines.map((line) => {
          const want = Number(line.quantity) || 0;
          const got = Math.min(Number(line.packed_quantity) || 0, want);
          const done = got >= want && want > 0;
          return (
            <li key={line.id} className="py-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className={`text-sm leading-tight truncate ${done ? 'text-emerald-800' : ''}`}>
                  {line.item_name || line.description || 'Item'}
                </p>
                {line.item_sku && <p className="font-mono text-[10px] text-gray-400">{line.item_sku}</p>}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={busy || got <= 0}
                  onClick={() => setLine(line, got - 1)}
                  className="w-7 h-7 rounded-lg border border-greige text-primary disabled:text-gray-300 disabled:border-linen"
                  aria-label="One fewer"
                >
                  −
                </button>

                {editing?.id === line.id ? (
                  <input
                    type="number"
                    min="0"
                    max={want}
                    inputMode="numeric"
                    autoFocus
                    value={editing.value}
                    onChange={(e) => setEditing({ id: line.id, value: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setLine(line, editing.value);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    onBlur={() => setLine(line, editing.value)}
                    className="input !w-14 !py-0.5 text-center font-bold"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing({ id: line.id, value: got })}
                    title="Type how many are in"
                    className={`w-14 text-center font-bold tabular-nums rounded-lg py-0.5 hover:bg-linen ${done ? 'text-emerald-700' : 'text-gray-800'}`}
                  >
                    {got}/{want}
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy || got >= want}
                  onClick={() => setLine(line, got + 1)}
                  className="w-7 h-7 rounded-lg border border-greige text-primary disabled:text-gray-300 disabled:border-linen"
                  aria-label="One more"
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2">
        <Pill tone={inBin >= total && total > 0 ? 'green' : 'amber'}>
          {inBin >= total && total > 0 ? 'All in' : `${inBin} of ${total} in`}
        </Pill>
        {inBin > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setList(await printApi.setPacked(order.id, { reset: true }));
                toast.success('Emptied — the units are back on the shelf');
                await onChanged?.();
              } catch (err) {
                toast.error(describeError(err, 'Could not empty it'));
              } finally {
                setBusy(false);
              }
            }}
            className="text-[11px] text-gray-400 hover:text-gray-600 ml-auto"
          >
            Take it all back out
          </button>
        )}
      </div>

      <button type="button" disabled={busy} onClick={scanIn} className="btn-primary w-full !py-3 text-sm">
        Scan items into the bin
      </button>

      <p className="text-[11px] text-gray-500 leading-snug">
        Scanning a product's barcode adds one. Tap a number to type it instead. Either way those
        units come off the shelf — they are spoken for.
      </p>
    </div>
  );
}
