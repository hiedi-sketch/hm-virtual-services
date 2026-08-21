import { createContext, lazy, Suspense, useCallback, useContext, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { grams, money } from '../../api/print';

// The decoding library is large; keep it out of the initial bundle so the
// iPad loads the shop fast and only pays for it when a scan starts.
const BarcodeScanner = lazy(() => import('./BarcodeScanner'));
import { Field, Pill } from './ui';

const ScanContext = createContext(null);

export const useScanner = () => useContext(ScanContext);

const ACTIONS = {
  filament: [
    { key: 'receive', label: 'Add spools', qtyLabel: 'Spools', defaultQty: 1 },
    { key: 'open', label: 'Mark one opened', qtyLabel: null },
  ],
  filament_spool: [
    { key: 'open', label: 'Mark opened', qtyLabel: null },
    { key: 'count', label: 'Set grams left', qtyLabel: 'Grams remaining', defaultQty: 500 },
    { key: 'consume', label: 'Log grams used', qtyLabel: 'Grams used', defaultQty: 50 },
    { key: 'empty', label: 'Mark empty', qtyLabel: null },
  ],
  material: [
    { key: 'receive', label: 'Receive', qtyLabel: 'Quantity', defaultQty: 1 },
    { key: 'consume', label: 'Use', qtyLabel: 'Quantity', defaultQty: 1 },
    { key: 'count', label: 'Set count', qtyLabel: 'Counted quantity', defaultQty: 0 },
  ],
  item: [
    { key: 'receive', label: 'Add stock', qtyLabel: 'Quantity', defaultQty: 1 },
    { key: 'consume', label: 'Remove stock', qtyLabel: 'Quantity', defaultQty: 1 },
    { key: 'count', label: 'Set count', qtyLabel: 'Counted quantity', defaultQty: 0 },
  ],
};

function ResultCard({ match }) {
  if (match.type === 'filament' || match.type === 'filament_spool') {
    const f = match.filament;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span
            className="w-8 h-8 rounded-full border border-greige shrink-0"
            style={{ background: f.color_hex || '#B0B5BC' }}
          />
          <div>
            <p className="font-bold text-primary leading-tight">{f.color_name}</p>
            <p className="text-xs text-gray-500">{f.brand} · {f.material_type} · {f.spool_size_kg}kg</p>
          </div>
        </div>
        {match.spool && (
          <p className="text-xs text-gray-600">
            Spool <span className="font-mono">{match.spool.spool_code}</span> — {match.spool.status}
            {match.spool.grams_remaining != null && ` · ${grams(match.spool.grams_remaining)} left`}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Pill tone="teal">{f.spools_new} new</Pill>
          <Pill tone="blue">{f.spools_opened} opened</Pill>
          {f.spools_ordered > 0 && <Pill tone="violet">{f.spools_ordered} ordered</Pill>}
          <Pill tone={f.needs_reorder ? 'red' : 'green'}>{grams(f.grams_on_hand)} on hand</Pill>
        </div>
      </div>
    );
  }

  if (match.type === 'material') {
    const m = match.material;
    return (
      <div className="space-y-1">
        <p className="font-bold text-primary leading-tight">{m.name}</p>
        <p className="text-xs text-gray-500">{m.category || 'Material'} · {money(m.unit_cost)} per {m.unit}</p>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={m.needs_reorder ? 'red' : 'green'}>{m.qty_on_hand} on hand</Pill>
          {m.qty_committed > 0 && <Pill tone="amber">{m.qty_committed} needed by queue</Pill>}
        </div>
      </div>
    );
  }

  const i = match.item;
  return (
    <div className="space-y-1">
      <p className="font-bold text-primary leading-tight">{i.name}</p>
      <p className="text-xs text-gray-500 font-mono">{i.sku}</p>
      <div className="flex flex-wrap gap-1.5">
        <Pill tone="gray">{i.item_type}</Pill>
        <Pill tone={i.qty_on_hand <= i.reorder_point ? 'red' : 'green'}>{i.qty_on_hand} on hand</Pill>
        <Pill tone="teal">Cost {money(i.unit_cost)}</Pill>
        <Pill tone="blue">Retail {money(i.retail_price)}</Pill>
      </div>
    </div>
  );
}

/**
 * Wraps the print shop so any page can call `scan()`. With no handler it acts
 * as a stock station: look the code up, then receive / open / count on the spot.
 */
export function ScanProvider({ children, onStockChange }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState({});
  const [match, setMatch] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const handlerRef = useRef(null);

  const scan = useCallback((options = {}) => {
    handlerRef.current = options.onCode || null;
    setConfig(options);
    setMatch(null);
    setOpen(true);
  }, []);

  async function handleCode(code) {
    if (handlerRef.current) {
      const handler = handlerRef.current;
      handlerRef.current = null;
      setOpen(false);
      handler(code);
      return;
    }
    try {
      const found = await printApi.scanLookup(code);
      setMatch(found);
      setQuantity('1');
      setOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'That code is not in the shop yet');
    }
  }

  async function runAction(action) {
    setBusy(true);
    try {
      const { data, message } = await printApi.scanAction({
        code: match.code,
        action: action.key,
        quantity: action.qtyLabel ? Number(quantity) : 1,
      });
      setMatch(data);
      toast.success(message || 'Updated');
      onStockChange?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not update that');
    } finally {
      setBusy(false);
    }
  }

  const value = useMemo(() => ({ scan }), [scan]);
  const actions = match ? ACTIONS[match.type] || [] : [];

  return (
    <ScanContext.Provider value={value}>
      {children}

      {open && (
        <Suspense fallback={null}>
          <BarcodeScanner
            open={open}
            onClose={() => { handlerRef.current = null; setOpen(false); }}
            onScan={handleCode}
            title={config.title || 'Scan a code'}
            hint={config.hint || 'Point the camera at a spool, shelf label or product tag'}
          />
        </Suspense>
      )}

      {match && (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setMatch(null)} />
          <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-linen">
              <h2 className="text-sm font-bold text-primary uppercase tracking-wide">Scanned</h2>
              <button onClick={() => setMatch(null)} className="text-silver hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-4">
              <ResultCard match={match} />

              {actions.some((a) => a.qtyLabel) && (
                <Field label="Quantity">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="input text-lg"
                  />
                </Field>
              )}

              <div className="grid grid-cols-2 gap-2">
                {actions.map((action) => (
                  <button
                    key={action.key}
                    disabled={busy}
                    onClick={() => runAction(action)}
                    className="btn-secondary !py-3"
                  >
                    {action.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setMatch(null); scan(config); }}
                  className="btn-primary flex-1 !py-3"
                >
                  Scan another
                </button>
                <button onClick={() => setMatch(null)} className="btn-ghost">Done</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ScanContext.Provider>
  );
}

export default ScanContext;
