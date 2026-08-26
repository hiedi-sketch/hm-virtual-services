import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError } from '../api/print';
import { Field } from './ui';

const MATERIAL_TYPES = ['PLA', 'PLA+', 'Silk PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'PC'];

const BLANK_FILAMENT = {
  color_name: '', brand: '', material_type: 'PLA', color_hex: '#2B7A8B',
  spool_size_kg: 1, cost_per_kg: '', vendor_name: '', vendor_url: '', initial_spools: 1,
};

const BLANK_MATERIAL = { name: '', unit: 'each', pack_cost: '', pack_size: 1, qty_on_hand: 1 };

/**
 * What to do with a barcode the shop has never seen. Usually it is a spool of
 * something new, but it can just as easily be a colour already in the library
 * whose manufacturer barcode was never recorded — so linking is offered too,
 * otherwise scanning quietly breeds duplicates.
 */
export default function UnknownCode({ code, onResolved, onCancel, onScanAgain }) {
  const [mode, setMode] = useState('choose');
  const [filament, setFilament] = useState({ ...BLANK_FILAMENT });
  const [material, setMaterial] = useState({ ...BLANK_MATERIAL });
  const [targets, setTargets] = useState(null);
  const [link, setLink] = useState({ type: 'filament', id: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode !== 'link' || targets) return;
    printApi.scanTargets().then(setTargets).catch(() => toast.error('Could not load what you already stock'));
  }, [mode, targets]);

  async function finish(promise, fallback) {
    setBusy(true);
    try {
      await promise;
      const match = await printApi.scanLookup(code);
      onResolved(match);
    } catch (err) {
      toast.error(describeError(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  function addFilament(e) {
    e.preventDefault();
    finish(
      printApi.createFilament({
        ...filament,
        spool_size_kg: Number(filament.spool_size_kg) || 1,
        cost_per_kg: Number(filament.cost_per_kg) || 0,
        initial_spools: Number(filament.initial_spools) || 0,
        vendor_barcode: code,
      }),
      'Could not add that filament'
    );
  }

  function addMaterial(e) {
    e.preventDefault();
    finish(
      printApi.createMaterial({
        ...material,
        pack_cost: material.pack_cost === '' ? null : Number(material.pack_cost),
        pack_size: Number(material.pack_size) || 1,
        qty_on_hand: Number(material.qty_on_hand) || 0,
        vendor_barcode: code,
      }),
      'Could not add that material'
    );
  }

  function saveLink(e) {
    e.preventDefault();
    if (!link.id) return;
    finish(
      printApi.scanLink({ code, type: link.type, id: Number(link.id) }),
      'Could not attach that code'
    );
  }

  const options = targets?.[link.type] || [];

  return (
    <div className="space-y-4">
      <div>
        <p className="font-bold text-primary">Nothing in the shop matches this</p>
        <p className="font-mono text-sm text-gray-600 mt-1 break-all">{code}</p>
      </div>

      {mode === 'choose' && (
        <>
          <p className="text-sm text-gray-600">
            If it is a new spool, add it and the code sticks to it. If it is something you already
            stock, attach the code to that instead so it scans next time.
          </p>
          <div className="grid gap-2">
            <button className="btn-primary !py-3" onClick={() => setMode('filament')}>
              Add it as filament
            </button>
            <button className="btn-secondary !py-3" onClick={() => setMode('material')}>
              Add it as a material
            </button>
            <button className="btn-secondary !py-3" onClick={() => setMode('link')}>
              It is something I already stock
            </button>
          </div>
          <div className="flex justify-between">
            <button className="btn-ghost" onClick={onScanAgain}>Scan something else</button>
            <button className="btn-ghost" onClick={onCancel}>Not now</button>
          </div>
        </>
      )}

      {mode === 'filament' && (
        <form onSubmit={addFilament} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Colour">
              <input className="input" required autoFocus value={filament.color_name}
                onChange={(e) => setFilament({ ...filament, color_name: e.target.value })} />
            </Field>
            <Field label="Brand">
              <input className="input" required value={filament.brand}
                onChange={(e) => setFilament({ ...filament, brand: e.target.value })} />
            </Field>
            <Field label="Type">
              <input list="quick-filament-types" className="input" value={filament.material_type}
                onChange={(e) => setFilament({ ...filament, material_type: e.target.value })} />
              <datalist id="quick-filament-types">
                {MATERIAL_TYPES.map((t) => <option key={t} value={t} />)}
              </datalist>
            </Field>
            <Field label="Swatch">
              <input type="color" className="input !p-1 h-[42px]" value={filament.color_hex}
                onChange={(e) => setFilament({ ...filament, color_hex: e.target.value })} />
            </Field>
            <Field label="Spool size (kg)">
              <input type="number" step="0.05" className="input" value={filament.spool_size_kg}
                onChange={(e) => setFilament({ ...filament, spool_size_kg: e.target.value })} />
            </Field>
            <Field label="Cost per kg">
              <input type="number" step="0.01" inputMode="decimal" className="input" value={filament.cost_per_kg}
                onChange={(e) => setFilament({ ...filament, cost_per_kg: e.target.value })} />
            </Field>
            <Field label="Spools in hand" className="col-span-2" hint="Counting the one you just scanned.">
              <input type="number" className="input" value={filament.initial_spools}
                onChange={(e) => setFilament({ ...filament, initial_spools: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-gray-500">
            Vendor, reorder link and reorder point can go in later on the Filament tab.
          </p>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-ghost" onClick={() => setMode('choose')}>Back</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Adding…' : 'Add and put it in stock'}
            </button>
          </div>
        </form>
      )}

      {mode === 'material' && (
        <form onSubmit={addMaterial} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" className="col-span-2">
              <input className="input" required autoFocus value={material.name}
                onChange={(e) => setMaterial({ ...material, name: e.target.value })} />
            </Field>
            <Field label="Unit">
              <input className="input" value={material.unit}
                onChange={(e) => setMaterial({ ...material, unit: e.target.value })} />
            </Field>
            <Field label="How many now">
              <input type="number" step="0.01" className="input" value={material.qty_on_hand}
                onChange={(e) => setMaterial({ ...material, qty_on_hand: e.target.value })} />
            </Field>
            <Field label="Pack cost">
              <input type="number" step="0.01" inputMode="decimal" className="input" value={material.pack_cost}
                onChange={(e) => setMaterial({ ...material, pack_cost: e.target.value })} />
            </Field>
            <Field label="Units per pack">
              <input type="number" className="input" value={material.pack_size}
                onChange={(e) => setMaterial({ ...material, pack_size: e.target.value })} />
            </Field>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-ghost" onClick={() => setMode('choose')}>Back</button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {busy ? 'Adding…' : 'Add and put it in stock'}
            </button>
          </div>
        </form>
      )}

      {mode === 'link' && (
        <form onSubmit={saveLink} className="space-y-3">
          <Field label="What is it?">
            <select className="input" value={link.type}
              onChange={(e) => setLink({ type: e.target.value, id: '' })}>
              <option value="filament">Filament</option>
              <option value="material">Material</option>
              <option value="item">Catalog item</option>
            </select>
          </Field>
          <Field label="Which one" hint="The code gets attached to it, so this scan works from now on.">
            <select className="input" required value={link.id}
              onChange={(e) => setLink({ ...link, id: e.target.value })}>
              <option value="">{targets ? 'Choose…' : 'Loading…'}</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </Field>
          {targets && !options.length && (
            <p className="text-xs text-gray-500">Nothing of that kind in the shop yet.</p>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn-ghost" onClick={() => setMode('choose')}>Back</button>
            <button type="submit" className="btn-primary" disabled={busy || !link.id}>
              {busy ? 'Attaching…' : 'Attach the code'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
