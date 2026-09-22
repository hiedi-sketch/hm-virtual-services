import { createPortal } from 'react-dom';
import Barcode from './Barcode';
import { shortDate } from '../api/print';

/**
 * The In Queue list, on paper.
 *
 * It goes next to the printer, so it carries the two things needed there: how
 * many of each product the shop owes, and the barcode to scan when one goes on
 * the plate. Scanning a line off this sheet opens that product's print run, so
 * the paper and the app are the same list.
 */
export default function QueueSheet({ open, rows, shopName = 'Print Shop', onClose }) {
  if (!open || !rows?.length) return null;

  const units = rows.reduce((total, r) => total + r.to_print, 0);
  const today = new Date().toISOString().slice(0, 10);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto print:p-0 print:static print:overflow-visible">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm print:hidden" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4 print:my-0 print:max-w-none print:shadow-none print:rounded-none">
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-linen print:hidden"
          style={{ paddingTop: 'calc(1rem + var(--safe-top))' }}
        >
          <h2 className="text-lg font-bold text-primary">In Queue list</h2>
          <button onClick={onClose} className="text-silver hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div id="print-area" className="max-h-[70vh] overflow-y-auto print:max-h-none print:overflow-visible">
          <div className="print-page p-6 text-gray-900">
            <div className="flex items-end justify-between border-b-2 border-gray-800 pb-2">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-gray-500">{shopName}</p>
                <p className="text-2xl font-bold leading-tight">In Queue</p>
              </div>
              <div className="text-right text-xs leading-snug">
                <p>{shortDate(today)}</p>
                <p className="font-bold">{units} to print across {rows.length} product{rows.length === 1 ? '' : 's'}</p>
              </div>
            </div>

            <table className="w-full text-sm mt-3">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-300">
                  <th className="py-1 w-16 text-center">Print</th>
                  <th className="py-1">Product</th>
                  <th className="py-1 w-20 text-right">Ordered</th>
                  <th className="py-1 w-20 text-right">On hand</th>
                  <th className="py-1 w-20 text-right">Due</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-200 align-top" style={{ pageBreakInside: 'avoid' }}>
                    <td className="py-2 text-center">
                      <span className="text-2xl font-bold leading-none">{row.to_print}</span>
                    </td>
                    <td className="py-2">
                      <span className="font-semibold">{row.name}</span>
                      {(row.barcode || row.sku) && (
                        <span className="block mt-1">
                          <Barcode value={row.barcode || row.sku} height={32} moduleWidth={1.5} showText={false} />
                        </span>
                      )}
                      <span className="block font-mono text-[10px] text-gray-500">{row.sku}</span>
                    </td>
                    <td className="py-2 text-right">
                      {row.ordered}
                      <span className="block text-[10px] text-gray-500">
                        {row.order_count} order{row.order_count === 1 ? '' : 's'}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {row.on_hand}
                      {row.printing > 0 && (
                        <span className="block text-[10px] text-gray-500">{row.printing} printing</span>
                      )}
                    </td>
                    <td className="py-2 text-right">{row.earliest_due ? shortDate(row.earliest_due) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="text-[11px] text-gray-500 mt-3 border-t border-gray-300 pt-2">
              Scan a barcode to start that product's run — it will say how many are needed and move those
              orders into production.
            </p>
          </div>
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
