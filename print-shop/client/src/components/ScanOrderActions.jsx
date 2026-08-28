import { useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError } from '../api/print';
import { Pill } from './ui';

/**
 * What a scanned order ticket offers: the next stage as one big button, since
 * that is the whole point of scanning it, with the rest of the chain behind a
 * second tap for the times work skips ahead.
 */
export default function ScanOrderActions({ match, stages, onChanged, onDone }) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const order = match.order;
  const next = order.next_stage_info;

  async function move(to) {
    setBusy(true);
    try {
      const { message } = await printApi.scanAdvance({ code: match.code, ...(to ? { to } : {}) });
      toast.success(message || 'Moved on');
      setPicking(false);
      await onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not move that order on'));
    } finally {
      setBusy(false);
    }
  }

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

      {next ? (
        <button
          disabled={busy}
          onClick={() => move(null)}
          className="btn-primary w-full !py-4 text-base"
        >
          {busy ? 'Moving…' : next.scan_label}
        </button>
      ) : (
        <p className="text-sm text-gray-500 text-center py-2">
          {order.status === 'shipped'
            ? 'This one is shipped — nothing further to scan.'
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

      <div className="flex gap-2">
        <button onClick={onDone} className="btn-secondary flex-1 !py-3">Done</button>
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
