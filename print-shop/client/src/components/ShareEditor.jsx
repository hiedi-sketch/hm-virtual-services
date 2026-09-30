/**
 * Who a plate is for.
 *
 * Nine openers are nine on the bed whether three are Susie's and six are
 * Pam's, so a plate carries several orders at once and whatever is left over
 * is stock. The same editor does this twice: when a plate goes on the queue,
 * and when who it is for changes while it is still there.
 */
export default function ShareEditor({ shares, onChange, orders, total }) {
  const spokenFor = shares.reduce((sum, sh) => sum + (Number(sh.quantity) || 0), 0);
  const leftover = (Number(total) || 0) - spokenFor;

  const set = (i, patch) => onChange(shares.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="label !mb-0">Who it is for</p>
        <button
          type="button"
          className="text-xs font-semibold text-primary hover:underline"
          onClick={() => onChange([...shares, { order_id: '', quantity: '' }])}
        >
          + Add an order
        </button>
      </div>

      {shares.length === 0 ? (
        <p className="text-xs text-gray-400">
          Nobody yet — the whole plate goes to stock. Add an order to put some of it against one.
        </p>
      ) : (
        <ul className="space-y-2">
          {shares.map((share, i) => (
            <li key={i} className="flex gap-2">
              <select
                className="input min-w-0 flex-1"
                value={share.order_id}
                onChange={(e) => set(i, { order_id: e.target.value })}
              >
                <option value="">Choose an order…</option>
                {/* An order already on the plate is not offered twice: one
                    share each, for the whole amount. */}
                {orders
                  .filter((o) => o.id === Number(share.order_id)
                    || !shares.some((x, j) => j !== i && Number(x.order_id) === o.id))
                  .map((o) => (
                    <option key={o.id} value={o.id}>{o.order_number} — {o.customer_name}</option>
                  ))}
              </select>
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                className="input !w-20 shrink-0"
                placeholder="Qty"
                value={share.quantity}
                onChange={(e) => set(i, { quantity: e.target.value })}
              />
              <button
                type="button"
                onClick={() => onChange(shares.filter((_, j) => j !== i))}
                className="text-silver hover:text-red-600 px-1 text-lg leading-none shrink-0"
                title="Take this order off the plate"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* What is left after the orders have had their share, said out loud
          rather than left for her to work out. */}
      <p className={`text-xs mt-2 ${leftover < 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
        {leftover < 0
          ? `The orders want ${spokenFor} but the plate is ${Number(total) || 0} — raise the quantity or lower a share.`
          : leftover > 0
            ? `${spokenFor} spoken for, ${leftover} for stock.`
            : shares.length
              ? 'The whole plate is spoken for.'
              : `All ${Number(total) || 0} go to stock.`}
      </p>
    </div>
  );
}
