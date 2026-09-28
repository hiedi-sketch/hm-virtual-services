import LabelSheet from './LabelSheet';

/** "Bin 1" → "B1", "Mail Bin" → "MAIL": short enough not to crowd the bars. */
function shortName(bin) {
  const label = String(bin.label || bin.code || '');
  const digits = label.replace(/\D/g, '');
  if (digits) return `B${digits}`;
  return label.split(/\s+/)[0].toUpperCase().slice(0, 6) || bin.code;
}

/** The baskets on the shelf, two labels each: the name, and the barcode. */
export default function BinLabels({ open, bins, onClose }) {
  return (
    <LabelSheet
      open={open}
      title="Bin labels"
      subtitle="a name and a barcode for each bin"
      labels={(bins || []).map((bin) => ({
        key: `bin-${bin.id}`,
        name: bin.label,
        code: bin.code,
        short: shortName(bin),
      }))}
      onClose={onClose}
    />
  );
}
