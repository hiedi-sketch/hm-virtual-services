import { createPortal } from 'react-dom';
import Barcode from './Barcode';

/**
 * The bin labels, laid out for a 2" × 1" label roll — two per bin.
 *
 * The first is the bin's name filling the label, for her eyes from across the
 * room. The second is the barcode filling the label, for the scanner, with the
 * bin's short name tucked in small so a label face down in a drawer can still
 * be told apart. They print in pairs, so each bin's two come off the roll
 * together and go straight on the basket.
 *
 * Each label is its own page at exactly the label's size, so the printer feeds
 * one label per label rather than trying to fit the lot on a sheet of paper.
 */

const LABEL_W = 2; // inches
const LABEL_H = 1;

/**
 * The quiet zone Code 128 needs is ten modules of clear space either side, and
 * the module width is whatever is left over after that clear space — so the
 * margin and the barcode set each other. A 2" label lands at 0.2" of paper
 * either side of a 1.6" symbol, which is an 18 mil module: more than twice the
 * 7.5 mil a handheld scanner wants.
 */
const QUIET = 0.2;

/** "Bin 1" → "B1", "Mail Bin" → "MAIL": short enough not to crowd the bars. */
function shortName(bin) {
  const label = String(bin.label || bin.code || '');
  const digits = label.replace(/\D/g, '');
  if (digits) return `B${digits}`;
  return label.split(/\s+/)[0].toUpperCase().slice(0, 6) || bin.code;
}

/** Big, but never wider than the label — a renamed bin shrinks to fit. */
function nameSize(label) {
  return `${Math.min(0.58, 3.4 / Math.max(1, String(label).length)).toFixed(2)}in`;
}

/**
 * One label. Plain black rather than the app's near-black navy: a thermal roll
 * has one colour and a laser should not tint the bars.
 */
function Label({ children, style }) {
  return (
    <div
      className="bin-label print-page bg-white flex flex-col items-center justify-center overflow-hidden"
      style={{ width: `${LABEL_W}in`, height: `${LABEL_H}in`, boxSizing: 'border-box', color: '#111', ...style }}
    >
      {children}
    </div>
  );
}

export default function BinLabels({ open, bins, onClose }) {
  if (!open || !bins?.length) return null;

  // Two labels per bin, kept next to each other so the pair comes off the roll
  // together rather than six names then six barcodes.
  const labels = bins.flatMap((bin) => [
    { key: `${bin.id}-name`, kind: 'name', bin },
    { key: `${bin.id}-code`, kind: 'code', bin },
  ]);

  return createPortal(
    <div className="print-portal fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto print:p-0 print:static print:overflow-visible">
      {/* The label roll is a different shape of paper from everything else the
          shop prints, so the page size is set only while this sheet is open. */}
      <style>{`
        @media print {
          @page { size: ${LABEL_W}in ${LABEL_H}in; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; }
          .print-portal, .print-sheet, #print-area, .label-grid {
            display: block !important; gap: 0 !important; padding: 0 !important; width: auto !important;
          }
          .bin-label { border: 0 !important; margin: 0 !important; }
        }
      `}</style>

      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm print:hidden" onClick={onClose} />
      <div className="print-sheet relative bg-white rounded-2xl shadow-xl w-full max-w-lg my-4 print:my-0 print:max-w-none print:shadow-none print:rounded-none">
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-linen print:hidden"
          style={{ paddingTop: 'calc(1rem + var(--safe-top))' }}
        >
          <div>
            <h2 className="text-lg font-bold text-primary">Bin labels</h2>
            <p className="text-xs text-gray-500">
              {labels.length} labels on 2″ × 1″ stock — a name and a barcode for each bin
            </p>
          </div>
          <button onClick={onClose} className="text-silver hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div id="print-area" className="max-h-[70vh] overflow-y-auto p-5 print:max-h-none print:overflow-visible print:p-0">
          <div className="label-grid grid grid-cols-2 gap-3 justify-items-center print:block">
            {labels.map(({ key, kind, bin }) => (
              kind === 'name' ? (
                <Label key={key} style={{ border: '1px dashed #9ca3af' }}>
                  <span
                    className="font-bold leading-none whitespace-nowrap"
                    style={{ fontSize: nameSize(bin.label) }}
                  >
                    {bin.label}
                  </span>
                </Label>
              ) : (
                <Label key={key} style={{ border: '1px dashed #9ca3af', padding: `0.06in ${QUIET}in` }}>
                  {/* Sized so the symbol's own width matches the space left
                      between the quiet zones — no scaling down, so the bars
                      stay as tall as they are drawn. */}
                  <Barcode
                    value={bin.code}
                    height={66}
                    moduleWidth={1.7}
                    showText={false}
                    className="w-full"
                  />
                  <span className="font-mono leading-none mt-[0.03in]" style={{ fontSize: '0.09in' }}>
                    {shortName(bin)}
                  </span>
                </Label>
              )
            ))}
          </div>
        </div>

        <div
          className="px-5 pb-5 pt-3 border-t border-linen print:hidden"
          style={{ paddingBottom: 'calc(1.25rem + var(--safe-bottom))' }}
        >
          <p className="text-xs text-gray-500 mb-3">
            Set the printer to the 2″ × 1″ label and leave scaling at 100% — each label is its own page,
            so one label comes out per label.
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={onClose} className="btn-secondary">Close</button>
            <button onClick={() => window.print()} className="btn-primary">Print</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
