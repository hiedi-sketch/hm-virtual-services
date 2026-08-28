import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import printApi, { describeError, money } from '../api/print';
import { Pill } from './ui';

/**
 * Load a filament list from a spreadsheet. Always previews first: seeing what
 * a file will do to the library beats finding out afterwards.
 */
export default function FilamentImport({ open, onClose, onImported }) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState(null);
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);

  function reset() {
    setCsv(''); setFileName(''); setPlan(null); setDone(null);
  }

  async function readFile(file) {
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    setCsv(text);
    setDone(null);
    setBusy(true);
    try {
      setPlan(await printApi.previewFilamentImport(text));
    } catch (err) {
      setPlan(null);
      toast.error(describeError(err, 'Could not read that file'));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    try {
      const response = await printApi.applyFilamentImport(csv);
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

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Import a filament list"
      size="lg"
    >
      <div className="space-y-4">
        {!done && (
          <>
            <p className="text-sm text-gray-600">
              A CSV with a row per colour. Colours already in the library have their swatch and
              cost brought up to date and any blank fields filled in — anything you have already
              set by hand stays as it is. Spool counts are only used if the file has them, so
              leaving that column empty keeps your inventory untouched.
            </p>

            <label className="block">
              <span className="label">Choose the file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="input"
                onChange={(e) => readFile(e.target.files?.[0])}
              />
            </label>
            {fileName && <p className="text-xs text-gray-500">Reading <span className="font-mono">{fileName}</span></p>}
          </>
        )}

        {busy && <p className="text-sm text-gray-500">Working through it…</p>}

        {plan && !busy && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Pill tone="green">{plan.create.length} to add</Pill>
              <Pill tone="blue">{plan.update.length} to update</Pill>
              {plan.unchanged.length > 0 && <Pill tone="gray">{plan.unchanged.length} already right</Pill>}
              {plan.skipped.length > 0 && <Pill tone="amber">{plan.skipped.length} skipped</Pill>}
            </div>

            {plan.unmapped.length > 0 && (
              <p className="text-xs text-amber-700">
                Columns not used: {plan.unmapped.join(', ')}
              </p>
            )}

            {plan.update.length > 0 && (
              <div className="text-xs">
                <p className="font-semibold text-primary mb-1">Updating</p>
                <ul className="space-y-0.5 text-gray-600">
                  {plan.update.map((u) => (
                    <li key={u.id}>
                      {u.label} — {u.changes.map((c) => `${c.label} ${c.from ?? 'blank'} → ${c.to}`).join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan.create.length > 0 && (
              <div className="text-xs">
                <p className="font-semibold text-primary mb-1">Adding</p>
                <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600">
                  {plan.create.map((c) => (
                    <li key={c.line} className="flex items-center gap-1.5">
                      <span
                        className="w-3 h-3 rounded-full border border-greige shrink-0"
                        style={{ background: c.values.color_hex }}
                      />
                      {c.values.color_name}
                      <span className="text-gray-400">{money(c.values.cost_per_kg)}/kg</span>
                      {c.spools > 0 && <span className="text-gray-400">· {c.spools} spool{c.spools === 1 ? '' : 's'}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan.skipped.length > 0 && (
              <div className="text-xs">
                <p className="font-semibold text-amber-700 mb-1">Skipped</p>
                <ul className="space-y-0.5 text-gray-600">
                  {plan.skipped.map((s) => <li key={s.line}>Line {s.line} {s.label} — {s.reason}</li>)}
                </ul>
              </div>
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
              <Pill tone="blue">{done.updated.length} updated</Pill>
              {done.unchanged > 0 && <Pill tone="gray">{done.unchanged} already right</Pill>}
              {done.failed.length > 0 && <Pill tone="red">{done.failed.length} failed</Pill>}
            </div>
            {done.failed.length > 0 && (
              <ul className="text-xs text-red-600 space-y-0.5">
                {done.failed.map((f, i) => <li key={i}>{f.label} — {f.reason}</li>)}
              </ul>
            )}
            <p className="text-xs text-gray-500">
              Nothing was given a spool count it did not ask for — set your inventory from the
              Filament tab or by scanning.
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
