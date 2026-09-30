import { createPortal } from 'react-dom';
import Barcode, { moduleCount } from './Barcode';

/**
 * Labels for a 2" × 1" roll — two per thing.
 *
 * The first is the thing's name filling the label, for her eyes from across
 * the room. The second is the barcode filling the label, for the scanner, with
 * a short name tucked in small so a label face down in a drawer can still be
 * told apart. They print in pairs, so each thing's two come off the roll
 * together and go straight on the basket or the shelf edge.
 *
 * Each label is its own page at exactly the label's size, so the printer feeds
 * one label per label rather than trying to fit the lot on a sheet of paper.
 *
 * This is the sheet only. What goes on it — baskets, shelf slots, anything else
 * the shop needs to name and scan — comes in as a list, so there is one
 * implementation of the print CSS rather than one per kind of label.
 */
const DEFAULT_W = 2; // inches
const DEFAULT_H = 1;

/**
 * The quiet zone Code 128 needs is ten modules of clear space either side, and
 * the module width is whatever is left over after that clear space — so the
 * margin and the barcode set each other. A 2" label lands at 0.2" of paper
 * either side of a 1.6" symbol, which is an 18 mil module: more than twice the
 * 7.5 mil a handheld scanner wants.
 */
const QUIET = 0.2;

/** Big, but never wider than the label — a long name shrinks to fit. */
function nameSize(label, width) {
  return `${Math.min(0.29 * width, (1.7 * width) / Math.max(1, String(label).length)).toFixed(2)}in`;
}

/**
 * One label. Plain black rather than the app's near-black navy: a thermal roll
 * has one colour and a laser should not tint the bars.
 */
function Label({ children, style, width = DEFAULT_W, height = DEFAULT_H }) {
  return (
    <div
      className="bin-label print-page bg-white flex flex-col items-center justify-center overflow-hidden"
      style={{ width: `${width}in`, height: `${height}in`, boxSizing: 'border-box', color: '#111', ...style }}
    >
      {children}
    </div>
  );
}

/**
 * One label, name and barcode side by side, for stock too small to give each
 * its own — a drawer front is an inch and a half by a quarter.
 *
 * The bars are drawn as coarse as the paper allows. The space left after the
 * name is divided by the symbol's own modules plus the twenty of clear paper
 * Code 128 needs — ten either side — so the module width falls out of the
 * label rather than being guessed at, and the symbol lands centred with
 * exactly its quiet zones around it.
 *
 * Getting that wrong is quiet: a symbol with five modules of clear paper on
 * one side still looks like a barcode and still fails to read, which is why
 * the width is arithmetic here rather than padding.
 */
function InlineRow({ thing, width, height }) {
  const nameWidth = Math.max(0.2, width * 0.2);
  const barWidth = width - nameWidth;                       // symbol + both quiet zones
  const modules = moduleCount(thing.code) + 20;
  const moduleWidth = (barWidth / modules) * 96;            // inches → CSS pixels
  const nameSizeIn = Math.min(height * 0.62, (nameWidth * 1.5) / Math.max(1, String(thing.name).length));

  return (
    <div
      className="flex items-center justify-center overflow-hidden"
      style={{ width: `${width}in`, height: `${height}in`, boxSizing: 'border-box', color: '#111' }}
    >
      <span
        className="font-bold leading-none whitespace-nowrap text-center shrink-0"
        style={{ width: `${nameWidth}in`, fontSize: `${nameSizeIn.toFixed(3)}in` }}
      >
        {thing.name}
      </span>
      {/* Exactly the barcode's share of the label, with the symbol centred in
          it, so the clear paper either side is its ten modules and no less. */}
      <span className="flex items-center justify-center shrink-0" style={{ width: `${barWidth}in` }}>
        <Barcode
          value={thing.code}
          height={Math.round(height * 96) - 2}
          moduleWidth={moduleWidth}
          showText={false}
        />
      </span>
    </div>
  );
}

function InlineLabel({ thing, width, height }) {
  return (
    <Label width={width} height={height} style={{ border: '1px dashed #9ca3af', flexDirection: 'row' }}>
      <InlineRow thing={thing} width={width} height={height} />
    </Label>
  );
}

/**
 * Two labels on one, to be cut apart.
 *
 * A drawer front is an inch and a half by a quarter, and a page that size is a
 * size most printers will not take — which is the whole of why the drawer
 * labels would not come out. So the page is ordinary 2" × 1" stock and it
 * carries two, one above the other, with a line across the middle to cut on.
 *
 * Each half is far roomier than the drawer front it ends up on, which is the
 * point twice over: the printer gets a page size it knows, and the barcode
 * gets the width to be drawn coarse enough to read.
 *
 * An odd number leaves the bottom half of the last one blank rather than
 * starting a thing on a label it cannot finish.
 */
