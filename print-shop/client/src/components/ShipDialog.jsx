import { useEffect, useState } from 'react';
import Modal from './Modal';
import { useScanner } from './ScanContext';

/**
 * The last thing that happens to an order: it goes in the post.
 *
 * The label is already printed and in her hand at that moment, so this asks for
 * it rather than making her come back later — one scan, and the order carries a
 * link the customer's question can be answered from. Shipping without one is
 * still a single tap, because a shop that posts before it prints labels should
 * not be held up by a box it cannot fill in.
 */
export default function ShipDialog({ open, order, onClose, onShip, busy }) {
  const { scan } = useScanner();
  const [code, setCode] = useState('');

  useEffect(() => { if (open) setCode(order?.tracking?.number || ''); }, [open, order]);

  if (!order) return null;

  const scanLabel = () => scan({
    title: 'Scan the tracking label',
    hint: 'Point the camera at the barcode on the postage label',
    onCode: (scanned) => setCode(scanned),
  });

  return (
    <Modal open={open} onClose={onClose} title={`Ship ${order.order_number}`} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Scan the barcode on the postage label and this order will carry a tracking link.
        </p>

        <button type="button" onClick={scanLabel} className="btn-primary w-full !py-4 text-base">
          Scan the tracking label
        </button>

        <div>
          <label className="label" htmlFor="tracking-code">Or type the number</label>
          <input
            id="tracking-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="input font-mono"
            placeholder="9405 5112 0621 3155 5555 55"
            autoComplete="off"
            autoCorrect="off"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            A whole scanned barcode is fine — the routing digits at the front are trimmed off.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onShip(code.trim())}
            className="btn-primary flex-1 !py-3"
          >
            {busy ? 'Shipping…' : code.trim() ? 'Ship it' : 'Ship without tracking'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
