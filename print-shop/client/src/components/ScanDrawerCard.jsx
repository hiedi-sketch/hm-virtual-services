import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { describeError } from '../api/print';
import { useScanner } from './ScanContext';
import { Pill } from './ui';

/**
 * An inventory drawer scanned on its own: what is kept in it, and filling it.
 *
 * The question a drawer label answers is "what is in here, and how many" — read
 * off the front with the scanner instead of opening it. But standing at an open
 * drawer with something in her hand is also the moment she decides what lives
 * there, and the sheet used to be a dead end: it could only be read, and filing
 * meant going to the Catalog, finding the product and picking the drawer from a
 * list, which is the long way round to say "this goes here".
 *
 * So it has both. Scan what is in her hand, or find it by name when the label
 * has come off, and take out what has moved on.
 *
 * A product lives in one drawer, so filing it here takes it out of wherever it
 * was. That is worth saying rather than doing quietly.
 */
export default function ScanDrawerCard({ drawer, onChanged }) {
  // The drawer as it now stands. Every filing answers with the whole drawer, so
  // the list redraws from what the server said rather than from a guess.
  const [rack, setRack] = useState(drawer);
  const [busy, setBusy] = useState(false);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState([]);
  const [searching, setSearching] = useState(false);
  const { scan } = useScanner();
  const box = useRef(null);

  useEffect(() => { setRack(drawer); }, [drawer]);
  useEffect(() => { if (finding) box.current?.focus(); }, [finding]);

  // Products matching what she has typed. A short pause so a name typed at
  // speed is one lookup rather than one per letter.
  useEffect(() => {
    const text = query.trim();
    if (!finding || text.length < 2) { setFound([]); return undefined; }
    let live = true;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const items = await printApi.catalog({ q: text, item_type: 'product', active: '1' });
        if (live) setFound(items.slice(0, 8));
      } catch {
        if (live) setFound([]);
      } finally {
        if (live) setSearching(false);
      }
    }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [query, finding]);

  async function run(work, fallback) {
    setBusy(true);
    try {
      const { drawer: next, message } = await work();
      setRack(next);
      toast.success(message);
      await onChanged?.();
    } catch (err) {
      toast.error(describeError(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  const file = (body) => run(() => printApi.fileInDrawer(rack.code, body), 'Could not file that here');
  const take = (item) => run(() => printApi.takeFromDrawer(rack.code, item.id), 'Could not take that out');

  /** Scan what is in her hand straight into the drawer in front of her. */
  function scanIn() {
    scan({
      title: `Scan into ${rack.code}`,
      hint: 'The barcode on the product label',
      keepMatch: true,
      onCode: (code) => file({ code }),
    });
  }

  function pick(item) {
    setFinding(false);
    setQuery('');
    setFound([]);
    return file({ item_id: item.id });
  }

  const items = rack.items || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-bold text-primary leading-tight text-lg font-mono">{rack.code}</p>
        <Pill tone="gray">Drawer</Pill>
        <Pill tone={items.length ? 'teal' : 'gray'}>
          {items.length ? `${rack.units} in it` : 'Empty'}
        </Pill>
      </div>

      {!items.length ? (
        <p className="text-sm text-gray-500">
          Nothing kept in this one yet. Scan a product or find it by name to put it here.
        </p>
      ) : (
        <ul className="text-sm border-t border-linen divide-y divide-linen">
          {items.map((item) => (
            <li key={item.id} className="py-2 flex items-center gap-2.5">
              {item.image_url && (
                <img src={item.image_url} alt="" className="w-9 h-9 rounded-lg object-cover border border-greige shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight truncate">{item.name}</p>
                <p className="text-xs text-gray-500 font-mono truncate">{item.sku}</p>
              </div>
              <span className="text-lg font-bold text-primary shrink-0">{item.qty_on_hand}</span>
              {/* Out of the drawer, not out of the shop: it keeps its stock and
                  simply has no home until she gives it one. */}
              <button
                type="button"
                disabled={busy}
                onClick={() => take(item)}
                title={`Take ${item.name} out of ${rack.code}`}
                className="text-silver hover:text-red-600 px-1 text-xl leading-none shrink-0 disabled:opacity-40"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Putting something in. Scanning is the fast way when the label is on
          the thing; finding it by name is for when it is not. */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button className="btn-primary !py-1.5 !px-3 text-sm" disabled={busy} onClick={scanIn}>
          Scan a product in
        </button>
        <button
          className="btn-secondary !py-1.5 !px-3 text-sm"
          disabled={busy}
          onClick={() => setFinding((on) => !on)}
        >
          {finding ? 'Cancel' : 'Find by name'}
        </button>
      </div>

      {finding && (
        <div>
          <input
            ref={box}
            className="input"
            placeholder="Type a product name or SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim().length < 2 ? (
            <p className="text-xs text-gray-400 mt-1.5">Two letters or more.</p>
          ) : searching ? (
            <p className="text-xs text-gray-400 mt-1.5">Looking…</p>
          ) : !found.length ? (
            <p className="text-xs text-gray-400 mt-1.5">Nothing in the catalog matches that.</p>
          ) : (
            <ul className="mt-1.5 border border-linen rounded-xl divide-y divide-linen overflow-hidden">
              {found.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => pick(item)}
                    className="w-full text-left px-3 py-2 hover:bg-linen transition-colors flex items-center gap-2 disabled:opacity-40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-sm leading-tight truncate">{item.name}</span>
                      <span className="block text-xs text-gray-500 font-mono truncate">{item.sku}</span>
                    </span>
                    {/* Where it lives now, so moving one is a decision rather
                        than a surprise. */}
                    {item.drawer && item.drawer !== rack.code && (
                      <Pill tone="amber">in {item.drawer}</Pill>
                    )}
                    {item.drawer === rack.code && <Pill tone="gray">already here</Pill>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
