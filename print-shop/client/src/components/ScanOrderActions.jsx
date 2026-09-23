import { useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError } from '../api/print';
import { Pill } from './ui';
import { useScanner } from './ScanContext';
import ScanPackList from './ScanPackList';
import ScanOrderBin from './ScanOrderBin';

/**
 * What a scanned order ticket offers: the next stage as one big button, since
 * that is the whole point of scanning it, with the rest of the chain behind a
 * second tap for the times work skips ahead.
 */
export default function ScanOrderActions({ match, stages, onChanged, onDone }) {
  const { scan } = useScanner();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [tracking, setTracking] = useState('');
  const order = match.order;
  const next = order.next_stage_info;

  // The label is in her hand as the parcel is sealed, so shipping by scanning
  // the ticket asks for it in the same breath the app does.
  const shippingNext = order.next_stage === 'shipped';

  async function move(to) {
    setBusy(true);
    try {
      const { message } = await printApi.scanAdvance({
        code: match.code,
        ...(to ? { to } : {}),
        ...(tracking ? { tracking } : {}),
      });
      toast.success(message || 'Moved on');
      setPicking(false);
      setTracking('');
      await onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not move that order on'));
    } finally {
      setBusy(false);
    }
  }

  async function saveTracking(code) {
    setBusy(true);
    try {
      const { message } = await printApi.setTracking(order.id, code);
      toast.success(message);
      await onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not save that tracking number'));
    } finally {
      setBusy(false);
    }
  }

  // `keepMatch` brings her back to this sheet with the order still on it.
  const scanLabel = (onDone_) => scan({
    title: 'Scan the tracking label',
    hint: 'Point the camera at the barcode on the postage label',
    keepMatch: true,
    onCode: onDone_,
  });

  const chain = stages.length ? stages : [];
  const at = chain.findIndex((s) => s.key === order.status);

  return (
    <div className="space-y-4">
      {chain.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chain.map((stage, i) => (
            <span
              key={stage.key}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                i < at ? 'bg-primary/10 text-primary'
                  : i === at ? 'bg-primary text-white font-bold'
                  : 'bg-linen text-gray-400'
              }`}
            >
              {stage.label}
            </span>
          ))}
        </div>
      )}

      {/* Where this order lives while it is being made. Asked for as soon as it
          is agreed to, because everything printed after that goes in it. */}
      {!['shipped', 'completed', 'cancelled'].includes(order.status) && (
        <ScanOrderBin order={order} bin={order.bin} onChanged={onChanged} />
      )}

      {/* Packing is the one stage with work of its own on this sheet: check the
          box, then the label, then send it. */}
      {order.status === 'packing' && (
        <ScanPackList order={order} packing={order.packing} />
      )}

      {shippingNext && (
        <div className="rounded-xl border border-linen p-3 space-y-2">
          <p className="label !mb-0">Tracking label</p>
          {tracking ? (
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-primary min-w-0 flex-1 truncate">{tracking}</span>
              <button onClick={() => setTracking('')} className="btn-ghost !py-1 !px-2 text-xs">Clear</button>
            </div>
          ) : (
            <button
              disabled={busy}
              onClick={() => scanLabel(setTracking)}
              className="btn-secondary w-full !py-2.5 text-sm"
            >
              Scan the postage label
            </button>
          )}
          <p className="text-[11px] text-gray-500">
            {tracking
              ? 'It goes on the order when you ship it — the routing digits at the front come off.'
              : 'Optional — shipping without one still works.'}
          </p>
        </div>
      )}

      {/* A parcel that has gone still gets asked about, so the sheet keeps the
          tracking on it after it ships and after it is completed. */}
      {['shipped', 'completed'].includes(order.status) && (
        <div className="rounded-xl border border-linen p-3 space-y-2">
          <p className="label !mb-0">Tracking</p>
          {order.tracking ? (
            <>
              <p className="font-mono text-xs text-gray-600 break-all">
                {order.tracking.carrier_label ? `${order.tracking.carrier_label} · ` : ''}
                {order.tracking.number}
              </p>
              {order.tracking.url && (
                <a
                  href={order.tracking.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-secondary w-full !py-2.5 text-sm block text-center"
                >
                  Check tracking ↗
                </a>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-500">None on this one yet.</p>
          )}
          <button
            disabled={busy}
            onClick={() => scanLabel(saveTracking)}
            className="btn-ghost w-full !py-2 text-xs"
          >
            {order.tracking ? 'Scan a different label' : 'Scan the postage label'}
          </button>
        </div>
      )}

      {next ? (
        <button
          disabled={busy}
          onClick={() => move(null)}
          className="btn-primary w-full !py-4 text-base"
        >
          {busy ? 'Moving…' : next.scan_label}
        </button>
      ) : order.status === 'shipped' ? (
        // Shipped is the end of the chain, not the end of the order: it is done
        // when it has arrived and nobody has written in about it.
        <button
          disabled={busy}
          onClick={() => move('completed')}
          className="btn-primary w-full !py-4 text-base"
        >
          {busy ? 'Marking…' : 'Mark as completed'}
        </button>
      ) : (
        <p className="text-sm text-gray-500 text-center py-2">
          {order.status === 'completed'
            ? 'This one is finished with.'
            : `A ${order.stage?.label.toLowerCase() || order.status} order does not move on by scanning.`}
        </p>
      )}

      {picking ? (
        <div className="grid grid-cols-2 gap-2">
          {chain.filter((s) => s.key !== order.status).map((stage) => (
            <button
              key={stage.key}
              disabled={busy}
              onClick={() => move(stage.key)}
              className="btn-secondary !py-2.5 text-sm"
            >
              {stage.label}
            </button>
          ))}
        </div>
      ) : (
        <button onClick={() => setPicking(true)} className="btn-ghost w-full !py-2 text-sm">
          Send it somewhere else instead
        </button>
      )}

      <div className="space-y-1.5">
        <div className="flex gap-2">
          <button onClick={onDone} className="btn-secondary flex-1 !py-3">Done</button>
        </div>
        {order.status === 'packing' && (
          // Boxes get packed in interruptions. Saying this out loud is the
          // difference between closing the sheet and starting the box again.
          <p className="text-[11px] text-gray-500 text-center">
            Done closes this and keeps what you have scanned into the box.
          </p>
        )}
      </div>
    </div>
  );
}

/** The order itself, as it reads on the scan sheet. */
export function OrderResultCard({ order }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-bold text-primary leading-tight text-lg">{order.order_number}</p>
        {order.stage && <Pill tone={order.stage.tone}>{order.stage.label}</Pill>}
        {order.order_type === 'wholesale' && <Pill tone="teal">Wholesale</Pill>}
      </div>
      <p className="text-xs text-gray-500">
        {order.customer_name || 'No customer name'}
        {order.promised_ship_date && ` · promised ${order.promised_ship_date}`}
      </p>
      {order.items?.length > 0 && (
        <ul className="text-xs text-gray-600 space-y-0.5 border-t border-linen pt-2">
          {order.items.map((line, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-bold text-gray-800 w-6 shrink-0">{line.quantity}×</span>
              <span className="min-w-0 flex-1 truncate">{line.label || 'Item'}</span>
              {line.sku && <span className="font-mono text-gray-400 shrink-0">{line.sku}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
