import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import printApi, { describeError } from '../api/print';

/**
 * The three numbers behind an order line, and the one place to change them.
 *
 * Six ordered is not six to print: five may be on the shelf and one on a
 * plate, and the difference is the whole of what there is left to do. So the
 * line spells it out behind the product name, quietly, and a tap opens it.
 *
 * Needed is not typed — it is what is left of the order once the shelf and the
 * printer have had their say, so it follows the other two. Typing it would
 * invite a number that the next screen would contradict.
 */

/** One of the three boxes. Outside the component, so typing keeps the caret. */
function Num({ label, value, max, onChange, hint, readOnly = false }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="label !mb-1">{label}</p>
      <input
        type="number"
        min="0"
        max={max}
        inputMode="numeric"
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
        className={`input text-center text-2xl !py-2 font-bold ${readOnly ? 'bg-linen text-gray-500' : ''}`}
      />
      <p className="text-[11px] text-gray-500 mt-1 leading-snug">{hint}</p>
    </div>
  );
}

/** The annotation itself: small, italic, in parentheses, out of the way. */
export function CoverageNote({ line, onEdit }) {
  if (!line?.item_id) return null;
  const { on_hand: hand = 0, needed = 0, printing = 0 } = line;

  return (
    <button
      type="button"
      onClick={onEdit}
      title="Adjust what is on hand and what is printing"
      className="ml-1.5 italic text-[0.92em] text-teal-700/80 hover:text-teal-800 hover:underline decoration-dotted align-baseline"
    >
      ({hand} on hand, {needed} needed, {printing} printing)
    </button>
  );
}

export default function LineCoverage({ open, order, line, onClose, onChanged }) {
  const [hand, setHand] = useState(0);
  const [printing, setPrinting] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !line) return;
    setHand(line.on_hand || 0);
    setPrinting(line.printing || 0);
  }, [open, line]);

  if (!line) return null;

  const quantity = Number(line.quantity) || 0;
  const clamp = (v) => Math.max(0, Math.min(quantity, Number(v) || 0));
  const needed = Math.max(0, quantity - hand - printing);
  const over = hand + printing > quantity;

  async function save() {
    setBusy(true);
    try {
      const { message } = await printApi.setLineCoverage(order.id, line.id, {
        on_hand: hand,
        printing,
      });
      toast.success(message);
      onClose();
      await onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not change those numbers'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={line.item_name || 'Line'} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          <span className="font-bold text-primary">{quantity}</span> ordered. The three add up to that,
          so changing one moves what is left to print.
        </p>

        <div className="flex gap-2">
          <Num label="On hand" value={hand} max={quantity} onChange={(v) => setHand(clamp(v))}
               hint="on the shelf for this line" />
          <Num label="Needed" value={needed} max={quantity} readOnly hint="what is left to print" />
          <Num label="Printing" value={printing} max={quantity} onChange={(v) => setPrinting(clamp(v))}
               hint="on a printer now" />
        </div>

        {over && (
          <p className="text-xs text-red-600">
            That comes to {hand + printing}, more than the {quantity} ordered.
          </p>
        )}

        <p className="text-[11px] text-gray-500 leading-snug">
          On hand moves the shelf — it holds {line.shelf_total ?? '—'} of these at the moment.
          Printing puts the units on a plate, or takes them off it. Needed is what the In Queue
          list counts, so it follows both.
        </p>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button disabled={busy || over} onClick={save} className="btn-primary">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
