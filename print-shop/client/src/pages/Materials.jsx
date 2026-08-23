import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import printApi, { describeError, money } from '../api/print';
import { EmptyState, Field, LabelModal, LoadError, Pill, StatCard, StockBar, StockLegend } from '../components/ui';
import { useScanner } from '../components/ScanContext';

const UNITS = ['each', 'set', 'pair', 'g', 'ml', 'cm', 'in', 'sheet', 'yard', 'pack'];

const BLANK = {
  name: '', category: '', unit: 'each', pack_cost: '', pack_size: 1, cost_per_unit: '',
  qty_on_hand: 0, qty_on_order: 0, reorder_point: 0,
  vendor_name: '', vendor_url: '', vendor_sku: '', vendor_barcode: '', notes: '',
};

export default function Materials() {
  const { refreshKey, refresh } = useOutletContext();
  const { scan } = useScanner();

  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState(null);
  const [adjust, setAdjust] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ mode: 'receive', quantity: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setMaterials(await printApi.materials());
    } catch (err) {
      const message = describeError(err, 'Could not load materials');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        pack_size: Number(form.pack_size) || 1,
        pack_cost: form.pack_cost === '' ? null : Number(form.pack_cost),
        cost_per_unit: Number(form.cost_per_unit) || 0,
        qty_on_hand: Number(form.qty_on_hand) || 0,
        qty_on_order: Number(form.qty_on_order) || 0,
        reorder_point: Number(form.reorder_point) || 0,
      };
      if (editing === 'new') await printApi.createMaterial(payload);
      else await printApi.updateMaterial(editing, payload);
      toast.success('Saved');
      setEditing(null);
      load();
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save that material');
    } finally {
      setSaving(false);
    }
  }

  async function runAdjust(e) {
    e.preventDefault();
    try {
      await printApi.adjustMaterial(adjust.id, { ...adjustForm, quantity: Number(adjustForm.quantity) || 0 });
      toast.success('Stock updated');
      setAdjust(null);
      load();
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not adjust that');
    }
  }

  async function remove(m) {
    if (!window.confirm(`Delete ${m.name}?`)) return;
    try {
      await printApi.deleteMaterial(m.id);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete that material');
    }
  }

  const totals = materials.reduce(
    (acc, m) => ({
      value: acc.value + m.value_on_hand,
      reorder: acc.reorder + (m.needs_reorder ? 1 : 0),
      short: acc.short + (m.short_by > 0 ? 1 : 0),
    }),
    { value: 0, reorder: 0, short: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-primary">Materials</h1>
          <p className="text-sm text-gray-500">Magnets, hardware, packaging — everything that goes into a product besides filament.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => scan({ title: 'Scan a material' })}>Scan</button>
          <button className="btn-primary" onClick={() => { setForm(BLANK); setEditing('new'); }}>Add material</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Materials" value={materials.length} />
        <StatCard label="Value on hand" value={money(totals.value)} />
        <StatCard label="Need reorder" value={totals.reorder} tone={totals.reorder ? 'danger' : 'good'} />
        <StatCard label="Short for queue" value={totals.short} tone={totals.short ? 'warn' : 'good'} />
      </div>

      <div className="card !p-4"><StockLegend /></div>

      {error && !materials.length ? (
        <LoadError message={error} onRetry={load} what="materials" />
      ) : loading ? (
        <div className="card text-center py-12 text-sm text-gray-500">Loading…</div>
      ) : !materials.length ? (
        <EmptyState
          title="No materials yet"
          action={<button className="btn-primary" onClick={() => { setForm(BLANK); setEditing('new'); }}>Add a material</button>}
        >
          Add anything you buy by the pack — magnets, screws, boxes, vinyl. Pack cost divided by pack size gives the per-unit cost your product pricing uses.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {materials.map((m) => (
            <div key={m.id} className="card !p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-primary leading-tight">{m.name}</p>
                    {m.category && <Pill tone="gray">{m.category}</Pill>}
                    {m.needs_reorder && <Pill tone="red">Reorder</Pill>}
                    {m.short_by > 0 && <Pill tone="amber">Short {m.short_by}</Pill>}
                  </div>
                  <p className="text-xs text-gray-500">
                    {money(m.unit_cost)} per {m.unit}
                    {m.pack_cost != null && ` · ${money(m.pack_cost)} / ${m.pack_size} pack`}
                    {' · '}<span className="font-mono">{m.sku}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary leading-tight">{m.qty_on_hand} {m.unit}</p>
                  <p className="text-[11px] text-gray-500">
                    {m.qty_committed > 0 ? `${m.qty_projected} after queue` : 'nothing committed'}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <StockBar
                  newAmount={m.qty_on_hand}
                  openedAmount={0}
                  orderedAmount={m.qty_on_order}
                  committed={m.qty_committed}
                  reorderAt={m.reorder_point}
                  unit={m.unit}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                {m.qty_on_order > 0 && <Pill tone="violet">{m.qty_on_order} on order</Pill>}
                <span className="ml-auto flex flex-wrap gap-2">
                  {m.vendor_url && (
                    <a href={m.vendor_url} target="_blank" rel="noreferrer" className="btn-ghost !py-1 !px-2">
                      Reorder{m.vendor_name ? ` · ${m.vendor_name}` : ''} ↗
                    </a>
                  )}
                  <button className="btn-ghost !py-1 !px-2" onClick={() => { setAdjust(m); setAdjustForm({ mode: 'receive', quantity: 1 }); }}>Adjust</button>
                  <button
                    className="btn-ghost !py-1 !px-2"
                    onClick={() => setLabel({ title: m.name, subtitle: m.category || 'Material', code: m.barcode || m.sku, meta: `${money(m.unit_cost)} per ${m.unit}` })}
                  >
                    Label
                  </button>
                  <button className="btn-ghost !py-1 !px-2" onClick={() => { setForm({ ...BLANK, ...m }); setEditing(m.id); }}>Edit</button>
                  <button className="btn-ghost !py-1 !px-2 text-red-600" onClick={() => remove(m)}>Delete</button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add material' : 'Edit material'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" className="sm:col-span-2">
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Category">
              <input className="input" placeholder="Hardware, Packaging…" value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
            <Field label="Unit">
              <input list="material-units" className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
              <datalist id="material-units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
            </Field>
            <Field label="Pack cost" hint="What you pay for a whole pack.">
              <input type="number" step="0.01" className="input" value={form.pack_cost ?? ''} onChange={(e) => setForm({ ...form, pack_cost: e.target.value })} />
            </Field>
            <Field label="Units per pack">
              <input type="number" step="1" className="input" value={form.pack_size} onChange={(e) => setForm({ ...form, pack_size: e.target.value })} />
            </Field>
            <Field label="Cost per unit" hint="Only used if you leave pack cost blank.">
              <input type="number" step="0.0001" className="input" value={form.cost_per_unit} onChange={(e) => setForm({ ...form, cost_per_unit: e.target.value })} />
            </Field>
            <Field label="On hand">
              <input type="number" step="0.01" className="input" value={form.qty_on_hand} onChange={(e) => setForm({ ...form, qty_on_hand: e.target.value })} />
            </Field>
            <Field label="On order">
              <input type="number" step="0.01" className="input" value={form.qty_on_order} onChange={(e) => setForm({ ...form, qty_on_order: e.target.value })} />
            </Field>
            <Field label="Reorder point">
              <input type="number" step="0.01" className="input" value={form.reorder_point} onChange={(e) => setForm({ ...form, reorder_point: e.target.value })} />
            </Field>
            <Field label="Vendor">
              <input className="input" value={form.vendor_name || ''} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} />
            </Field>
            <Field label="Reorder link">
              <input className="input" placeholder="https://" value={form.vendor_url || ''} onChange={(e) => setForm({ ...form, vendor_url: e.target.value })} />
            </Field>
            <Field label="Vendor barcode" className="sm:col-span-2">
              <div className="flex gap-2">
                <input className="input font-mono" value={form.vendor_barcode || ''} onChange={(e) => setForm({ ...form, vendor_barcode: e.target.value })} />
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => scan({ title: 'Scan the vendor barcode', onCode: (code) => setForm((f) => ({ ...f, vendor_barcode: code })) })}
                >
                  Scan
                </button>
              </div>
            </Field>
          </div>
          <Field label="Notes">
            <textarea className="input" rows={2} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!adjust} onClose={() => setAdjust(null)} title={adjust ? `Adjust — ${adjust.name}` : ''}>
        <form onSubmit={runAdjust} className="space-y-4">
          <Field label="What happened">
            <select className="input" value={adjustForm.mode} onChange={(e) => setAdjustForm({ ...adjustForm, mode: e.target.value })}>
              <option value="receive">Received more</option>
              <option value="consume">Used some</option>
              <option value="count">Counted the shelf</option>
            </select>
          </Field>
          <Field label={adjustForm.mode === 'count' ? 'Counted quantity' : 'Quantity'}>
            <input type="number" step="0.01" className="input text-lg" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setAdjust(null)}>Cancel</button>
            <button type="submit" className="btn-primary">Save</button>
          </div>
        </form>
      </Modal>

      <LabelModal open={!!label} onClose={() => setLabel(null)} {...(label || {})} />
    </div>
  );
}
