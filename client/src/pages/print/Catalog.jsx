import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../../components/common/Modal';
import printApi, { hoursMinutes, money } from '../../api/print';
import { EmptyState, Field, LabelModal, Pill, StatCard } from '../../components/print/ui';
import { useScanner } from '../../components/print/ScanContext';

const TYPES = [
  { key: '', label: 'Everything' },
  { key: 'product', label: 'For sale' },
  { key: 'component', label: 'Used in products' },
  { key: 'tool', label: 'Tools' },
];

const TYPE_TONE = { product: 'green', component: 'blue', tool: 'violet' };
const TYPE_LABEL = { product: 'For sale', component: 'Component', tool: 'Tool' };

const BLANK = {
  name: '', item_type: 'product', category: '', description: '',
  print_time_minutes: '', units_per_print: 1, labor_minutes: '',
  qty_on_hand: 0, reorder_point: 0, purchase_cost: '',
  cost_override: '', wholesale_override: '', retail_override: '',
  vendor_name: '', vendor_url: '', sku: '', barcode: '', notes: '',
  components: [],
};

const QTY_UNIT = { filament: 'grams', material: 'units', item: 'each' };

export default function Catalog() {
  const { refreshKey, refresh } = useOutletContext();
  const { scan } = useScanner();

  const [items, setItems] = useState([]);
  const [options, setOptions] = useState({ filaments: [], materials: [], items: [] });
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState(null);
  const [adjust, setAdjust] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ mode: 'receive', quantity: 1 });
  const previewTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, opts] = await Promise.all([printApi.catalog(), printApi.catalogOptions()]);
      setItems(list);
      setOptions(opts);
    } catch {
      toast.error('Could not load the catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Cost and suggested prices come back from the server as the form changes,
  // so the editor never disagrees with what gets saved.
  useEffect(() => {
    if (!editing) return undefined;
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      printApi.previewItem({ ...form, id: editing === 'new' ? null : editing })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(previewTimer.current);
  }, [form, editing]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (typeFilter && i.item_type !== typeFilter) return false;
      if (!q) return true;
      return [i.name, i.sku, i.category, i.barcode].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [items, typeFilter, search]);

  function openNew() {
    setForm(BLANK);
    setPreview(null);
    setEditing('new');
  }

  async function openEdit(item) {
    try {
      const full = await printApi.item(item.id);
      setForm({
        ...BLANK,
        ...full,
        print_time_minutes: full.print_time_minutes ?? '',
        labor_minutes: full.labor_minutes ?? '',
        purchase_cost: full.purchase_cost ?? '',
        cost_override: full.cost_override ?? '',
        wholesale_override: full.wholesale_override ?? '',
        retail_override: full.retail_override ?? '',
        components: (full.components || []).map((c) => ({
          component_type: c.component_type, ref_id: c.ref_id, quantity: c.quantity,
        })),
      });
      setEditing(item.id);
    } catch {
      toast.error('Could not open that item');
    }
  }

  function addComponent(type) {
    const pool = type === 'filament' ? options.filaments : type === 'material' ? options.materials : options.items;
    const first = pool.find((o) => o.id !== editing);
    if (!first) {
      toast.error(`Add something to the ${type === 'filament' ? 'filament library' : type === 'material' ? 'materials tab' : 'catalog'} first`);
      return;
    }
    setForm((f) => ({
      ...f,
      components: [...f.components, { component_type: type, ref_id: first.id, quantity: type === 'filament' ? 25 : 1 }],
    }));
  }

  function updateComponent(index, patch) {
    setForm((f) => ({
      ...f,
      components: f.components.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    }));
  }

  function removeComponent(index) {
    setForm((f) => ({ ...f, components: f.components.filter((_, i) => i !== index) }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    const blankToNull = (v) => (v === '' || v == null ? null : Number(v));
    try {
      const payload = {
        ...form,
        print_time_minutes: Number(form.print_time_minutes) || 0,
        units_per_print: Number(form.units_per_print) || 1,
        labor_minutes: blankToNull(form.labor_minutes),
        qty_on_hand: Number(form.qty_on_hand) || 0,
        reorder_point: Number(form.reorder_point) || 0,
        purchase_cost: blankToNull(form.purchase_cost),
        cost_override: blankToNull(form.cost_override),
        wholesale_override: blankToNull(form.wholesale_override),
        retail_override: blankToNull(form.retail_override),
      };
      if (editing === 'new') delete payload.sku;
      const saved = editing === 'new'
        ? await printApi.createItem(payload)
        : await printApi.updateItem(editing, payload);
      toast.success(`${saved.name} saved — ${saved.sku}`);
      setEditing(null);
      load();
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save that item');
    } finally {
      setSaving(false);
    }
  }

  async function remove(item) {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try {
      await printApi.deleteItem(item.id);
      toast.success('Deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete that item');
    }
  }

  async function runAdjust(e) {
    e.preventDefault();
    try {
      await printApi.adjustItem(adjust.id, { ...adjustForm, quantity: Number(adjustForm.quantity) || 0 });
      toast.success('Stock updated');
      setAdjust(null);
      load();
      refresh();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not adjust that');
    }
  }

  const products = items.filter((i) => i.item_type === 'product');
  const stockValue = items.reduce((sum, i) => sum + (i.qty_on_hand || 0) * i.unit_cost, 0);
  const lowStock = products.filter((i) => (i.qty_on_hand || 0) <= (i.reorder_point || 0)).length;
  const breakdown = preview?.cost_breakdown;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-primary">Catalog</h1>
          <p className="text-sm text-gray-500">Products, the parts that go into them, and the tools you use to make them.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => scan({ title: 'Scan a product' })}>Scan</button>
          <button className="btn-primary" onClick={openNew}>Add item</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Items" value={items.length} sub={`${products.length} for sale`} />
        <StatCard label="Finished stock value" value={money(stockValue)} />
        <StatCard label="Low on stock" value={lowStock} tone={lowStock ? 'warn' : 'good'} />
        <StatCard
          label="Avg retail margin"
          value={products.length
            ? `${Math.round(products.reduce((s, i) => s + i.retail_margin_percent, 0) / products.length)}%`
            : '—'}
        />
      </div>

      <div className="card !p-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 flex-wrap">
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                typeFilter === t.key ? 'bg-primary text-white' : 'text-primary hover:bg-linen'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          className="input sm:max-w-xs sm:ml-auto"
          placeholder="Search name, SKU or category"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="card text-center py-12 text-sm text-gray-500">Loading…</div>
      ) : !visible.length ? (
        <EmptyState
          title={items.length ? 'Nothing matches that' : 'The catalog is empty'}
          action={<button className="btn-primary" onClick={openNew}>Add an item</button>}
        >
          Add an item, pick what it is made of from your filament and materials, and the cost, wholesale and retail prices come out the other side.
        </EmptyState>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((i) => (
            <div key={i.id} className="card !p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-primary leading-tight">{i.name}</p>
                    <Pill tone={TYPE_TONE[i.item_type]}>{TYPE_LABEL[i.item_type]}</Pill>
                    {i.item_type === 'product' && i.qty_on_hand <= i.reorder_point && <Pill tone="red">Low</Pill>}
                  </div>
                  <p className="text-xs text-gray-500">
                    <span className="font-mono">{i.sku}</span>
                    {i.category && ` · ${i.category}`}
                    {i.print_time_minutes > 0 && ` · ${hoursMinutes(i.cost_breakdown.print_minutes_per_unit)} print`}
                    {i.cost_breakdown.total_grams > 0 && ` · ${Math.round(i.cost_breakdown.total_grams)}g`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-primary leading-tight">{i.qty_on_hand}</p>
                  <p className="text-[11px] text-gray-500">on hand</p>
                </div>
              </div>

              {i.item_type === 'tool' ? (
                <div className="mt-3 bg-linen rounded-lg py-2 text-center">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">What it cost</p>
                  <p className="font-bold text-gray-800">{money(i.purchase_cost || i.unit_cost)}</p>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-linen rounded-lg py-2">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">Cost</p>
                    <p className="font-bold text-gray-800">{money(i.unit_cost)}</p>
                  </div>
                  <div className="bg-linen rounded-lg py-2">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">Wholesale</p>
                    <p className="font-bold text-primary">{money(i.wholesale_price)}</p>
                    <p className="text-[10px] text-gray-500">{i.wholesale_margin_percent}% margin</p>
                  </div>
                  <div className="bg-primary/5 rounded-lg py-2">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">Retail</p>
                    <p className="font-bold text-primary">{money(i.retail_price)}</p>
                    <p className="text-[10px] text-gray-500">{i.retail_margin_percent}% margin</p>
                  </div>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <button className="btn-ghost !py-1 !px-2" onClick={() => { setAdjust(i); setAdjustForm({ mode: 'receive', quantity: 1 }); }}>Adjust stock</button>
                <button
                  className="btn-ghost !py-1 !px-2"
                  onClick={() => setLabel({ title: i.name, subtitle: TYPE_LABEL[i.item_type], code: i.barcode || i.sku, meta: i.item_type === 'tool' ? null : money(i.retail_price) })}
                >
                  Label
                </button>
                <button className="btn-ghost !py-1 !px-2" onClick={() => openEdit(i)}>Edit</button>
                <button className="btn-ghost !py-1 !px-2 text-red-600 ml-auto" onClick={() => remove(i)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Item editor */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add item' : 'Edit item'} size="xl">
        <form onSubmit={save} className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Name" className="sm:col-span-2">
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="What is it?">
              <select className="input" value={form.item_type} onChange={(e) => setForm({ ...form, item_type: e.target.value })}>
                <option value="product">An item for sale</option>
                <option value="component">A part used to make another item</option>
                <option value="tool">A tool</option>
              </select>
            </Field>
            <Field label="Category">
              <input className="input" value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
          </div>

          {form.item_type === 'tool' ? (
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="What it cost">
                <input type="number" step="0.01" className="input" value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })} />
              </Field>
              <Field label="On hand">
                <input type="number" className="input" value={form.qty_on_hand} onChange={(e) => setForm({ ...form, qty_on_hand: e.target.value })} />
              </Field>
              <Field label="Vendor link">
                <input className="input" placeholder="https://" value={form.vendor_url || ''} onChange={(e) => setForm({ ...form, vendor_url: e.target.value })} />
              </Field>
            </div>
          ) : (
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Print time (minutes)" hint="Whole plate, not per unit.">
                <input type="number" step="1" className="input" value={form.print_time_minutes} onChange={(e) => setForm({ ...form, print_time_minutes: e.target.value })} />
              </Field>
              <Field label="Units per print" hint="How many come off that plate.">
                <input type="number" step="1" min="1" className="input" value={form.units_per_print} onChange={(e) => setForm({ ...form, units_per_print: e.target.value })} />
              </Field>
              <Field label="Finishing minutes" hint="Leave blank to use the shop default.">
                <input type="number" step="1" className="input" value={form.labor_minutes} onChange={(e) => setForm({ ...form, labor_minutes: e.target.value })} />
              </Field>
              <Field label="Inventory on hand">
                <input type="number" step="1" className="input" value={form.qty_on_hand} onChange={(e) => setForm({ ...form, qty_on_hand: e.target.value })} />
              </Field>
              <Field label="Reorder point">
                <input type="number" step="1" className="input" value={form.reorder_point} onChange={(e) => setForm({ ...form, reorder_point: e.target.value })} />
              </Field>
              <Field label="Bought-in cost" hint="Only if you also buy this ready-made.">
                <input type="number" step="0.01" className="input" value={form.purchase_cost} onChange={(e) => setForm({ ...form, purchase_cost: e.target.value })} />
              </Field>
            </div>
          )}

          {/* Bill of materials */}
          <div className="border border-linen rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold text-primary text-sm">Made from</p>
              <div className="flex gap-1.5">
                <button type="button" className="btn-secondary !py-1 !px-2 text-xs" onClick={() => addComponent('filament')}>+ Filament</button>
                <button type="button" className="btn-secondary !py-1 !px-2 text-xs" onClick={() => addComponent('material')}>+ Material</button>
                <button type="button" className="btn-secondary !py-1 !px-2 text-xs" onClick={() => addComponent('item')}>+ Item</button>
              </div>
            </div>

            {!form.components.length && (
              <p className="text-xs text-gray-500">
                Nothing added yet. Pick filament from your library, materials from the materials tab, or another catalog item as a sub-assembly.
              </p>
            )}

            {form.components.map((c, index) => {
              const pool = c.component_type === 'filament' ? options.filaments
                : c.component_type === 'material' ? options.materials : options.items;
              const chosen = pool.find((o) => o.id === Number(c.ref_id));
              return (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 sm:col-span-6">
                    <label className="label">{c.component_type === 'filament' ? 'Filament' : c.component_type === 'material' ? 'Material' : 'Item'}</label>
                    <select
                      className="input"
                      value={c.ref_id}
                      onChange={(e) => updateComponent(index, { ref_id: Number(e.target.value) })}
                    >
                      {pool.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-7 sm:col-span-4">
                    <label className="label">
                      Quantity ({c.component_type === 'material' ? (chosen?.unit || 'units') : QTY_UNIT[c.component_type]})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="input"
                      value={c.quantity}
                      onChange={(e) => updateComponent(index, { quantity: e.target.value })}
                    />
                  </div>
                  <div className="col-span-5 sm:col-span-2 flex justify-end">
                    <button type="button" className="btn-ghost text-red-600 !px-2" onClick={() => removeComponent(index)}>Remove</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live costing */}
          <div className={`bg-linen rounded-xl p-4 space-y-3 ${form.item_type === 'tool' ? 'hidden' : ''}`}>
            <p className="font-bold text-primary text-sm">Cost &amp; price</p>
            {!preview ? (
              <p className="text-xs text-gray-500">Working it out…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div><p className="text-gray-500">Filament</p><p className="font-semibold">{money(breakdown.filament_cost)}</p></div>
                  <div><p className="text-gray-500">Materials</p><p className="font-semibold">{money(breakdown.material_cost)}</p></div>
                  <div><p className="text-gray-500">Sub-items</p><p className="font-semibold">{money(breakdown.sub_item_cost)}</p></div>
                  <div><p className="text-gray-500">Machine time</p><p className="font-semibold">{money(breakdown.machine_cost)}</p></div>
                  <div><p className="text-gray-500">Labor</p><p className="font-semibold">{money(breakdown.labor_cost)}</p></div>
                  <div><p className="text-gray-500">Packaging</p><p className="font-semibold">{money(breakdown.packaging_cost)}</p></div>
                  <div><p className="text-gray-500">Failure allowance</p><p className="font-semibold">{money(breakdown.failure_allowance)}</p></div>
                  <div><p className="text-gray-500">Overhead</p><p className="font-semibold">{money(breakdown.overhead)}</p></div>
                </div>
                {breakdown.circular && (
                  <p className="text-xs text-red-600">One of these sub-items refers back to this one — that loop is ignored in the cost.</p>
                )}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white rounded-lg py-2">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">Unit cost</p>
                    <p className="font-bold text-gray-800">{money(preview.unit_cost)}</p>
                  </div>
                  <div className="bg-white rounded-lg py-2">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">Suggested wholesale</p>
                    <p className="font-bold text-primary">{money(preview.suggested_wholesale)}</p>
                  </div>
                  <div className="bg-white rounded-lg py-2">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">Suggested retail</p>
                    <p className="font-bold text-primary">{money(preview.suggested_retail)}</p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-500">
                  {hoursMinutes(breakdown.print_minutes_per_unit)} of print time and {Math.round(breakdown.total_grams)}g of filament per unit.
                  Markups live in Settings.
                </p>
              </>
            )}

            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Override cost" hint="Leave blank to use the calculation.">
                <input type="number" step="0.01" className="input" value={form.cost_override} onChange={(e) => setForm({ ...form, cost_override: e.target.value })} />
              </Field>
              <Field label="Override wholesale">
                <input type="number" step="0.01" className="input" value={form.wholesale_override} onChange={(e) => setForm({ ...form, wholesale_override: e.target.value })} />
              </Field>
              <Field label="Override retail">
                <input type="number" step="0.01" className="input" value={form.retail_override} onChange={(e) => setForm({ ...form, retail_override: e.target.value })} />
              </Field>
            </div>
          </div>

          {editing !== 'new' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="SKU">
                <input className="input font-mono" value={form.sku || ''} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </Field>
              <Field label="Barcode" hint="Defaults to the SKU. Printed as Code 128.">
                <input className="input font-mono" value={form.barcode || ''} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
              </Field>
            </div>
          )}

          <Field label="Description">
            <textarea className="input" rows={2} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save item'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!adjust} onClose={() => setAdjust(null)} title={adjust ? `Adjust — ${adjust.name}` : ''}>
        <form onSubmit={runAdjust} className="space-y-4">
          <Field label="What happened">
            <select className="input" value={adjustForm.mode} onChange={(e) => setAdjustForm({ ...adjustForm, mode: e.target.value })}>
              <option value="receive">Finished more</option>
              <option value="consume">Sold or used some</option>
              <option value="count">Counted the shelf</option>
            </select>
          </Field>
          <Field label={adjustForm.mode === 'count' ? 'Counted quantity' : 'Quantity'}>
            <input type="number" step="1" className="input text-lg" value={adjustForm.quantity} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })} />
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
