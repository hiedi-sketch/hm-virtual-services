import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import printApi, { describeError, grams } from '../api/print';
import { LoadError, Pill } from './ui';
import { useScanner } from './ScanContext';

const GROUPS = [
  { type: 'filament', title: 'Filament', hint: 'Load these colours' },
  { type: 'item', title: 'Parts off the shelf', hint: 'Already made — no need to print them again' },
  { type: 'material', title: 'Materials', hint: 'Hardware, magnets, packaging' },
];

function amount(line) {
  if (line.line_type === 'filament') return grams(line.quantity);
  return `${line.quantity} ${line.unit || ''}`.trim();
}

function Line({ line, onToggle }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(line)}
      className={`w-full text-left flex items-start gap-3 rounded-xl border p-3 transition-colors ${
        line.picked ? 'border-emerald-300 bg-emerald-50' : 'border-greige bg-white hover:bg-linen'
      }`}
    >
      <span
        className={`mt-0.5 w-6 h-6 rounded-md border-2 shrink-0 flex items-center justify-center text-sm font-bold ${
          line.picked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-silver text-transparent'
        }`}
        aria-hidden
      >
        ✓
      </span>

      {line.line_type === 'filament' && (
        <span
          className="mt-1 w-5 h-5 rounded-full border border-greige shrink-0"
          style={{ background: line.color_hex || '#B0B5BC' }}
        />
      )}

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className={`font-semibold ${line.picked ? 'text-emerald-800 line-through' : 'text-primary'}`}>
            {line.label}
          </span>
          <span className="font-bold text-gray-800">{amount(line)}</span>
          {line.short_by > 0 && <Pill tone="red">Short {line.line_type === 'filament' ? grams(line.short_by) : line.short_by}</Pill>}
        </span>

        <span className="block text-xs text-gray-500 mt-0.5">
          {line.sublabel ? `${line.sublabel} · ` : ''}
          {line.line_type === 'filament' ? `${grams(line.qty_on_hand)} on hand` : `${line.qty_on_hand} on hand`}
        </span>

        {line.spools?.length > 0 && (
          <span className="block text-xs text-gray-600 mt-1.5 space-y-0.5">
            {line.spools.map((s) => (
              <span key={s.spool_id} className="block">
                <span className="font-mono">{s.spool_code}</span>
                {' — take '}{grams(s.grams_to_take)}
                {s.needs_opening && <span className="text-amber-700 font-semibold"> · open a new spool</span>}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * Everything to gather before a job starts, tickable by hand or by scanning
 * each thing as it is collected.
 */
export default function PickList({ open, queueId, onClose, onStart }) {
  const { scan } = useScanner();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!queueId) return;
    setError('');
    try {
      setData(await printApi.pickList(queueId));
    } catch (err) {
      const message = describeError(err, 'Could not load the pick list');
      setError(message);
      toast.error(message);
    }
  }, [queueId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  async function toggle(line) {
    try {
      setData(await printApi.setPicked(line.id, !line.picked));
    } catch (err) {
      toast.error(describeError(err, 'Could not tick that off'));
    }
  }

  function scanOne() {
    scan({
      title: 'Scan what you just picked up',
      hint: 'Spool tag, shelf label or product label',
      onCode: async (code) => {
        try {
          const { data: next, message } = await printApi.scanPick(queueId, code);
          setData(next);
          toast.success(message);
          // Keep the scanner open while there is more to gather.
          if (next.picked < next.total) setTimeout(scanOne, 350);
        } catch (err) {
          if (err.response?.data?.data) setData(err.response.data.data);
          toast.error(describeError(err, 'That is not on this list'));
        }
      },
    });
  }

  async function rebuild() {
    setBusy(true);
    try {
      setData(await printApi.rebuildPickList(queueId));
      toast.success('Rebuilt from what is on the shelf now');
    } catch (err) {
      toast.error(describeError(err, 'Could not rebuild the list'));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (data && data.picked < data.total) {
      const left = data.total - data.picked;
      if (!window.confirm(`${left} thing${left === 1 ? '' : 's'} still to collect. Start the print anyway?`)) return;
    }
    setBusy(true);
    try {
      await onStart();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const allDone = data && data.total > 0 && data.picked === data.total;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={data ? `Collect for ${data.quantity} × ${data.item_name}` : 'Pick list'}
    >
      {error && !data ? (
        <LoadError message={error} onRetry={load} what="the pick list" />
      ) : !data ? (
        <p className="text-sm text-gray-500">Working out what you need…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[10rem]">
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm font-semibold text-primary">
                  {data.picked} of {data.total} collected
                </span>
                {data.short > 0 && <Pill tone="red">{data.short} short</Pill>}
              </div>
              <div className="h-2 rounded-full bg-linen overflow-hidden">
                <div
                  className={`h-full transition-all ${allDone ? 'bg-emerald-500' : 'bg-primary'}`}
                  style={{ width: `${data.total ? (data.picked / data.total) * 100 : 0}%` }}
                />
              </div>
            </div>
            <button type="button" className="btn-secondary" onClick={scanOne}>Scan to tick off</button>
          </div>

          {!data.total && (
            <p className="text-sm text-gray-500">
              This item has no recipe yet, so there is nothing to gather. Add filament and materials to it
              in the Catalog and the list will fill in.
            </p>
          )}

          {GROUPS.map(({ type, title, hint }) => {
            const lines = data.lines.filter((l) => l.line_type === type);
            if (!lines.length) return null;
            return (
              <div key={type} className="space-y-2">
                <div>
                  <p className="font-bold text-primary text-sm">{title}</p>
                  <p className="text-xs text-gray-500">{hint}</p>
                </div>
                {lines.map((line) => <Line key={line.id} line={line} onToggle={toggle} />)}
              </div>
            );
          })}

          <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-linen">
            <button type="button" className="btn-ghost" onClick={rebuild} disabled={busy}>
              Rebuild list
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
            <button type="button" className="btn-primary" onClick={start} disabled={busy}>
              {allDone ? 'Everything collected — start print' : 'Start print'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
