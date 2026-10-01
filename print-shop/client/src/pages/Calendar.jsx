import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import printApi, { describeError, shortDate } from '../api/print';
import { LoadError, Pill, StatCard } from '../components/ui';
import CalendarSheet from '../components/CalendarSheet';

/**
 * What is due, and when — the next fortnight of promises.
 *
 * Nothing on it is stored. It is read fresh on every visit, whenever anything
 * in the shop changes, and on a slow tick besides, so a sheet pinned up this
 * morning and the screen this afternoon disagree only by the time between
 * looking. An order that ships is off it.
 */
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayName = (iso) => WEEKDAY[new Date(`${iso}T00:00:00`).getDay()];

/** Enough to tell one platform from another at a glance. */
const CHANNEL_TONE = {
  shopify: 'green', etsy: 'amber', faire: 'violet', tiktok: 'red', amazon: 'blue',
};
const toneFor = (channel) => CHANNEL_TONE[String(channel || '').toLowerCase()] || 'gray';

function OrderLine({ order, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(order)}
      className="w-full text-left text-xs leading-tight hover:bg-linen rounded px-1 py-0.5"
    >
      <span className="flex items-baseline gap-1.5">
        <span className="font-bold text-primary tabular-nums">{order.order_number}</span>
        <span className="tabular-nums text-gray-500">({order.units})</span>
      </span>
      {/* Its own line, and no truncation: a narrow cell must not hide where an
          order came from. This is what she reads the calendar for. */}
      <span className="block text-[10px] uppercase tracking-wide text-gray-500 break-words">
        {order.channel || 'unknown'}
      </span>
    </button>
  );
}

export default function Calendar() {
  const { refreshKey } = useOutletContext();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [sheet, setSheet] = useState(false);
  const [shopName, setShopName] = useState('Print Shop');

  const load = useCallback(async () => {
    try {
      setData(await printApi.calendar());
      setError('');
    } catch (err) {
      setError(describeError(err, 'Could not read the calendar'));
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => {
    printApi.getSettings().then((s) => setShopName(s.shop_name || 'Print Shop')).catch(() => {});
  }, []);

  // It is a wall chart as much as a page: left open on a second screen it has
  // to keep up on its own, not only when something is clicked.
  useEffect(() => {
    const tick = setInterval(load, 60000);
    const wake = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [load]);

  const open = (order) => navigate(`/orders?order=${encodeURIComponent(order.order_number)}`);

  if (error && !data) return <LoadError message={error} onRetry={load} what="the calendar" />;
  if (!data) return <div className="card text-center py-12 text-sm text-gray-500">Loading…</div>;

  // The buckets a fortnight cannot hold. What is with the carrier sits in its
  // own, in a colour that is not an alarm: it is past its date, but it is not
  // a thing she can do anything about.
  const spill = [
    ['Overdue', data.overdue, 'red'],
    ['Waiting for the carrier', data.with_carrier, 'teal'],
    ['No promised date', data.undated, 'gray'],
    [`Promised after ${shortDate(data.to)}`, data.later, 'gray'],
  ].filter(([, list]) => list?.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-primary">Calendar</h1>
          <p className="text-sm text-gray-500">
            What is promised over the next fortnight, and what is still owed on it.
          </p>
        </div>
        <button className="btn-secondary" onClick={() => setSheet(true)}>Print the fortnight</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Orders due" value={data.order_count} sub={`${shortDate(data.from)} – ${shortDate(data.to)}`} />
        <StatCard label="Items promised" value={data.unit_count} sub="across those orders" />
        <StatCard
          label="Overdue"
          value={data.overdue.length}
          tone={data.overdue.length ? 'warn' : 'good'}
          sub={data.overdue.length
            ? 'past their date, still on you'
            : data.with_carrier?.length ? 'nothing waiting on you' : 'nothing late'}
        />
        <StatCard
          label="No date"
          value={data.undated.length}
          tone={data.undated.length ? 'warn' : 'good'}
          sub={data.undated.length ? 'give them one' : 'all dated'}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
        {data.days.map((day) => (
          <div
            key={day.date}
            className={`card !p-2 min-h-[6rem] ${day.today ? 'ring-2 ring-primary' : ''} ${
              day.orders.length ? '' : 'opacity-60'
            }`}
          >
            <div className="flex items-baseline justify-between border-b border-linen pb-1 mb-1">
              <span className="text-[10px] uppercase tracking-wide text-gray-400">{dayName(day.date)}</span>
              <span className="font-bold text-primary leading-none">{Number(day.date.slice(8, 10))}</span>
            </div>
            {day.orders.length ? (
              <div className="space-y-0.5">
                {day.orders.map((o) => <OrderLine key={o.id} order={o} onOpen={open} />)}
              </div>
            ) : (
              <p className="text-[11px] text-gray-300 px-1">—</p>
            )}
          </div>
        ))}
      </div>

      {spill.map(([label, list, tone]) => (
        <div key={label} className="card !p-3">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
            <Pill tone={tone}>{list.length}</Pill>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
            {list.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => open(o)}
                className="text-left flex items-baseline gap-1.5 text-xs hover:bg-linen rounded px-1 py-0.5"
              >
                <span className="font-bold text-primary tabular-nums">{o.order_number}</span>
                <span className="tabular-nums text-gray-500">({o.units})</span>
                <Pill tone={toneFor(o.channel)}>{o.channel}</Pill>
                {o.promised_ship_date && (
                  <span className="text-gray-400 ml-auto">{shortDate(o.promised_ship_date)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}

      <CalendarSheet open={sheet} data={data} shopName={shopName} onClose={() => setSheet(false)} />
    </div>
  );
}
