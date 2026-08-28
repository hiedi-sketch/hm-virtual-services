import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import printApi, { describeError, money } from '../api/print';
import { Field, Pill } from './ui';

/**
 * Load products from a spreadsheet — a shop's export, or a list of your own.
 * Previews first, because a catalog is not somewhere to find out afterwards.
 */
export default function CatalogImport({ open, onClose, onImported }) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [options, setOptions] = useState({ item_type: 'product', category: '' });
  const [plan, setPlan] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setCsv(''); setFileName(''); setPlan(null); setDone(null);
  }

  async function preview(text = csv, next = options) {
    if (!text) return;
    setBusy(true);
    try {
      setPlan(await printApi.previewCatalogImport(text, next));
    } catch (err) {
      setPlan(null);
      toast.error(describeError(err, 'Could not read that file'));
    } finally {
      setBusy(false);
    }
  }

  async function readFile(file) {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsv(text);
    setDone(null);
    preview(text, options);
  }

  function changeOption(patch) {
    const next = { ...options, ...patch };
    setOptions(next);
    if (csv) preview(csv, next);
  }

  async function apply() {
    setBusy(true);
    try {
      const response = await printApi.applyCatalogImport(csv, options);
      setDone(response.data);
      setPlan(null);
      toast.success(response.message);
      onImported?.();
    } catch (err) {
      toast.error(describeError(err, 'Could not import that file'));
    } finally {
      setBusy(false);
    }
  }

  const categories = plan
    ? [...new Set(plan.create.map((c) => c.values.category).filter(Boolean))]
    : [];

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Import products" size="xl">
      <div className="space-y-4">
        {!done && (
          <>
            <p className="text-sm text-gray-600">
              A CSV with a row per product — a Shopify products export works as-is. Everything gets
              a SKU in your own numbering and keeps whatever barcode the file carried. Print times,
              finishing minutes and inventory are left empty for you to fill in.
            </p>

            <div className="grid sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="label">Choose the file</span>
                <input type="file" accept=".csv,text/csv" className="input" onChange={(e) => readFile(e.target.files?.[0])} />
              </label>
              <Field label="Bring them in as">
                <select
                  className="input"
                  value={options.item_type}
                  onChange={(e) => changeOption({ item_type: e.target.value })}
                >
                  <option value="product">Items for sale</option>
                  <option value="component">Parts used in other items</option>
                  <option value="tool">Tools</option>
                </select>
              </Field>
              <Field label="Category" hint="Leave blank to use what the file calls each one.">
                <input
                  className="input"
                  placeholder="from the file"
                  value={options.category}
                  onChange={(e) => changeOption({ category: e.target.value })}
                />
              </Field>
            </div>
            {fileName && <p className="text-xs text-gray-500">Reading <span className="font-mono">{fileName}</span></p>}
          </>
        )}

        {busy && <p className="text-sm text-gray-500">Working through it…</p>}

        {plan && !busy && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Pill tone="green">{plan.create.length} to add</Pill>
              {plan.update.length > 0 && <Pill tone="blue">{plan.update.length} to fill in</Pill>}
              {plan.unchanged.length > 0 && <Pill tone="gray">{plan.unchanged.length} already there</Pill>}
              {plan.skipped.length > 0 && <Pill tone="amber">{plan.skipped.length} skipped</Pill>}
            </div>

            {categories.length > 0 && !options.category && (
              <p className="text-xs text-gray-600">
                Categories from the file: {categories.map((c) => c.length > 40 ? `${c.slice(0, 40)}…` : c).join(' · ')}
              </p>
            )}

            {plan.create.length > 0 && (
              <div className="text-xs max-h-72 overflow-y-auto border border-linen rounded-lg p-3">
                <ul className="space-y-0.5 text-gray-600">
                  {plan.create.map((c) => (
                    <li key={c.line} className="flex flex-wrap gap-2">
                      <span className="text-gray-800">{c.values.name}</span>
                      {c.values.category && <span className="text-gray-400">{c.values.category.slice(0, 24)}</span>}
                      {c.price != null && <span className="ml-auto">{money(c.price)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan.skipped.length > 0 && (
              <ul className="text-xs text-amber-700 space-y-0.5">
                {plan.skipped.map((s) => <li key={s.line}>Line {s.line} {s.label} — {s.reason}</li>)}
              </ul>
            )}

            <div className="flex gap-2 justify-end border-t border-linen pt-3">
              <button className="btn-secondary" onClick={reset} disabled={busy}>Pick another file</button>
              <button
                className="btn-primary"
                onClick={apply}
                disabled={busy || (!plan.create.length && !plan.update.length)}
              >
                {plan.create.length || plan.update.length ? 'Do it' : 'Nothing to do'}
              </button>
            </div>
          </div>
        )}

        {done && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Pill tone="green">{done.created.length} added</Pill>
              {done.updated.length > 0 && <Pill tone="blue">{done.updated.length} filled in</Pill>}
              {done.failed.length > 0 && <Pill tone="red">{done.failed.length} failed</Pill>}
            </div>
            {done.failed.length > 0 && (
              <ul className="text-xs text-red-600 space-y-0.5">
                {done.failed.map((f, i) => <li key={i}>{f.label} — {f.reason}</li>)}
              </ul>
            )}
            <p className="text-xs text-gray-500">
              Each one needs its filament, materials and print time before costing means anything.
              Until then its suggested prices read zero.
            </p>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={reset}>Import another</button>
              <button className="btn-primary" onClick={() => { reset(); onClose(); }}>Done</button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
