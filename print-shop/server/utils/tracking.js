/**
 * Reading a shipping label.
 *
 * What a scanner gets off a USPS label is not the tracking number a customer
 * types into usps.com. The barcode is an Intelligent Mail package barcode: the
 * routing code `420` and the destination ZIP come first, and the tracking
 * number is the tail. Storing the whole scanned string would give a number
 * that tracks nothing.
 *
 * So the prefix comes off, the carrier is worked out from the shape of what is
 * left, and the number that goes in the order is the one that can be looked up.
 */

/** 22 digits beginning 90–95: the modern USPS package barcode. */
const IMPB = /^9[0-5]\d{20}$/;
/** The older 20-digit USPS barcode, and the 26-digit variant some services use. */
const USPS_20 = /^\d{20}$/;
const USPS_26 = /^\d{26}$/;
/** The international S10 form — two letters, nine digits, a country. */
const S10 = /^[A-Z]{2}\d{9}[A-Z]{2}$/;
const UPS = /^1Z[0-9A-Z]{16}$/;
/** FedEx Ground and Express, which are lengths USPS never uses. */
const FEDEX = /^\d{12}$/;
const FEDEX_15 = /^\d{15}$/;

const isUsps = (s) => IMPB.test(s) || USPS_20.test(s) || USPS_26.test(s);

const CARRIERS = {
  usps: {
    label: 'USPS',
    url: (n) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`,
  },
  ups: {
    label: 'UPS',
    url: (n) => `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(n)}`,
  },
  fedex: {
    label: 'FedEx',
    url: (n) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}`,
  },
};

/**
 * Take the routing prefix off a scanned USPS barcode.
 *
 * `420` is followed by a five or nine digit ZIP, and either length leaves a
 * plausible-looking string, so both are tried and the one that leaves a real
 * USPS number wins. A barcode that leaves neither is handed back untouched
 * rather than guessed at.
 */
function stripRouting(digits) {
  if (!digits.startsWith('420')) return digits;
  for (const zipLength of [9, 5]) {
    const rest = digits.slice(3 + zipLength);
    if (isUsps(rest)) return rest;
  }
  return digits;
}

/**
 * What was scanned, and what it means.
 *
 * Returns the tracking number to store, the carrier if it could be told, and
 * the link to follow. An unrecognised code still comes back with its number,
 * because a number she can read beats an error she cannot act on.
 */
function parseTracking(raw) {
  const clean = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!clean) return null;

  if (UPS.test(clean)) return describe(clean, 'ups');
  if (S10.test(clean)) return describe(clean, clean.endsWith('US') ? 'usps' : null);

  if (!/^\d+$/.test(clean)) return describe(clean, null);

  const number = stripRouting(clean);
  if (isUsps(number)) return describe(number, 'usps');
  if (FEDEX.test(number) || FEDEX_15.test(number)) return describe(number, 'fedex');

  // A run of digits that is the right sort of length for a parcel label but
  // matches nothing exactly. This shop posts with USPS, so that is the guess
  // worth making — and the number is shown either way, so a wrong guess is
  // visible rather than silent.
  if (number.length >= 18 && number.length <= 34) return describe(number, 'usps', true);

  return describe(number, null);
}

function describe(number, carrier, guessed = false) {
  const known = carrier && CARRIERS[carrier];
  return {
    number,
    carrier: carrier || null,
    carrier_label: known ? known.label : null,
    url: known ? known.url(number) : null,
    guessed,
  };
}

/** The link for a number already stored, without re-parsing what it came from. */
function trackingLink(number) {
  const parsed = parseTracking(number);
  return parsed ? { url: parsed.url, carrier: parsed.carrier, carrier_label: parsed.carrier_label } : null;
}

module.exports = { parseTracking, trackingLink, CARRIERS };
