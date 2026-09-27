import { createPortal } from 'react-dom';
import { shortDate } from '../api/print';

/**
 * The fortnight, on paper, for the wall by the printer.
 *
 * Two rows of seven, because that is how a fortnight is read, and one line per
 * order: its number, how many things are on it, and where it came from. It is
 * printed from what is on the screen at that moment, so a sheet is a snapshot
 * and the screen is the truth.
 */
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayName(iso) {
  return WEEKDAY[new Date(`${iso}T00:00:00`).getDay()];
}

function OrderLine({ order }) {
  return (
    <li className="flex items-baseline gap-1 leading-tight">
      <span className="font-bold tabular-nums">{order.order_number}</span>
      <span className="tabular-nums">({order.units})</span>
      <span className="text-gray-600 truncate">{order.channel}</span>
    </li>
  );
}

export default function CalendarSheet({ open, data, shopName = 'Print Shop', onClose }) {
  if (!open || !data) return null;

  const spill = [
    ['Overdue', data.overdue],
    ['No date', data.undated],
    [`After ${shortDate(data.to)}`, data.later],
  ].filter(([, list]) => list?.length);

  return createPortal(
    <div className="print-portal fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto print:p-0 print:static print:overflow-visible">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm print:hidden" onClick={onClose} />
      <div className="print-sheet relative bg-white rounded-2xl shadow-xl w-full max-w-4xl my-4 print:my-0 print:max-w-none print:shadow-none print:rounded-none">
        <div
          className="flex items-center justify-between px-5 py-4 border-b border-linen print:hidden"
          style={{ paddingTop: 'calc(1rem + var(--safe-top))' }}
        >
          <h2 className="text-lg font-bold text-primary">Fortnight</h2>
          <button onClick={onClose} className="text-silver hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div id="print-area" className="max-h-[70vh] overflow-y-auto print:max-h-none print:overflow-visible">
          <div className="print-page p-6 text-gray-900">
            <div className="flex items-end justify-between border-b-2 border-gray-800 pb-2">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-gray-500">{shopName}</p>
                <p className="text-2xl font-bold leading-tight">Promised — next 14 days</p>
              </div>
              <div className="text-right text-xs leading-snug">
                <p>{shortDate(data.from)} – {shortDate(data.to)}</p>
                <p className="font-bold">
                  {data.order_count} order{data.order_count === 1 ? '' : 's'} · {data.unit_count} item{data.unit_count === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mt-3">
              {data.days.map((day) => (
                <div
                  key={day.date}
                  className={`border rounded p-1.5 min-h-[5.5rem] ${
                    day.today ? 'border-gray-800 border-2' : 'border-gray-300'
                  }`}
                  style={{ pageBreakInside: 'avoid' }}
                >
                  <div className="flex items-baseline justify-between border-b border-gray-200 pb-0.5 mb-1">
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">{dayName(day.date)}</span>
                    <span className="text-sm font-bold leading-none">
                      {Number(day.date.slice(8, 10))}
                    </span>
                  </div>
                  {day.orders.length ? (
                    <ul className="text-[10px] space-y-1">
                      {day.orders.map((o) => <OrderLine key={o.id} order={o} />)}
                    </ul>
                  ) : (
                    <p className="text-[10px] text-gray-300">—</p>
                  )}
                </div>
              ))}
            </div>

            {/* What a fortnight cannot hold, rather than quietly dropping it. */}
            {spill.map(([label, list]) => (
              <div key={label} className="mt-3 border border-gray-300 rounded p-2" style={{ pageBreakInside: 'avoid' }}>
                <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
                  {label} · {list.length} order{list.length === 1 ? '' : 's'}
                </p>
                <ul className="text-[11px] grid grid-cols-3 gap-x-4 gap-y-0.5">
                  {list.map((o) => (
                    <li key={o.id} className="flex items-baseline gap-1">
                      <span className="font-bold tabular-nums">{o.order_number}</span>
                      <span className="tabular-nums">({o.units})</span>
                      <span className="text-gray-600 truncate">{o.channel}</span>
                      {o.promised_ship_date && (
                        <span className="text-gray-400 ml-auto">{shortDate(o.promised_ship_date)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <p className="text-[11px] text-gray-500 mt-3 border-t border-gray-300 pt-2">
              Order number · (items on it) · where it came from. Shipped, completed and cancelled
              orders are not on here — this is what is still owed.
            </p>
          </div>
        </div>

        <div
          className="px-5 pb-5 pt-3 flex gap-2 justify-end border-t border-linen print:hidden"
          style={{ paddingBottom: 'calc(1.25rem + var(--safe-bottom))' }}
        >
          <button onClick={onClose} className="btn-secondary">Close</button>
          <button onClick={() => window.print()} className="btn-primary">Print</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
