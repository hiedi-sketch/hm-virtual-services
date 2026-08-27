import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../components/Modal';
import printApi, { describeError, grams, money, shortDate } from '../api/print';
import { EmptyState, Field, LabelModal, LoadError, Pill, StatCard, StockBar, StockLegend } from '../components/ui';
import { useScanner } from '../components/ScanContext';
import LocationPicker from '../components/LocationPicker';

const MATERIAL_TYPES = ['PLA', 'PLA+', 'Silk PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon', 'PC', 'Wood Fill', 'Resin'];

const BLANK = {
  color_name: '', brand: '', material_type: 'PLA', color_hex: '#2B7A8B',
  spool_size_kg: 1, cost_per_kg: '', reorder_point_spools: 1,
  vendor_name: '', vendor_url: '', vendor_sku: '', vendor_barcode: '',
  notes: '', initial_spools: 0,
};

export default function Filament() {
  const { refreshKey, refresh } = useOutletContext();
  const { scan } = useScanner();

  const [filaments, setFilaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState(null);
  const [spoolTarget, setSpoolTarget] = useState(null);
  const [spoolForm, setSpoolForm] = useState({ count: 1, status: 'new', expected_at: '', order_reference: '' });
  const [placing, setPlacing] = useState(null);
  const [showRack, setShowRack] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setFilaments(await printApi.filaments());
    } catch (err) {
      const message = describeError(err, 'Could not load the filament library');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  function openNew() {
    setForm(BLANK);
    setEditing('new');
  }

  function openEdit(f) {
    setForm({ ...BLANK, ...f, initial_spools: 0 });
    setEditing(f.id);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        spool_size_kg: Number(form.spool_size_kg) || 1,
        cost_per_kg: Number(form.cost_per_kg) || 0,
        reorder_point_spools: Number(form.reorder_point_spools) || 0,
        initial_spools: Number(form.initial_spools) || 0,
      };
      if (editing === 'new') await printApi.createFilament(payload);
      else await printApi.updateFilament(editing, payload);
      toast.success('Saved');
      setEditing(null);
      load();
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save that filament');
    } finally {
      setSaving(false);
    }
  }

  async function removeFilament(f) {
    if (!window.confirm(`Delete ${f.brand} ${f.color_name}? This cannot be undone.`)) return;
    try {
      await printApi.deleteFilament(f.id);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete that filament');
    }
  }

  async function addSpools(e) {
    e.preventDefault();
    try {
      await printApi.addSpools(spoolTarget.id, {
        ...spoolForm,
        count: Number(spoolForm.count) || 1,
        expected_at: spoolForm.expected_at || null,
      });
      toast.success(spoolForm.status === 'ordered' ? 'Order logged' : 'Spools added');
      setSpoolTarget(null);
      setSpoolForm({ count: 1, status: 'new', expected_at: '', order_reference: '' });
      load();
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not add those spools');
    }
  }

  async function setSpoolStatus(spool, status) {
    try {
      await printApi.updateSpool(spool.id, { status });
      load();
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update that spool');
    }
  }

  async function weighSpool(spool) {
    const value = window.prompt('Grams remaining on this spool?', spool.grams_remaining ?? '');
    if (value === null) return;
    try {
      await printApi.updateSpool(spool.id, { status: 'opened', grams_remaining: Number(value) || 0 });
      load();
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update that spool');
    }
  }

  const totals = filaments.reduce(
    (acc, f) => ({
      spools: acc.spools + f.spools_new + f.spools_opened,
      value: acc.value + f.value_on_hand,
      reorder: acc.reorder + (f.needs_reorder ? 1 : 0),
      committed: acc.committed + f.grams_committed,
    }),
    { spools: 0, value: 0, reorder: 0, committed: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-primary">Filament</h1>
          <p className="text-sm text-gray-500">Every colour you stock, what is left, and what the queue will eat.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => setShowRack(true)}>Where things are</button>
          <button
            className="btn-secondary"
            onClick={() => scan({ title: 'Scan a spool', hint: 'Scan a spool tag to open it, or a shelf label to add stock' })}
          >
            Scan spool
          </button>
          <button className="btn-primary" onClick={openNew}>Add filament</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Colours" value={filaments.length} />
        <StatCard label="Spools on hand" value={totals.spools} />
        <StatCard label="Value on hand" value={money(totals.value)} />
        <StatCard
          label="Need reorder"
          value={totals.reorder}
          tone={totals.reorder ? 'danger' : 'good'}
          sub={totals.committed ? `${grams(totals.committed)} committed to the queue` : 'Queue is clear'}
        />
      </div>

      <div className="card !p-4"><StockLegend /></div>

      {error && !filaments.length ? (
        <LoadError message={error} onRetry={load} what="the filament library" />
      ) : loading ? (
        <div className="card text-center py-12 text-sm text-gray-500">Loading…</div>
      ) : !filaments.length ? (
        <EmptyState
          title="No filament yet"
          action={<button className="btn-primary" onClick={openNew}>Add your first spool</button>}
        >
          Add each colour you keep on the shelf. Spool counts, cost per kilo and reorder alerts all flow from here.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {filaments.map((f) => (
            <div key={f.id} className="card !p-4">
              <div className="flex flex-wrap items-start gap-3">
                <span
                  className="w-10 h-10 rounded-full border border-greige shrink-0"
                  style={{ background: f.color_hex || '#B0B5BC' }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-primary leading-tight">{f.color_name}</p>
                    <Pill tone="gray">{f.material_type}</Pill>
                    {f.needs_reorder && <Pill tone="red">Reorder</Pill>}
                    {f.short_by_grams > 0 && <Pill tone="amber">Short {grams(f.short_by_grams)}</Pill>}
                  </div>
                  <p className="text-xs text-gray-500">
                    {f.brand} · {f.spool_size_kg}kg spools · {money(f.cost_per_kg)}/kg · <span className="font-mono">{f.sku}</span>
                  </p>
                  {f.spools.some((s) => s.location) && (
                    <p className="flex flex-wrap items-center gap-1 mt-1.5">
                      {f.spools.filter((s) => s.location).map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setPlacing({ ...s, label: `${f.brand} ${f.color_name}` })}
                          className={`badge font-mono ${s.location.startsWith('AMS') ? 'bg-primary text-white' : 'bg-linen text-primary'}`}
                          title={`${s.spool_code} — tap to move`}
                        >
                          {s.location}
                        </button>
                      ))}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary leading-tight">{grams(f.grams_on_hand)}</p>
                  <p className="text-[11px] text-gray-500">
                    {f.grams_committed > 0 ? `${grams(f.grams_projected)} after queue` : 'nothing committed'}
                  </p>
                </div>
              </div>

              <div className="mt-3">
                <StockBar
                  newAmount={f.spools_new * f.full_spool_grams}
                  openedAmount={f.grams_on_hand - f.spools_new * f.full_spool_grams}
                  orderedAmount={f.spools_ordered * f.full_spool_grams}
                  committed={f.grams_committed}
                  reorderAt={f.reorder_grams}
                />
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <Pill tone="teal">{f.spools_new} new</Pill>
                <Pill tone="blue">{f.spools_opened} opened</Pill>
                <Pill tone={f.spools_ordered ? 'violet' : 'gray'}>{f.spools_ordered} ordered</Pill>
                {f.spools_empty > 0 && <Pill tone="gray">{f.spools_empty} empty</Pill>}
                <span className="ml-auto flex flex-wrap gap-2">
                  {f.vendor_url && (
                    <a href={f.vendor_url} target="_blank" rel="noreferrer" className="btn-ghost !py-1 !px-2">
                      Reorder{f.vendor_name ? ` · ${f.vendor_name}` : ''} ↗
                    </a>
                  )}
                  <button className="btn-ghost !py-1 !px-2" onClick={() => setSpoolTarget(f)}>Add spools</button>
                  <button
                    className="btn-ghost !py-1 !px-2"
                    onClick={() => setLabel({ title: `${f.brand} ${f.color_name}`, subtitle: `${f.material_type} · ${f.spool_size_kg}kg`, code: f.barcode || f.sku, meta: money(f.cost_per_kg) + '/kg' })}
                  >
                    Label
                  </button>
                  <button className="btn-ghost !py-1 !px-2" onClick={() => setExpanded(expanded === f.id ? null : f.id)}>
                    {expanded === f.id ? 'Hide spools' : `Spools (${f.spools.length})`}
                  </button>
                  <button className="btn-ghost !py-1 !px-2" onClick={() => openEdit(f)}>Edit</button>
                </span>
              </div>

              {expanded === f.id && (
                <div className="mt-3 border-t border-linen pt-3 space-y-2">
                  {!f.spools.length && <p className="text-xs text-gray-500">No spools logged yet.</p>}
                  {f.spools.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono text-gray-600 w-24">{s.spool_code}</span>
                      <button
                        onClick={() => setPlacing({ ...s, label: `${f.brand} ${f.color_name}` })}
                        className={`badge font-mono ${
                          s.location
                            ? s.location.startsWith('AMS') ? 'bg-primary text-white' : 'bg-linen text-primary'
                            : 'bg-white text-silver border border-dashed border-silver'
                        }`}
                      >
                        {s.location || 'no place'}
                      </button>
                      <Pill tone={s.status === 'new' ? 'teal' : s.status === 'opened' ? 'blue' : s.status === 'ordered' ? 'violet' : 'gray'}>
                        {s.status}
                      </Pill>
                      <span className="text-gray-500">
                        {s.status === 'opened' && `${grams(s.grams_remaining ?? f.full_spool_grams)} left`}
                        {s.status === 'ordered' && `due ${shortDate(s.expected_at)}`}
                        {s.status === 'new' && `bought ${shortDate(s.purchased_at)}`}
                        {s.status === 'empty' && `emptied ${shortDate(s.emptied_at)}`}
                      </span>
                      <span className="ml-auto flex gap-1">
                        {s.status === 'ordered' && (
                          <button className="btn-ghost !py-0.5 !px-2" onClick={() => setSpoolStatus(s, 'new')}>Received</button>
                        )}
                        {s.status === 'new' && (
                          <button className="btn-ghost !py-0.5 !px-2" onClick={() => setSpoolStatus(s, 'opened')}>Open</button>
                        )}
                        {s.status === 'opened' && (
                          <>
                            <button className="btn-ghost !py-0.5 !px-2" onClick={() => weighSpool(s)}>Weigh</button>
                            <button className="btn-ghost !py-0.5 !px-2" onClick={() => setSpoolStatus(s, 'empty')}>Empty</button>
                          </>
                        )}
                        <button
                          className="btn-ghost !py-0.5 !px-2"
                          onClick={() => setLabel({ title: `${f.brand} ${f.color_name}`, subtitle: 'Spool tag', code: s.spool_code })}
                        >
                          Tag
                        </button>
                      </span>
                    </div>
                  ))}
                  <div className="pt-2">
                    <button className="btn-ghost !py-1 !px-2 text-red-600" onClick={() => removeFilament(f)}>
                      Delete this filament
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add / edit filament */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add filament' : 'Edit filament'} size="lg">
        <form onSubmit={save} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Color name">
              <input className="input" required value={form.color_name} onChange={(e) => setForm({ ...form, color_name: e.target.value })} />
            </Field>
            <Field label="Brand">
              <input className="input" required value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
            </Field>
            <Field label="Type">
              <input list="filament-types" className="input" value={form.material_type} onChange={(e) => setForm({ ...form, material_type: e.target.value })} />
              <datalist id="filament-types">
                {MATERIAL_TYPES.map((t) => <option key={t} value={t} />)}
              </datalist>
            </Field>
            <Field label="Swatch">
              <input type="color" className="input !p-1 h-[38px]" value={form.color_hex || '#2B7A8B'} onChange={(e) => setForm({ ...form, color_hex: e.target.value })} />
            </Field>
            <Field label="Spool size (kg)">
              <input type="number" step="0.05" className="input" value={form.spool_size_kg} onChange={(e) => setForm({ ...form, spool_size_kg: e.target.value })} />
            </Field>
            <Field label="Current cost per kg">
              <input type="number" step="0.01" className="input" value={form.cost_per_kg} onChange={(e) => setForm({ ...form, cost_per_kg: e.target.value })} />
            </Field>
            <Field label="Reorder when below (spools)" hint="Flags this colour once the queue would take you under this.">
              <input type="number" step="0.25" className="input" value={form.reorder_point_spools} onChange={(e) => setForm({ ...form, reorder_point_spools: e.target.value })} />
            </Field>
            {editing === 'new' && (
              <Field label="Spools on hand now">
                <input type="number" className="input" value={form.initial_spools} onChange={(e) => setForm({ ...form, initial_spools: e.target.value })} />
              </Field>
            )}
            <Field label="Vendor">
              <input className="input" value={form.vendor_name || ''} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} />
            </Field>
            <Field label="Reorder link" hint="Straight to the product page.">
              <input className="input" placeholder="https://" value={form.vendor_url || ''} onChange={(e) => setForm({ ...form, vendor_url: e.target.value })} />
            </Field>
            <Field label="Vendor barcode" hint="Scan the manufacturer label so receiving finds it.">
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
            {editing !== 'new' && (
              <Field label="Our SKU / barcode">
                <input className="input font-mono" value={form.sku || ''} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </Field>
            )}
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

      {/* Add spools */}
      <Modal open={!!spoolTarget} onClose={() => setSpoolTarget(null)} title={spoolTarget ? `Add spools — ${spoolTarget.color_name}` : ''}>
        <form onSubmit={addSpools} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="How many">
              <input type="number" min="1" className="input" value={spoolForm.count} onChange={(e) => setSpoolForm({ ...spoolForm, count: e.target.value })} />
            </Field>
            <Field label="Status">
              <select className="input" value={spoolForm.status} onChange={(e) => setSpoolForm({ ...spoolForm, status: e.target.value })}>
                <option value="new">New — sealed on the shelf</option>
                <option value="opened">Opened — in use</option>
                <option value="ordered">Ordered — on its way</option>
              </select>
            </Field>
            {spoolForm.status === 'ordered' && (
              <>
                <Field label="Expected">
                  <input type="date" className="input" value={spoolForm.expected_at} onChange={(e) => setSpoolForm({ ...spoolForm, expected_at: e.target.value })} />
                </Field>
                <Field label="Order reference">
                  <input className="input" value={spoolForm.order_reference} onChange={(e) => setSpoolForm({ ...spoolForm, order_reference: e.target.value })} />
                </Field>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setSpoolTarget(null)}>Cancel</button>
            <button type="submit" className="btn-primary">Add</button>
          </div>
        </form>
      </Modal>

      <LocationPicker
        open={!!placing || showRack}
        spool={placing}
        onClose={() => { setPlacing(null); setShowRack(false); }}
        onMoved={() => { load(); refresh(); }}
      />

      <LabelModal open={!!label} onClose={() => setLabel(null)} {...(label || {})} />
    </div>
  );
}
