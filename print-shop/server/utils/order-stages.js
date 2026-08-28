/**
 * The stages an order walks through, in order. Each one is a scan on the
 * printed ticket: scan a new order and it is confirmed, scan it again when it
 * goes into the queue, and so on down to shipped.
 *
 * `cancelled` and `completed` sit off the chain — they are chosen by hand, not
 * arrived at by scanning.
 */
const STAGES = [
  { key: 'new', label: 'New', scan_label: 'New order', tone: 'blue' },
  { key: 'confirmed', label: 'Confirmed', scan_label: 'Confirm it', tone: 'violet' },
  { key: 'queued', label: 'Queued', scan_label: 'Send to the queue', tone: 'teal' },
  { key: 'in_production', label: 'Production', scan_label: 'Start production', tone: 'amber' },
  { key: 'finishing', label: 'Finishing', scan_label: 'Move to finishing', tone: 'amber' },
  { key: 'packing', label: 'Packing', scan_label: 'Move to packing', tone: 'violet' },
  { key: 'shipped', label: 'Shipped', scan_label: 'Mark it shipped', tone: 'green' },
];

const OFF_CHAIN = [
  { key: 'completed', label: 'Completed', tone: 'green' },
  { key: 'cancelled', label: 'Cancelled', tone: 'gray' },
];

const ALL = [...STAGES, ...OFF_CHAIN];
const KEYS = ALL.map((s) => s.key);
const CHAIN = STAGES.map((s) => s.key);

/** Where a status sits in the chain, or -1 for cancelled and completed. */
function indexOf(status) {
  return CHAIN.indexOf(status);
}

/** The stage a scan would move this order to, or null at the end of the line. */
function nextStage(status) {
  const at = indexOf(status);
  if (at === -1 || at === CHAIN.length - 1) return null;
  return CHAIN[at + 1];
}

function stageInfo(status) {
  return ALL.find((s) => s.key === status) || null;
}

function isValid(status) {
  return KEYS.includes(status);
}

module.exports = { STAGES, OFF_CHAIN, ALL, KEYS, CHAIN, indexOf, nextStage, stageInfo, isValid };
