import { createPortal } from 'react-dom';
import Barcode from './Barcode';

/**
 * The six bin labels, on paper, to be cut out and taped to the fronts of the
 * baskets.
 *
 * A bin is only useful if the scanner can see it from wherever she is standing
 * with a handful of warm prints, so the code is printed large and the bin's
 * name larger — the name for her eyes, the barcode for the scanner. Two to a
 * row, which comes out about postcard-sized on A4 or Letter.
 */
export default function BinLabels({ open, bins, shopName = 'Print Shop', onClose }) {
  if (!open || !bins?.length) return null;

  return createPortal(
    <div className="print-portal fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto print:p-0 print:static print:overflow-visible">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm print:hidden" onClick={onClose} />
      <div className="print-sheet relative bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4 print:my-0 print:max-w-none print:shadow-none print:rounded-none">
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-linen print:hidden"
          style={{ paddingTop: 'calc(1rem + var(--safe-top))' }}
        >
          <h2 className="text-lg font-bold text-primary">Bin labels</h2>
          <button onClick={onClose} className="text-silver hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div id="print-area" className="max-h-[70vh] overflow-y-auto print:max-h-none print:overflow-visible">
          <div className="print-page p-6 text-gray-900">
            <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-3">
              {shopName} · cut along the lines and tape one to the front of each basket
            </p>

            <div className="grid grid-cols-2 gap-3">
              {bins.map((bin) => (
                <div
                  key={bin.id}
                  className="border-2 border-dashed border-gray-400 rounded p-4 text-center"
                  style={{ pageBreakInside: 'avoid' }}
                >
                  <p className="text-4xl font-bold leading-tight">{bin.label}</p>
                  <div className="mt-2 flex justify-center">
                    <Barcode value={bin.code} height={56} moduleWidth={2} showText={false} />
                  </div>
                  <p className="font-mono text-xs text-gray-600 mt-1">{bin.code}</p>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-gray-500 mt-4 border-t border-gray-300 pt-2">
              Scan an order, then scan a bin to put that order in it. Everything printed for the order
              goes in the same bin until it ships.
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
