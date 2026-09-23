import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal';
import BinLabels from './BinLabels';
import printApi, { describeError, shortDate } from '../api/print';
import { Pill } from './ui';
import { useScanner } from './ScanContext';

/**
 * The shelf, from wherever she is standing.
 *
 * Six baskets, and the question asked of them is nearly always "where is this
 * order" or "what is still missing from that one" — so each row leads with the
 * bin's name and the order in it, and says how much of that order has been
 * made. A full bin is an order ready to pack.
 */
export default function BinsPanel({ open, onClose, onChanged }) {
  const { scan } = useScanner();
  const [bins, setBins] = useState(null);
  const [error, setError] = useState(null);
  const [labels, setLabels] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBins(await printApi.bins());
    } catch (err) {
      setError(describeError(err, 'Could not read the bins'));
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  return (
    <>
      <Modal open={open && !labels} onClose={onClose} title="Bins" size="md">
        {error ? (
          <div className="space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={load} className="btn-secondary">Try again</button>
          </div>
        ) : !bins ? (
          <p className="text-sm text-gray-500">Looking…</p>
        ) : (
          <div className="space-y-2">
            {bins.map((bin) => (
              <div key={bin.id} className="rounded-xl border border-linen p-3">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="font-bold text-primary">{bin.label}</p>
                  <span className="font-mono text-[11px] text-gray-400">{bin.code}</span>
                  {bin.empty
                    ? <Pill tone="gray">Empty</Pill>
                    : <Pill tone={bin.contents?.complete ? 'green' : 'amber'}>
                        {bin.contents?.complete ? 'All in' : `${bin.contents?.in_bin} of ${bin.contents?.total} in`}
                      </Pill>}
                </div>
                {bin.order && (
                  <p className="text-sm mt-0.5">
                    <span className="font-semibold">{bin.order.order_number}</span>
                    <span className="text-gray-500"> · {bin.order.customer_name || 'No customer name'}</span>
                    {bin.order.promised_ship_date && (
                      <span className="text-gray-500"> · due {shortDate(bin.order.promised_ship_date)}</span>
                    )}
                  </p>
                )}
              </div>
            ))}

            <div className="flex gap-2 pt-1">
              <button
                className="btn-secondary flex-1"
                onClick={() => scan({ title: 'Scan a bin', hint: 'The barcode on the front of the basket' })}
              >
                Scan a bin
              </button>
              <button className="btn-ghost flex-1" onClick={() => setLabels(true)}>
                Print labels
              </button>
            </div>
          </div>
        )}
      </Modal>

      <BinLabels
        open={labels}
        bins={bins || []}
        onClose={() => { setLabels(false); onChanged?.(); }}
      />
    </>
  );
}
