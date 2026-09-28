import { Pill } from './ui';

/**
 * An inventory drawer scanned on its own: what is kept in it.
 *
 * The question a drawer label answers is "what is in here, and how many" —
 * read off the front with the scanner instead of opening it. An empty drawer
 * says so, which is the other half of the question: where can this go.
 */
export default function ScanDrawerCard({ drawer }) {
  const items = drawer.items || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-bold text-primary leading-tight text-lg font-mono">{drawer.code}</p>
        <Pill tone="gray">Drawer</Pill>
        <Pill tone={items.length ? 'teal' : 'gray'}>
          {items.length ? `${drawer.units} in it` : 'Empty'}
        </Pill>
      </div>

      {!items.length ? (
        <p className="text-sm text-gray-500">
          Nothing kept in this one. Scan a product and file it here from the Catalog.
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
