import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import printApi, { describeError } from '../api/print';
import { Pill } from './ui';

/**
 * Two rows for one product, and the one button that makes it one row.
 *
 * A pull from Shopify creates an item when it cannot recognise one already
 * here, so the pair is almost always "the one you made", carrying the costing,
 * and "the one Shopify made", carrying the link. Merging keeps the first and
 * folds the second into it — which is why the panel shows what each side is
 * carrying before it asks.
 */

function Side({ item, keep }) {
  const u = item.usage || {};
  const bits = [
    u.order_lines && `${u.order_lines} order line${u.order_lines === 1 ? '' : 's'}`,
    u.print_jobs && `${u.print_jobs} print job${u.print_jobs === 1 ? '' : 's'}`,
    u.recipe_lines && `${u.recipe_lines} recipe line${u.recipe_lines === 1 ? '' : 's'}`,
    u.used_in_others && `in ${u.used_in_others} other item${u.used_in_others === 1 ? '' : 's'}`,
    item.print_time_minutes > 0 && `${item.print_time_minutes} min print`,
    item.qty_on_hand > 0 && `${item.qty_on_hand} on hand`,
  ].filter(Boolean);

  return (
    <div className={`rounded-lg border p-2.5 ${keep ? 'border-emerald-300 bg-emerald-50/50' : 'border-linen'}`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <p className={`text-sm leading-tight ${keep ? 'font-bold text-primary' : 'text-gray-700'}`}>{item.name}</p>
        {keep ? <Pill tone="green">Keeping this one</Pill> : <Pill tone="gray">Folding in</Pill>}
        {item.linked && <Pill tone="teal">Shopify</Pill>}
      </div>
      <p className="font-mono text-[11px] text-gray-400 mt-0.5">{item.sku}</p>
      {bits.length > 0 && <p className="text-[11px] text-gray-500 mt-1">{bits.join(' · ')}</p>}
    </div>
  );
}

export default function DuplicatesPanel({ open, onClose, onChanged }) {
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setGroups(await printApi.duplicates());
    } catch (err) {
      setError(describeError(err, 'Could not look for duplicates'));
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  async function merge(group) {
    setBusy(group.key);
    try {
      const { message } = await printApi.mergeItems(group.keep.id, group.others.map((o) => o.id));
      toast.success(message);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not merge those'));
    } finally {
      setBusy(null);
    }
  }

  async function mergeAll() {
    setBusy('all');
    try {
      let done = 0;
      for (const group of groups) {
        await printApi.mergeItems(group.keep.id, group.others.map((o) => o.id));
        done += 1;
      }
      toast.success(`${done} product${done === 1 ? '' : 's'} merged`);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(describeError(err, 'Stopped part way — the ones done are done'));
      await load();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Duplicate products" size="lg">
      {error ? (
        <div className="space-y-3">
          <p className="text-sm text-red-600">{error}</p>
          <button onClick={load} className="btn-secondary">Try again</button>
        </div>
      ) : !groups ? (
        <p className="text-sm text-gray-500">Looking…</p>
      ) : !groups.length ? (
        <p className="text-sm text-gray-500">
          Nothing looks doubled up. A pull from Shopify only adds a product it cannot recognise here,
          so this stays empty as long as the names and codes line up.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {groups.length} product{groups.length === 1 ? '' : 's'} appear{groups.length === 1 ? 's' : ''} twice.
            Merging keeps the fuller record — its name, costing and recipe — and folds the other into it,
            taking the Shopify link, the photo and the stock with it. Everything ordered or printed follows.
          </p>

          {groups.map((group) => (
            <div key={group.key} className="rounded-xl border border-greige p-3 space-y-2">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">{group.reason}</p>
              <Side item={group.keep} keep />
              {group.others.map((other) => <Side key={other.id} item={other} />)}
              <button
                disabled={!!busy}
                onClick={() => merge(group)}
                className="btn-primary w-full !py-2.5 text-sm"
              >
                {busy === group.key ? 'Merging…' : `Merge into ${group.keep.name}`}
              </button>
            </div>
          ))}

          {groups.length > 1 && (
            <button disabled={!!busy} onClick={mergeAll} className="btn-secondary w-full !py-3">
              {busy === 'all' ? 'Merging…' : `Merge all ${groups.length}`}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
