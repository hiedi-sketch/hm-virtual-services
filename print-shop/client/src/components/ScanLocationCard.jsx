import { grams } from '../api/print';
import { Pill } from './ui';

/**
 * A shelf slot or AMS bay scanned on its own: what is standing in it.
 *
 * The question a shelf label answers is "what is here" — read off the edge of
 * the shelf with the scanner rather than by turning every spool round to find
 * its colour. An empty slot says so, which is the other half of the question:
 * where can this one go.
 */
export default function ScanLocationCard({ location }) {
  const spools = location.spools || [];
  const ams = location.kind === 'ams';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-bold text-primary leading-tight text-lg font-mono">{location.code}</p>
        <Pill tone={ams ? 'blue' : 'gray'}>{ams ? 'Printer bay' : 'Shelf slot'}</Pill>
        <Pill tone={spools.length ? 'teal' : 'gray'}>
          {spools.length ? `${spools.length} spool${spools.length === 1 ? '' : 's'}` : 'Empty'}
        </Pill>
      </div>

      {!spools.length ? (
        <p className="text-sm text-gray-500">
          {ams
            ? 'Nothing loaded in this bay. Scan a spool and put it here.'
            : 'Nothing on this slot. Scan a spool and put it here.'}
        </p>
      ) : (
        <ul className="text-sm border-t border-linen divide-y divide-linen">
          {spools.map((spool) => (
            <li key={spool.id} className="py-2 flex items-center gap-2.5">
              <span
                className="w-5 h-5 rounded-full border border-greige shrink-0"
                style={{ background: spool.color_hex || '#B0B5BC' }}
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight truncate">{spool.label}</p>
                <p className="text-xs text-gray-500">
                  <span className="font-mono">{spool.spool_code}</span> · {spool.status}
                </p>
              </div>
              <span className="text-sm font-semibold text-gray-700 shrink-0">
                {grams(spool.grams_remaining)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
