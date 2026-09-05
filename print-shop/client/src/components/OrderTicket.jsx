import { createPortal } from 'react-dom';
import Barcode from './Barcode';
import { money, shortDate } from '../api/print';

/**
 * The paper that travels with the job. Everything needed to work the order is
 * on it. The barcode at the bottom moves the whole order a stage on when it is
 * scanned; the small one beside each product opens that product's print run —
 * how many the shop owes across every order, and how many she is putting on
 * the plate. So the sheet on the bench and the shop's own record stay the same
 * thing.
 */

const STAGE_BOXES = ['Confirmed', 'Queued', 'Production', 'Finishing', 'Packing', 'Shipped'];

function Ticket({ order, shopName, stages }) {
  const current = stages.findIndex((s) => s.key === order.status);

  return (
    <div className="print-page p-6 text-gray-900" style={{ pageBreakInside: 'avoid' }}>
      <div className="flex items-start justify-between gap-4 border-b-2 border-gray-800 pb-2">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-gray-500">{shopName}</p>
          <p className="text-2xl font-bold leading-tight">{order.order_number}</p>
        </div>
        <div className="text-right text-xs leading-snug">
          <p><span className="text-gray-500">Ordered</span> {shortDate(order.order_date)}</p>
          <p><span className="text-gray-500">Promised</span> <span className="font-bold">{shortDate(order.promised_ship_date)}</span></p>
          {order.order_type === 'wholesale' && <p className="font-bold uppercase">Wholesale</p>}
        </div>
      </div>

      <div className="flex justify-between gap-4 py-2 text-sm border-b border-gray-300">
        <p>
          <span className="text-gray-500 text-xs uppercase tracking-wide mr-2">For</span>
          <span className="font-semibold">{order.customer_name || 'No customer name'}</span>
          {order.customer_email && <span className="text-gray-500 text-xs ml-2">{order.customer_email}</span>}
        </p>
        <p className="text-xs text-gray-500 shrink-0">{order.channel || 'direct'}</p>
      </div>

      <table className="w-full text-sm my-3">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-300">
            <th className="py-1 w-12">Qty</th>
            <th className="py-1">Item</th>
            <th className="py-1 w-32">SKU</th>
            <th className="py-1 w-20 text-right">Each</th>
            <th className="py-1 w-20 text-right">Line</th>
          </tr>
        </thead>
        <tbody>
          {(order.items || []).map((line, i) => {
            // The product's own code, so the label on the ticket is the same
            // one on the shelf and one scan means one product wherever it is
            // read. A line with nothing in the catalog behind it has no code
            // to print, and prints none.
            const code = line.item_id ? (line.item_barcode || line.item_sku) : null;
            return (
            <tr key={i} className="border-b border-gray-200 align-top">
              <td className="py-1.5 font-bold">{line.quantity}</td>
              <td className="py-1.5">
                <span>{line.item_name || line.description || 'Item'}</span>
                {code && (
                  <span className="block mt-1">
                    <Barcode value={code} height={30} moduleWidth={1.4} showText={false} />
                  </span>
                )}
              </td>
              <td className="py-1.5 font-mono text-xs">{line.item_sku || '—'}</td>
              <td className="py-1.5 text-right">{money(line.unit_price)}</td>
              <td className="py-1.5 text-right">{money((line.quantity || 0) * (line.unit_price || 0))}</td>
            </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td colSpan={4} className="py-1.5 text-right">Total</td>
            <td className="py-1.5 text-right">{money(order.revenue)}</td>
          </tr>
        </tfoot>
      </table>

      {order.notes && (
        <p className="text-sm border border-gray-300 rounded p-2 mb-3">
          <span className="text-[11px] uppercase tracking-wide text-gray-500 mr-2">Note</span>
          {order.notes}
        </p>
      )}

      {/* Ticked off as the order is scanned along, so the paper shows the same
          story as the screen even when it is sitting on a shelf. */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {STAGE_BOXES.map((label, i) => (
          <span
            key={label}
            className={`text-[11px] px-2 py-1 border rounded ${
              current > i ? 'border-gray-800 bg-gray-800 text-white font-semibold' : 'border-gray-300 text-gray-500'
            }`}
          >
            {current > i ? '✓ ' : ''}{label}
          </span>
        ))}
      </div>

      <div className="text-center border-t-2 border-gray-800 pt-3">
        <Barcode value={order.barcode || order.order_number} height={70} moduleWidth={2} />
        <p className="text-[11px] text-gray-500 mt-1">
          Scan this to move the order on a stage · scan a product above to print a batch of it
        </p>
      </div>
    </div>
  );
}

export default function OrderTicket({ open, orders, shopName = 'Print Shop', stages = [], onClose }) {
  if (!open || !orders?.length) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto print:p-0 print:static print:overflow-visible">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm print:hidden" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4 print:my-0 print:max-w-none print:shadow-none print:rounded-none">
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-linen print:hidden"
          style={{ paddingTop: 'calc(1rem + var(--safe-top))' }}
        >
          <h2 className="text-lg font-bold text-primary">
            {orders.length === 1 ? 'Order ticket' : `${orders.length} order tickets`}
          </h2>
          <button onClick={onClose} className="text-silver hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div id="print-area" className="max-h-[70vh] overflow-y-auto print:max-h-none print:overflow-visible">
          {orders.map((order) => (
            <Ticket key={order.id} order={order} shopName={shopName} stages={stages} />
          ))}
        </div>

        <div
          className="px-5 pb-5 pt-3 flex gap-2 justify-end border-t border-linen print:hidden"
          style={{ paddingBottom: 'calc(1.25rem + var(--safe-bottom))' }}
        >
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button onClick={() => window.print()} className="btn-primary">Print</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
