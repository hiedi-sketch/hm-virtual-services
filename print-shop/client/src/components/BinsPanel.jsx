import { useCallback, useEffect, useState } from 'react';
import Modal from './Modal';
import BinLabels from './BinLabels';
import BinContents from './BinContents';
import ScanMailBin from './ScanMailBin';
import ScanStockBin from './ScanStockBin';
import ScanFinishingBin from './ScanFinishingBin';
import printApi, { describeError, shortDate } from '../api/print';
import { Pill } from './ui';
import { useScanner } from './ScanContext';

/**
 * The shelf, from wherever she is standing.
 *
 * The question asked of the numbered baskets is nearly always "where is this
 * order" or "what is still missing from that one" — so each row leads with the
 * bin's name and the order in it, and says how much of that order has been
 * made. A full bin is an order ready to pack.
 *
 * Three baskets hold something other than one order, and each says so in its
 * own way: the Mail Bin names the parcels waiting for the post, the Stock bin
 * the finished things waiting to be carried to the inventory shelves, and the
 * Finishing bin what is off the printer and still being worked on.
 */
export default function BinsPanel({ open, onClose, onChanged }) {
  const { scan } = useScanner();
  const [bins, setBins] = useState(null);
  const [error, setError] = useState(null);
  const [labels, setLabels] = useState(false);
  // The bin being looked into. A bin is a list of things, and the list is the
  // point — the shelf view is only how you get to it.
  const [chosen, setChosen] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBins(await printApi.bins());
    } catch (err) {
      setError(describeError(err, 'Could not read the bins'));
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => { if (!open) setChosen(null); }, [open]);
  useEffect(() => {
    if (chosen && bins) setChosen(bins.find((b) => b.id === chosen.id) || null);
  }, [bins]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Modal
        open={open && !labels}
        onClose={onClose}
        title={chosen ? chosen.label : 'Bins'}
        size="md"
      >
        {chosen ? (
          <div className="space-y-3">
            <button onClick={() => setChosen(null)} className="text-xs text-gray-400 hover:text-gray-600">
              ← All bins
            </button>
            {chosen.kind === 'mail' ? (
              <ScanMailBin bin={chosen} onChanged={load} />
            ) : chosen.kind === 'stock' ? (
              <ScanStockBin bin={chosen} onChanged={async () => { await load(); onChanged?.(); }} />
            ) : chosen.kind === 'finishing' ? (
              <ScanFinishingBin bin={chosen} onChanged={async () => { await load(); onChanged?.(); }} />
            ) : chosen.order ? (
              <>
                <p className="text-sm">
                  <span className="font-bold text-primary">{chosen.order.order_number}</span>
                  <span className="text-gray-500"> · {chosen.order.customer_name || 'No customer name'}</span>
                  {chosen.order.promised_ship_date && (
                    <span className="text-gray-500"> · due {shortDate(chosen.order.promised_ship_date)}</span>
                  )}
                </p>
                <BinContents
                  order={chosen.order}
                  lines={chosen.contents?.lines}
                  onChanged={async () => { await load(); onChanged?.(); }}
                />
              </>
            ) : (
              <p className="text-sm text-gray-500">
                Nothing in this one. Scan an order ticket and put it in a bin, or choose the bin from
                the order's details.
              </p>
            )}
          </div>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={load} className="btn-secondary">Try again</button>
          </div>
        ) : !bins ? (
          <p className="text-sm text-gray-500">Looking…</p>
        ) : (
          <div className="space-y-2">
            {bins.map((bin) => (
              <button
                key={bin.id}
                type="button"
                onClick={() => setChosen(bin)}
                className="w-full text-left rounded-xl border border-linen p-3 hover:bg-linen transition-colors"
              >
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="font-bold text-primary">{bin.label}</p>
                  <span className="font-mono text-[11px] text-gray-400">{bin.code}</span>
                  {bin.kind === 'mail' ? (
                    <Pill tone={bin.waiting ? 'amber' : 'gray'}>
                      {bin.waiting ? `${bin.waiting} waiting for the post` : 'Empty'}
                    </Pill>
                  ) : bin.kind === 'stock' ? (
                    <Pill tone={bin.units ? 'amber' : 'gray'}>
                      {bin.units ? `${bin.units} to put away` : 'Empty'}
                    </Pill>
                  ) : bin.kind === 'finishing' ? (
                    <Pill tone={bin.units ? 'violet' : 'gray'}>
                      {bin.units ? `${bin.units} to finish` : 'Empty'}
                    </Pill>
                  ) : bin.empty ? (
                    <Pill tone="gray">Empty</Pill>
                  ) : (
                    <Pill tone={bin.contents?.complete ? 'green' : 'amber'}>
                      {bin.contents?.complete ? 'All in' : `${bin.contents?.in_bin} of ${bin.contents?.total} in`}
                    </Pill>
                  )}
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
                {/* The mail bin is a pile going out, so it names the parcels
                    rather than the one order a numbered bin holds. */}
                {bin.kind === 'mail' && bin.orders?.length > 0 && (
                  <p className="text-sm mt-0.5 text-gray-500 truncate">
                    {bin.orders.map((o) => o.order_number).join(', ')}
                  </p>
                )}
                {/* The Stock bin holds products rather than orders, so it names
                    what is in the pile. */}
                {bin.kind === 'stock' && bin.items?.length > 0 && (
                  <p className="text-sm mt-0.5 text-gray-500 truncate">
                    {bin.items.map((r) => `${r.quantity} × ${r.item_name}`).join(', ')}
                  </p>
                )}
                {bin.kind === 'finishing' && bin.jobs?.length > 0 && (
                  <p className="text-sm mt-0.5 text-gray-500 truncate">
                    {bin.jobs.map((j) => `${j.quantity} × ${j.item_name}`).join(', ')}
                  </p>
                )}
              </button>
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
