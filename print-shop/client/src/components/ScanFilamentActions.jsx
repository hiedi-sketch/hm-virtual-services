import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError, grams } from '../api/print';
import { Field, Pill } from './ui';
import LocationPicker from './LocationPicker';

function SlotSelect({ slots, value, onChange }) {
  return (
    <select className="input text-base" value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">No place yet</option>
      {slots.ams?.length > 0 && (
        <optgroup label="In the printer">
          {slots.ams.map((code) => <option key={code} value={code}>{code}</option>)}
        </optgroup>
      )}
      {slots.shelf?.length > 0 && (
        <optgroup label="On the shelf">
          {slots.shelf.map((code) => <option key={code} value={code}>{code}</option>)}
        </optgroup>
      )}
    </select>
  );
}

/**
 * What you can do with a spool in your hand: put more of it away, open one,
 * or move one somewhere else. Scanning a spool's own tag skips the "which
 * one" step, because the scan already said which.
 */
export default function ScanFilamentActions({ match, onChanged, onDone }) {
  const filament = match.filament;
  const scannedSpool = match.spool || null;

  const [mode, setMode] = useState('menu');
  const [slots, setSlots] = useState({ shelf: [], ams: [] });
  const [receive, setReceive] = useState({ count: 1, location: '' });
  const [moving, setMoving] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    printApi.spoolLocations()
      .then((rack) => setSlots(rack.lists))
      .catch(() => { /* the picker reports it if it matters */ });
  }, []);

  const spools = (filament.spools || []).filter((s) => s.status !== 'empty' && s.status !== 'ordered');
  const newSpools = spools.filter((s) => s.status === 'new');

  async function doReceive(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await printApi.addSpools(filament.id, {
        count: Number(receive.count) || 1,
        status: 'new',
        location: receive.location || null,
      });
      toast.success(
        receive.location
          ? `${receive.count} spool(s) put in ${receive.location}`
          : `${receive.count} spool(s) added — give them a place when you can`
      );
      setMode('menu');
      setReceive({ count: 1, location: '' });
      await onChanged();
    } catch (err) {
      toast.error(describeError(err, 'Could not add those spools'));
    } finally {
      setBusy(false);
    }
  }

  async function openOne() {
    setBusy(true);
    try {
      const target = scannedSpool && scannedSpool.status === 'new' ? scannedSpool : newSpools[0];
      if (!target) {
        toast.error('No sealed spools of this to open');
        return;
      }
      await printApi.updateSpool(target.id, { status: 'opened' });
      toast.success(`${target.spool_code} is open`);
      await onChanged();
    } catch (err) {
      toast.error(describeError(err, 'Could not open that spool'));
    } finally {
      setBusy(false);
    }
  }

  // ── Receive ───────────────────────────────────────────────────────────────
  if (mode === 'receive') {
    return (
      <form onSubmit={doReceive} className="space-y-3">
        <p className="text-sm text-gray-600">
          Putting more <span className="font-semibold text-primary">{filament.color_name}</span> away.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="How many spools">
            <input
              type="number"
              min="1"
              inputMode="numeric"
              className="input text-lg"
              autoFocus
              value={receive.count}
              onChange={(e) => setReceive({ ...receive, count: e.target.value })}
            />
          </Field>
          <Field
            label="Where they go"
            hint={receive.location.startsWith('AMS') && Number(receive.count) > 1
              ? 'A bay holds one — the rest wait for a place.'
              : undefined}
          >
            <SlotSelect slots={slots} value={receive.location} onChange={(v) => setReceive({ ...receive, location: v })} />
          </Field>
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn-ghost" onClick={() => setMode('menu')}>Back</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Adding…' : 'Put them away'}
          </button>
        </div>
      </form>
    );
  }

  // ── Move: pick which spool first, unless the scan already said ────────────
  if (mode === 'move') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">Which spool are you moving?</p>
        <div className="space-y-2">
          {spools.map((spool) => (
            <button
              key={spool.id}
              className="w-full text-left rounded-xl border border-greige bg-white p-3 hover:border-primary hover:bg-primary/5"
              onClick={() => setMoving({ ...spool, label: `${filament.brand} ${filament.color_name}` })}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-gray-600">{spool.spool_code}</span>
                <Pill tone={spool.location ? (spool.location.startsWith('AMS') ? 'teal' : 'gray') : 'amber'}>
                  {spool.location || 'no place'}
                </Pill>
                <span className="text-xs text-gray-500">
                  {spool.status === 'opened'
                    ? `${grams(spool.grams_remaining ?? filament.full_spool_grams)} left`
                    : 'sealed'}
                </span>
              </span>
            </button>
          ))}
          {!spools.length && <p className="text-xs text-gray-500">Nothing of this on the shelf to move.</p>}
        </div>
        <div className="flex justify-end">
          <button className="btn-ghost" onClick={() => setMode('menu')}>Back</button>
        </div>

        {moving && (
          <LocationPicker
            open
            spool={moving}
            onClose={() => setMoving(null)}
            onMoved={async () => { setMoving(null); setMode('menu'); await onChanged(); }}
          />
        )}
      </div>
    );
  }

  // ── The three things you do with a spool in your hand ──────────────────────
  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <button className="btn-primary !py-3" disabled={busy} onClick={() => setMode('receive')}>
          Receiving — put spools away
        </button>
        <button className="btn-secondary !py-3" disabled={busy || !newSpools.length} onClick={openOne}>
          {newSpools.length
            ? `Open one${scannedSpool ? ` (${scannedSpool.spool_code})` : ''}`
            : 'Open one — none sealed'}
        </button>
        <button
          className="btn-secondary !py-3"
          disabled={busy || !spools.length}
          onClick={() => (scannedSpool
            ? setMoving({ ...scannedSpool, label: `${filament.brand} ${filament.color_name}` })
            : setMode('move'))}
        >
          {scannedSpool?.location ? `Move it out of ${scannedSpool.location}` : 'Move a spool'}
        </button>
      </div>

      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={onDone}>Done</button>
      </div>

      {moving && (
        <LocationPicker
          open
          spool={moving}
          onClose={() => setMoving(null)}
          onMoved={async () => { setMoving(null); await onChanged(); }}
        />
      )}
    </div>
  );
}
