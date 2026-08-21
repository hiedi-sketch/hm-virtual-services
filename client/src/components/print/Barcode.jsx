// Code 128 (subset B) rendered as inline SVG, so labels print from any browser
// without a server round-trip or an image dependency.
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

/** Character values, checksum, and the bar/space widths for a Code 128B symbol. */
function encode(value) {
  const text = String(value || '');
  const codes = [];
  for (const char of text) {
    const point = char.charCodeAt(0);
    // Subset B covers ASCII 32–127; anything else becomes a space.
    codes.push(point >= 32 && point <= 127 ? point - 32 : 0);
  }

  let checksum = START_B;
  codes.forEach((code, index) => { checksum += code * (index + 1); });
  checksum %= 103;

  return [START_B, ...codes, checksum, STOP].map((i) => PATTERNS[i]).join('');
}

export default function Barcode({ value, height = 48, moduleWidth = 2, showText = true, className = '' }) {
  if (!value) return null;

  const widths = encode(value).split('').map(Number);
  const totalModules = widths.reduce((a, b) => a + b, 0);
  const width = totalModules * moduleWidth;

  const bars = [];
  let x = 0;
  widths.forEach((w, index) => {
    // Patterns alternate bar, space, bar, space… starting with a bar.
    if (index % 2 === 0) {
      bars.push(<rect key={index} x={x} y={0} width={w * moduleWidth} height={height} fill="#111" />);
    }
    x += w * moduleWidth;
  });

  return (
    <div className={`inline-block text-center ${className}`}>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        height={height}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Barcode ${value}`}
        style={{ maxWidth: width }}
      >
        <rect x={0} y={0} width={width} height={height} fill="#fff" />
        {bars}
      </svg>
      {showText && (
        <div className="font-mono text-[11px] tracking-[0.18em] text-gray-700 mt-1">{value}</div>
      )}
    </div>
  );
}
