import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import LabelSheet from './LabelSheet';
import printApi, { describeError } from '../api/print';
import { LoadError } from './ui';

/**
 * The drawers finished stock is kept in, waiting for an order.
 *
 * With a product passed in it is a place-picker; without one it is a map of
 * where everything is — the same two jobs the filament rack does, because they
 * are the same question asked of different furniture.
 *
 * What is in a drawer is not stored anywhere: a product carries the drawer it
 * lives in, and the drawer's contents are read back from the catalog. So there
 * is one fact about where a thing is, and moving it is one write.
 */

/**
 * The stock the labels are printed on — ordinary 2" × 1", two drawers to a
 * label, cut apart down the middle.
 *
 * They used to be printed at the size of the drawer front itself, an inch and
 * a half by a quarter, which is a page size most printers will not take: the
 * job either came out blank, on a whole sheet of paper, or not at all.
 */
const LABEL_W = 2;
const LABEL_H = 1;

function Drawer({ drawer, currentItemId, onPick, pickable }) {
  const items = drawer.items || [];
  const holdsCurrent = items.some((i) => i.id === currentItemId);
  const Tag = pickable ? 'button' : 'div';

  return (
    <Tag
      type={pickable ? 'button' : undefined}
      onClick={pickable ? () => onPick(drawer) : undefined}
      className={`text-left rounded-xl border p-2 min-h-[3.75rem] flex flex-col gap-0.5 transition-colors ${
        holdsCurrent
          ? 'border-primary bg-primary/10'
          : items.length
            ? 'border-greige bg-white'
            : 'border-dashed border-silver bg-linen/60'
      } ${pickable ? 'hover:border-primary hover:bg-primary/5' : ''}`}
    >
      <span className="flex items-baseline gap-1.5 flex-wrap">
        <span className="font-mono text-xs font-semibold text-primary">{drawer.code}</span>
        {holdsCurrent && <span className="text-[10px] font-bold uppercase tracking-wide text-primary">here now</span>}
        {/* A drawer is meant to hold one or two things. A third is not worth
            refusing, but it is worth her seeing. */}
        {items.length > 2 && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">{items.length} in it</span>
        )}
      </span>

      {items.length ? (
        <span className="flex flex-col gap-0.5">
          {items.map((item) => (
            <span key={item.id} className="text-[11px] leading-tight min-w-0 truncate">
              <span className="font-semibold text-gray-700">{item.qty_on_hand}</span>{' '}
              <span className="text-gray-600">{item.name}</span>
            </span>
          ))}
        </span>
      ) : (
        <span className="text-[11px] text-gray-400">Empty</span>
      )}
    </Tag>
  );
}

export default function DrawerRack({ open, item, onClose, onMoved }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [labels, setLabels] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await printApi.drawers());
    } catch (err) {
      const message = describeError(err, 'Could not load the drawers');
      setError(message);
      toast.error(message);
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  async function move(drawer) {
    setBusy(true);
    try {
      const { message } = await printApi.setDrawer(item.id, drawer);
      toast.success(message);
      onMoved?.(drawer);
      onClose();
    } catch (err) {
      toast.error(describeError(err, 'Could not file that'));
    } finally {
      setBusy(false);
      load();
    }
  }

  const title = item ? `Which drawer for ${item.name}?` : 'The drawers';
  const drawerLabels = (data?.drawers || []).map((d) => ({ key: `drawer-${d.code}`, name: d.code, code: d.code }));

  return (
    <>
      <Modal open={open && !labels} onClose={onClose} title={title} size="lg">
        {error && !data ? (
          <LoadError message={error} onRetry={load} what="the drawers" />
        ) : !data ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="space-y-4">
            {item && (
              <p className="text-sm text-gray-600">
                Tap a drawer to keep <span className="font-semibold text-primary">{item.name}</span> in it.
                A drawer is meant to hold one or two things.
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {data.drawers.map((drawer) => (
                <Drawer
                  key={drawer.code}
                  drawer={drawer}
                  currentItemId={item?.id}
                  pickable={!!item && !busy}
                  onPick={(d) => move(d.code)}
                />
              ))}
            </div>

            {data.unlisted.length > 0 && (
              <div>
                <p className="font-bold text-amber-700 text-sm mb-2">Drawers no longer on the list</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {data.unlisted.map((drawer) => (
                    <Drawer key={drawer.code} drawer={drawer} currentItemId={item?.id} pickable={false} />
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  These are filed under a drawer that has been taken off the list in Settings. Move them
                  to a current one when you get a chance.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-linen pt-3">
              <p className="text-xs text-gray-500 flex-1">
                {data.unassigned} product{data.unassigned === 1 ? '' : 's'} with no drawer yet.
              </p>
              {item?.drawer && (
                <button className="btn-secondary" disabled={busy} onClick={() => move(null)}>
                  Take it out of the drawer
                </button>
              )}
              {!item && drawerLabels.length > 0 && (
                <button className="btn-secondary" onClick={() => setLabels(true)}>
                  Print drawer labels
                </button>
              )}
              <button className="btn-ghost" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </Modal>

      <LabelSheet
        open={labels}
        title="Drawer labels"
        subtitle="the drawer's name and its barcode, side by side"
        labels={drawerLabels}
        width={LABEL_W}
        height={LABEL_H}
        layout="split"
        onClose={() => setLabels(false)}
      />
    </>
  );
}
