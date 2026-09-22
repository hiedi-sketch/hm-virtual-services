import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import printApi, { describeError, shortDate } from '../api/print';
import { EmptyState, LoadError, Pill, StatCard } from '../components/ui';
import QueueSheet from '../components/QueueSheet';
import Barcode from '../components/Barcode';
import { useScanner } from '../components/ScanContext';

/**
 * Everything ordered that still has to be printed, by product.
 *
 * The orders page answers "what do I owe this customer". This answers the
 * other question, the one asked standing at the printer: "what do I owe
 * everybody, and what goes on the next plate". One row per product, however
 * many orders asked for it.
 */
/**
 * Every date this product is wanted on, and how many for each.
 *
 * One product ordered by four customers for four different days is four days
 * of work, not one — so a single "due" date hides the shape of the week. A
 * date the shelf already covers is shown greyed rather than dropped, because
 * "all the dates" means all of them.
 */
function DueDates({ due }) {
  if (!due?.length) return null;

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-2">
      <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Due</span>
      {due.map((day) => (
        <span
          key={day.date || 'none'}
          className={`text-xs ${day.to_print > 0 ? 'text-primary' : 'text-gray-400'}`}
          title={day.to_print < day.ordered
            ? `${day.ordered} ordered, ${day.ordered - day.to_print} coming off the shelf`
            : `${day.ordered} ordered across ${day.order_count} order(s)`}
        >
          {day.date ? shortDate(day.date) : 'No date'}
          <span className="font-bold ml-1">({day.to_print > 0 ? day.to_print : day.ordered})</span>
          {day.to_print === 0 && <span className="text-[10px] ml-0.5">stock</span>}
        </span>
      ))}
    </div>
  );
}

export default function InQueue() {
  const { refreshKey, refresh } = useOutletContext();
  const { scan } = useScanner();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [shopName, setShopName] = useState('Print Shop');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await printApi.inQueue());
    } catch (err) {
      setError(describeError(err, 'Could not work out what is in the queue'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    printApi.getSettings().then((s) => setShopName(s.shop_name || 'Print Shop')).catch(() => {});
  }, []);

  const rows = data ? (showAll ? data.items : data.needing) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-primary">In Queue</h1>
          <p className="text-sm text-gray-500">
            Everything ordered that still has to be printed, gathered by product.
          </p>
        </div>
        <div className="flex gap-2">
          {data?.needing.length > 0 && (
            <button className="btn-secondary" onClick={() => setSheet(true)}>
              Print list ({data.needing.length})
            </button>
          )}
          <button
            className="btn-primary"
            onClick={() => scan({ title: 'Scan a product to print', hint: 'Its barcode on the In Queue list, the shelf, or an order ticket' })}
          >
            Scan a product
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="To print"
          value={data?.units_to_print ?? '—'}
          sub={`${data?.product_count ?? 0} product${data?.product_count === 1 ? '' : 's'}`}
        />
        <StatCard
          label="Pull from stock"
          value={data?.units_from_stock ?? '—'}
          tone="good"
          sub="already made, no printing needed"
        />
        <StatCard
          label="Due soonest"
          value={rows[0]?.earliest_due ? shortDate(rows[0].earliest_due) : '—'}
          sub={rows[0]?.name || 'nothing waiting'}
        />
        <StatCard
          label="Lines with no product"
          value={data?.unmatched_lines ?? 0}
          tone={data?.unmatched_lines ? 'warn' : 'good'}
          sub={data?.unmatched_lines ? 'match them from the order' : 'all lines matched'}
        />
      </div>

      {data && data.items.length > data.needing.length && (
        <div className="card !p-3 flex flex-wrap gap-1">
          <button
            onClick={() => setShowAll(false)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${!showAll ? 'bg-primary text-white' : 'text-primary hover:bg-linen'}`}
          >
            Needs printing
            <span className="ml-1.5 text-xs opacity-60">{data.needing.length}</span>
          </button>
          <button
            onClick={() => setShowAll(true)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${showAll ? 'bg-primary text-white' : 'text-primary hover:bg-linen'}`}
          >
            Everything ordered
            <span className="ml-1.5 text-xs opacity-60">{data.items.length}</span>
          </button>
        </div>
      )}

      {error && !data ? (
        <LoadError message={error} onRetry={load} what="the queue" />
      ) : loading && !data ? (
        <div className="card text-center py-12 text-sm text-gray-500">Loading…</div>
      ) : !rows.length ? (
        <EmptyState title={showAll ? 'Nothing is on order' : 'Nothing needs printing'}>
          {showAll
            ? 'Every order has shipped or been finished off. The queue fills up as orders come in.'
            : 'Everything on order is covered by what is on the shelf or already on a printer — those lines are picked, not printed.'}
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.id} className={`card !p-4 ${row.to_print > 0 ? '' : 'opacity-70'}`}>
              <div className="flex flex-wrap items-start gap-3">
                {row.image_url && (
                  <img src={row.image_url} alt="" className="w-14 h-14 rounded-lg object-cover border border-greige shrink-0" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="font-bold text-primary leading-tight">{row.name}</p>
                  <p className="text-xs text-gray-500 font-mono">{row.sku}</p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <Pill tone="gray">{row.ordered} ordered</Pill>
                    {row.from_stock > 0 && <Pill tone="teal">{row.from_stock} from stock</Pill>}
                    <Pill tone={row.on_hand > 0 ? 'green' : 'gray'}>{row.on_hand} on hand</Pill>
                    {row.printing > 0 && <Pill tone="amber">{row.printing} printing</Pill>}
                    <Pill tone="blue">{row.order_count} order{row.order_count === 1 ? '' : 's'}</Pill>
                  </div>

                  <DueDates due={row.due} />
                </div>

                <div className="text-right shrink-0">
                  <p className={`text-3xl font-bold leading-none ${row.to_print > 0 ? 'text-primary' : 'text-gray-400'}`}>
                    {row.to_print}
                  </p>
                  <p className="text-[11px] text-gray-500">to print</p>
                </div>

                {/* The same code as on the printed list and the shelf label, so
                    it can be scanned off the screen when the sheet is elsewhere. */}
                {(row.barcode || row.sku) && (
                  <div className="shrink-0 hidden sm:block">
                    <Barcode value={row.barcode || row.sku} height={34} moduleWidth={1.3} showText={false} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <QueueSheet
        open={sheet}
        rows={data?.needing || []}
        summary={data}
        shopName={shopName}
        onClose={() => { setSheet(false); refresh(); }}
      />
    </div>
  );
}
