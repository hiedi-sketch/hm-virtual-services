import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import printApi, { describeError } from '../api/print';

/**
 * The three numbers behind an order line, and the one place to change them.
 *
 * Six ordered is not six to print: two may be in the order's bin, three on the
 * shelf and one on a plate, and the difference is the whole of what there is
 * left to do. So the line spells it out behind the product name, quietly, and
 * a tap opens it.
 *
 * Two of the four are not typed. In bin moves when units are actually put in
 * the basket — by scanning, or from the bin's own list — because a second way
 * to change it would be a way for it to become a guess. Needed is whatever is
 * left of the order once the other three have had their say.
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
  const { in_bin: bin = 0, in_stock: stock = 0, printing = 0, needed = 0 } = line;

  return (
    <button
      type="button"
      onClick={onEdit}
      title="Adjust what the shelf is holding and what is printing"
      className="ml-1.5 italic text-[0.92em] text-teal-700/80 hover:text-teal-800 hover:underline decoration-dotted align-baseline"
    >
      ({bin} in bin, {stock} in stock, {printing} printing, {needed} needed)
    </button>
  );
}

export default function LineCoverage({ open, order, line, onClose, onChanged }) {
  const [stock, setStock] = useState(0);
  const [printing, setPrinting] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !line) return;
    setStock(line.in_stock || 0);
    setPrinting(line.printing || 0);
  }, [open, line]);

  if (!line) return null;

  const quantity = Number(line.quantity) || 0;
  const bin = Number(line.in_bin) || 0;
  const clamp = (v) => Math.max(0, Math.min(quantity, Number(v) || 0));
  const needed = Math.max(0, quantity - bin - stock - printing);
  const over = bin + stock + printing > quantity;

  async function save() {
    setBusy(true);
    try {
      const { message } = await printApi.setLineCoverage(order.id, line.id, {
        in_stock: stock,
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
          <span className="font-bold text-primary">{quantity}</span> ordered. The four add up to that,
          so changing one moves what is left to print.
        </p>

        <div className="flex gap-2">
          <Num label="In bin" value={bin} max={quantity} readOnly hint="put in the basket" />
          <Num label="In stock" value={stock} max={quantity} onChange={(v) => setStock(clamp(v))}
               hint="on the shelf to pick" />
          <Num label="Printing" value={printing} max={quantity} onChange={(v) => setPrinting(clamp(v))}
               hint="on a printer now" />
          <Num label="Needed" value={needed} max={quantity} readOnly hint="still to make" />
        </div>

        {over && (
          <p className="text-xs text-red-600">
            That comes to {bin + stock + printing}, more than the {quantity} ordered.
          </p>
        )}

        <p className="text-[11px] text-gray-500 leading-snug">
          In stock moves the shelf — it holds {line.shelf_total ?? '—'} of these at the moment.
          Printing puts the units on a plate, or takes them off it. In bin only changes when units
          are actually put in the basket, by scanning or from the bin's own list. Needed is what the
          To Print list counts, so it follows the other three.
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
