import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import printApi, { describeError, grams } from '../api/print';
import { LoadError } from './ui';

function Slot({ slot, currentSpoolId, onPick, pickable }) {
  const spools = slot.spools || [];
  const holdsCurrent = spools.some((s) => s.id === currentSpoolId);
  const Tag = pickable ? 'button' : 'div';
  const full = slot.capacity != null && spools.length >= slot.capacity && !holdsCurrent;

  return (
    <Tag
      type={pickable ? 'button' : undefined}
      onClick={pickable ? () => onPick(slot) : undefined}
      className={`text-left rounded-xl border p-2.5 min-h-[4.5rem] flex flex-col gap-1 transition-colors ${
        holdsCurrent
          ? 'border-primary bg-primary/10'
          : spools.length
            ? 'border-greige bg-white'
            : 'border-dashed border-silver bg-linen/60'
      } ${pickable ? 'hover:border-primary hover:bg-primary/5' : ''}`}
    >
      <span className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono text-xs font-semibold text-primary">{slot.code}</span>
        {holdsCurrent && <span className="text-[10px] font-bold uppercase tracking-wide text-primary">here now</span>}
        {full && <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">loaded</span>}
        {slot.capacity == null && spools.length > 1 && (
          <span className="text-[10px] text-gray-500">{spools.length} spools</span>
        )}
      </span>

      {spools.length ? (
        <span className="flex flex-col gap-1">
          {spools.map((spool) => (
            <span key={spool.id} className="flex items-start gap-1.5 min-w-0">
              <span
                className="w-3.5 h-3.5 rounded-full border border-greige shrink-0 mt-0.5"
                style={{ background: spool.color_hex || '#B0B5BC' }}
              />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-gray-800 leading-tight truncate">
                  {spool.label}
                </span>
                <span className="block text-[11px] text-gray-500">{grams(spool.grams_remaining)}</span>
              </span>
            </span>
          ))}
        </span>
      ) : (
        <span className="text-xs text-gray-400">empty</span>
      )}
    </Tag>
  );
}

/**
 * The rack. With a spool passed in it is a place-picker; without one it is
 * just a map of where everything is.
 */
export default function LocationPicker({ open, spool, onClose, onMoved }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await printApi.spoolLocations());
    } catch (err) {
      const message = describeError(err, 'Could not load the rack');
      setError(message);
      toast.error(message);
    }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  async function move(location, swap = false) {
    setBusy(true);
    try {
      const response = await printApi.moveSpool(spool.id, location, swap);
      toast.success(response.message);
      if (response.displaced) {
        toast(`${response.displaced.label} came out and needs a place`, { icon: '↩' });
      }
      onMoved?.(response);
      onClose();
    } catch (err) {
      const occupant = err.response?.data?.occupied_by;
      if (err.response?.status === 409 && occupant) {
        if (window.confirm(`${location} is loaded with ${occupant.label}. Take that one out and load this instead?`)) {
          setBusy(false);
          return move(location, true);
        }
      } else {
        toast.error(describeError(err, 'Could not move that spool'));
      }
    } finally {
      setBusy(false);
      load();
    }
  }

  const title = spool ? `Where is ${spool.spool_code}?` : 'Where everything is';

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      {error && !data ? (
        <LoadError message={error} onRetry={load} what="the rack" />
      ) : !data ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-5">
          {spool && (
            <p className="text-sm text-gray-600">
              Tap a slot to put <span className="font-semibold text-primary">{spool.label}</span> there.
              A shelf slot holds as many spools as you like; an AMS bay holds one, so picking a
              loaded bay offers to swap.
            </p>
          )}

          <div>
            <p className="font-bold text-primary text-sm mb-2">In the printer <span className="font-normal text-gray-500">— one spool each</span></p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {data.ams.map((slot) => (
                <Slot
                  key={slot.code}
                  slot={slot}
                  currentSpoolId={spool?.id}
                  pickable={!!spool && !busy}
                  onPick={(s) => move(s.code)}
                />
              ))}
            </div>
          </div>

          <div>
            <p className="font-bold text-primary text-sm mb-2">On the shelf <span className="font-normal text-gray-500">— stack as many as you like</span></p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {data.shelf.map((slot) => (
                <Slot
                  key={slot.code}
                  slot={slot}
                  currentSpoolId={spool?.id}
                  pickable={!!spool && !busy}
                  onPick={(s) => move(s.code)}
                />
              ))}
            </div>
          </div>

          {data.unlisted.length > 0 && (
            <div>
              <p className="font-bold text-amber-700 text-sm mb-2">Slots no longer on the list</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {data.unlisted.map((slot) => (
                  <Slot key={slot.code} slot={slot} currentSpoolId={spool?.id} pickable={false} />
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                These spools are parked somewhere that has been removed from Settings. Move them to a
                current slot when you get a chance.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-linen pt-3">
            <p className="text-xs text-gray-500 flex-1">
              {data.unassigned} spool{data.unassigned === 1 ? '' : 's'} with no place yet.
            </p>
            {spool?.location && (
              <button className="btn-secondary" disabled={busy} onClick={() => move(null)}>
                Take it off the rack
              </button>
            )}
            <button className="btn-ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
