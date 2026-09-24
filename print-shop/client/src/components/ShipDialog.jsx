import { useEffect, useState } from 'react';
import Modal from './Modal';
import { useScanner } from './ScanContext';

/**
 * The label going on the box.
 *
 * That happens as the box is sealed, which is the move into the Mail Bin
 * rather than the move out of the door — so this is asked for there, and the
 * carrier taking the parcel later needs nothing typed at all. Going on without
 * a label is still a single tap, because a shop that posts before it prints
 * labels should not be held up by a box it cannot fill in.
 */
export default function ShipDialog({ open, order, onClose, onShip, busy }) {
  const { scan } = useScanner();
  const [code, setCode] = useState('');

  useEffect(() => { if (open) setCode(order?.tracking?.number || ''); }, [open, order]);

  if (!order) return null;

  // Into the Mail Bin, or straight out of the door: the same scan, different
  // words, because the button should say what it is about to do.
  const toBin = order.next_stage === 'mail_bin';
  const title = toBin ? `Label ${order.order_number}` : `Ship ${order.order_number}`;
  const go = toBin
    ? (code.trim() ? 'Into the Mail Bin' : 'Into the Mail Bin without tracking')
    : (code.trim() ? 'Ship it' : 'Ship without tracking');

  const scanLabel = () => scan({
    title: 'Scan the tracking label',
    hint: 'Point the camera at the barcode on the postage label',
    onCode: (scanned) => setCode(scanned),
  });

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Scan the barcode on the postage label and this order will carry a tracking link.
          {toBin && ' It then waits in the Mail Bin until the carrier takes it.'}
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
            {busy ? 'Saving…' : go}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
