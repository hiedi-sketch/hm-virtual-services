import { Pill } from './ui';
import { shortDate } from '../api/print';
import ScanMailBin from './ScanMailBin';
import BinContents from './BinContents';

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

          {/* The basket in your hand is the moment to say what is in it. */}
          <BinContents order={order} lines={contents.lines} onChanged={onChanged} />
        </>
      ) : (
        <p className="text-sm text-gray-500">
          Nothing in this one. Scan an order ticket and put it in a bin from there.
        </p>
      )}
    </div>
  );
}
