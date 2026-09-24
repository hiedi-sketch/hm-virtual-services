import { Pill } from './ui';
import { shortDate } from '../api/print';
import ScanMailBin from './ScanMailBin';

/**
 * A bin scanned on its own: what is in it, and how far along it is.
 *
 * The question a basket answers when you pick it up is "whose is this, and is
 * it ready to go?" — so that is what the sheet leads with.
 */
export default function ScanBinCard({ bin, onChanged }) {
  // The Mail Bin holds a pile going out rather than one order being made, so
  // it answers a different question and gets its own card.
  if (bin.kind === 'mail') return <ScanMailBin bin={bin} onChanged={onChanged} />;

  const order = bin.order;
  const contents = bin.contents;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-bold text-primary leading-tight text-lg">{bin.label}</p>
        <span className="font-mono text-xs text-gray-400">{bin.code}</span>
        {bin.empty
          ? <Pill tone="gray">Empty</Pill>
          : <Pill tone={contents?.complete ? 'green' : 'amber'}>
              {contents?.complete ? 'All in' : `${contents?.in_bin} of ${contents?.total} in`}
            </Pill>}
      </div>

      {order ? (
        <>
          <p className="text-sm">
            <span className="font-bold text-primary">{order.order_number}</span>
            <span className="text-gray-500"> · {order.customer_name || 'No customer name'}</span>
            {order.promised_ship_date && (
              <span className="text-gray-500"> · due {shortDate(order.promised_ship_date)}</span>
            )}
          </p>

          <ul className="text-xs space-y-0.5 border-t border-linen pt-2">
            {contents.lines.map((l) => (
              <li key={l.id} className="flex gap-2 items-baseline">
                <span className={`font-bold w-10 shrink-0 ${l.packed_quantity >= l.quantity ? 'text-emerald-700' : 'text-gray-800'}`}>
                  {l.packed_quantity}/{l.quantity}
                </span>
                <span className="min-w-0 flex-1 truncate">{l.item_name || l.description || 'Item'}</span>
                {l.item_sku && <span className="font-mono text-gray-400 shrink-0">{l.item_sku}</span>}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-gray-500">
          Nothing in this one. Scan an order ticket and put it in a bin from there.
        </p>
      )}
    </div>
  );
}
