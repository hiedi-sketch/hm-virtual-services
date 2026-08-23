import { useCallback, useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';
import printApi, { describeError, grams, hoursMinutes, money, shortDate } from '../api/print';
import { EmptyState, LoadError, Pill, StatCard } from '../components/ui';
import { useScanner } from '../components/ScanContext';

export default function PrintDashboard() {
  const { refreshKey } = useOutletContext();
  const { scan } = useScanner();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await printApi.dashboard());
    } catch (err) {
      const message = describeError(err, 'Could not load the dashboard');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  if (error && !data) {
    return <LoadError message={error} onRetry={load} what="the dashboard" />;
  }
  if (loading || !data) {
    return <div className="card text-center py-12 text-sm text-gray-500">Loading…</div>;
  }

  const { orders, queue, inventory } = data;
  const reorderCount = inventory.filament_reorder.length + inventory.material_reorder.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-primary">{data.settings.shop_name || 'Print Shop'}</h1>
          <p className="text-sm text-gray-500">Where the shop stands right now.</p>
        </div>
        <button className="btn-secondary" onClick={() => scan()}>Scan something</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Open orders" value={orders.open} sub={`${orders.at_risk.length} past turnaround`} tone={orders.at_risk.length ? 'warn' : 'default'} />
        <StatCard label="Queue" value={`${queue.hours}h`} sub={`clears in ${queue.days} day${queue.days === 1 ? '' : 's'}`} />
        <StatCard label="Needs reordering" value={reorderCount} tone={reorderCount ? 'danger' : 'good'} />
        <StatCard label="Inventory value" value={money(inventory.value)} sub={`${inventory.counts.filaments} colours · ${inventory.counts.products} products`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card !p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-primary text-sm">Shipping next</p>
            <Link to="/orders" className="btn-ghost !py-1 !px-2 text-xs">All orders</Link>
          </div>
          {!orders.next_ships.length ? (
            <p className="text-xs text-gray-500">Nothing in production. Send an order to the queue to see projected ship dates here.</p>
          ) : (
            <div className="space-y-2">
              {orders.next_ships.map((o) => (
                <div key={o.order_id} className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-primary">{o.order_number}</span>
                  <span className="text-gray-500 text-xs truncate">{o.customer_name}</span>
                  <span className="ml-auto text-xs text-gray-500">{shortDate(o.projected_ship_date)}</span>
                  {o.at_risk && <Pill tone="red">{o.late_by_days}d late</Pill>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card !p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-primary text-sm">On the printers</p>
            <Link to="/queue" className="btn-ghost !py-1 !px-2 text-xs">Full queue</Link>
          </div>
          {!queue.next_up.length ? (
            <p className="text-xs text-gray-500">The queue is empty.</p>
          ) : (
            <div className="space-y-2">
              {queue.next_up.map((q) => (
                <div key={q.id} className="flex items-center gap-2 text-sm">
                  <span className="w-6 h-6 rounded bg-linen flex items-center justify-center text-xs font-bold text-primary">{q.sequence}</span>
                  <span className="truncate">{q.quantity} × {q.item_name}</span>
                  <span className="ml-auto text-xs text-gray-500">{hoursMinutes(q.estimated_minutes)}</span>
                  {q.status === 'printing' && <Pill tone="blue">Printing</Pill>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card !p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-primary text-sm">Reorder list</p>
            <div className="flex gap-1">
              <Link to="/filament" className="btn-ghost !py-1 !px-2 text-xs">Filament</Link>
              <Link to="/materials" className="btn-ghost !py-1 !px-2 text-xs">Materials</Link>
            </div>
          </div>
          {!reorderCount && !inventory.low_items.length ? (
            <p className="text-xs text-gray-500">Everything is above its reorder point.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
              {inventory.filament_reorder.map((f) => (
                <div key={`f${f.id}`} className="flex items-center gap-2 text-sm">
                  <span className="w-3 h-3 rounded-full border border-greige shrink-0" style={{ background: f.color_hex || '#B0B5BC' }} />
                  <span className="truncate">{f.brand} {f.color_name}</span>
                  <span className="ml-auto text-xs text-gray-500">{grams(f.grams_projected)} left</span>
                  {f.vendor_url && <a href={f.vendor_url} target="_blank" rel="noreferrer" className="text-xs text-primary font-semibold">Buy ↗</a>}
                </div>
              ))}
              {inventory.material_reorder.map((m) => (
                <div key={`m${m.id}`} className="flex items-center gap-2 text-sm">
                  <span className="truncate">{m.name}</span>
                  <span className="ml-auto text-xs text-gray-500">{m.qty_projected} {m.unit} left</span>
                  {m.vendor_url && <a href={m.vendor_url} target="_blank" rel="noreferrer" className="text-xs text-primary font-semibold">Buy ↗</a>}
                </div>
              ))}
              {inventory.low_items.map((i) => (
                <div key={`i${i.id}`} className="flex items-center gap-2 text-sm">
                  <span className="truncate">{i.name}</span>
                  <span className="ml-auto text-xs text-gray-500">{i.qty_on_hand} on hand</span>
                  <Pill tone="amber">Print more</Pill>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!inventory.counts.filaments && !inventory.counts.products && (
        <EmptyState
          title="Start here"
          action={<Link to="/filament" className="btn-primary">Add your filament</Link>}
        >
          Load the filament library first, then materials, then build catalog items out of them. Costs and prices fall out automatically once those are in.
        </EmptyState>
      )}

      <p className="text-xs text-gray-400 text-center">
        Revenue shipped this month: {money(data.revenue_this_month)} · more dashboard panels to come.
      </p>
    </div>
  );
}