function SplitLabel({ pair, width, height }) {
  const half = height / 2;

  return (
    <Label width={width} height={height} style={{ border: '1px dashed #9ca3af', justifyContent: 'flex-start' }}>
      {pair.map((thing, index) => (
        <div
          key={thing.key}
          className="shrink-0"
          style={{
            width: `${width}in`,
            height: `${half}in`,
            // The cut line. It sits on the halves rather than the label so it
            // survives into print, where the label's own dashed edge — a guide
            // for the screen — is taken off.
            borderTop: index ? '1px dashed #9ca3af' : undefined,
            boxSizing: 'border-box',
          }}
        >
          <InlineRow thing={thing} width={width} height={half} />
        </div>
      ))}
    </Label>
  );
}

/** Things two at a time, for a label that carries two. */
function inPairs(things) {
  const pairs = [];
  for (let i = 0; i < things.length; i += 2) pairs.push(things.slice(i, i + 2));
  return pairs;
}

export default function LabelSheet({
  open, title, subtitle, labels: things, onClose,
  width = DEFAULT_W, height = DEFAULT_H, layout = 'pair',
}) {
  if (!open || !things?.length) return null;

  // A pair per thing — the name to read, the barcode to scan — kept next to
  // each other so both come off the roll together rather than every name and
  // then every barcode. On stock too small for two, they share one label; on
  // stock too big for one, two share a label and are cut apart.
  const inline = layout === 'inline';
  const split = layout === 'split';
  const labels = split
    ? inPairs(things).map((pair) => ({ key: pair[0].key, kind: 'split', pair }))
    : inline
      ? things.map((thing) => ({ key: thing.key, kind: 'inline', thing }))
      : things.flatMap((thing) => [
        { key: `${thing.key}-name`, kind: 'name', thing },
        { key: `${thing.key}-code`, kind: 'code', thing },
      ]);

  return createPortal(
    <div className="print-portal fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto print:p-0 print:static print:overflow-visible">
      {/* The label roll is a different shape of paper from everything else the
          shop prints, so the page size is set only while this sheet is open. */}
      <style>{`
        @media print {
          @page { size: ${width}in ${height}in; margin: 0; }
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
            <h2 className="text-lg font-bold text-primary">{title}</h2>
            <p className="text-xs text-gray-500">
              {split
                ? `${things.length} on ${labels.length} label${labels.length === 1 ? '' : 's'} of ${width}″ × ${height}″ stock, two per label`
                : `${labels.length} labels on ${width}″ × ${height}″ stock`}
              {' — '}{subtitle}
            </p>
          </div>
          <button onClick={onClose} className="text-silver hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div id="print-area" className="max-h-[70vh] overflow-y-auto p-5 print:max-h-none print:overflow-visible print:p-0">
          <div className={`label-grid grid gap-3 justify-items-center print:block ${inline || split ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {labels.map(({ key, kind, thing, pair }) => (
              kind === 'split' ? (
                <SplitLabel key={key} pair={pair} width={width} height={height} />
              ) : kind === 'inline' ? (
                <InlineLabel key={key} thing={thing} width={width} height={height} />
              ) : kind === 'name' ? (
                <Label key={key} width={width} height={height} style={{ border: '1px dashed #9ca3af' }}>
                  <span
                    className="font-bold leading-none whitespace-nowrap"
                    style={{ fontSize: nameSize(thing.name, width) }}
                  >
                    {thing.name}
                  </span>
                </Label>
              ) : (
                <Label key={key} width={width} height={height} style={{ border: '1px dashed #9ca3af', padding: `0.06in ${QUIET}in` }}>
                  {/* Sized so the symbol's own width matches the space left
                      between the quiet zones — no scaling down, so the bars
                      stay as tall as they are drawn. */}
                  <Barcode
                    value={thing.code}
                    height={66}
                    moduleWidth={1.7}
                    showText={false}
                    className="w-full"
                  />
                  <span className="font-mono leading-none mt-[0.03in]" style={{ fontSize: '0.09in' }}>
                    {thing.short || thing.code}
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
            Set the printer to the {width}″ × {height}″ label and leave scaling at 100% — each label is
            its own page, so one label comes out per label.
            {split && ' Two go on each one: cut along the dashed line across the middle.'}
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
