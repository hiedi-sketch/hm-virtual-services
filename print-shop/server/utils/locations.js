const db = require('../db/database');

const DEFAULT_SHELF = 'A1,A2,A3,A4,A5,A6,B1,B2,B3';
const DEFAULT_AMS = 'AMS1,AMS2,AMS3,AMS4';

function parseList(value, fallback) {
  return String(value || fallback)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function readSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return parseList(row?.value, fallback);
}

/** The two kinds of place a spool can be: on a shelf, or loaded in the printer. */
function locationLists() {
  return {
    shelf: readSetting('shelf_locations', DEFAULT_SHELF),
    ams: readSetting('ams_slots', DEFAULT_AMS),
  };
}

function allLocations() {
  const { shelf, ams } = locationLists();
  return [...shelf, ...ams];
}

function normalise(value) {
  const text = String(value || '').trim().toUpperCase();
  return text || null;
}

function isKnown(location) {
  return allLocations().includes(normalise(location));
}

/** 'ams' for a printer bay, 'shelf' for a shelf slot, null if unrecognised. */
function kindOf(location) {
  const code = normalise(location);
  if (!code) return null;
  const { shelf, ams } = locationLists();
  if (ams.includes(code)) return 'ams';
  if (shelf.includes(code)) return 'shelf';
  return null;
}

/** Every slot with whatever is sitting in it — the rack at a glance. */
function occupancy() {
  const { shelf, ams } = locationLists();
  const spools = db.prepare(`
    SELECT s.id, s.spool_code, s.location, s.status, s.grams_remaining,
           f.id AS filament_id, f.color_name, f.color_hex, f.brand, f.material_type, f.spool_size_kg
      FROM filament_spools s
      JOIN filaments f ON f.id = s.filament_id
     WHERE s.location IS NOT NULL
  `).all();

  // A shelf slot can hold a stack; an AMS bay holds one. Both come back as a
  // list so the two read the same way, with capacity saying which is which.
  const byLocation = new Map();
  for (const spool of spools) {
    if (!byLocation.has(spool.location)) byLocation.set(spool.location, []);
    byLocation.get(spool.location).push({
      id: spool.id,
      spool_code: spool.spool_code,
      status: spool.status,
      filament_id: spool.filament_id,
      label: `${spool.brand} ${spool.material_type} — ${spool.color_name}`,
      color_hex: spool.color_hex,
      grams_remaining: spool.grams_remaining != null
        ? spool.grams_remaining
        : (spool.status === 'new' ? (spool.spool_size_kg || 1) * 1000 : 0),
    });
  }

  const describe = (code, kind) => ({
    code,
    kind,
    capacity: kind === 'ams' ? 1 : null,
    spools: byLocation.get(code) || [],
  });

  // A spool parked somewhere no longer on the list still has to be findable.
  const known = new Set([...shelf, ...ams]);
  const strays = spools
    .filter((s) => !known.has(s.location))
    .map((s) => describe(s.location, 'unlisted'));

  return {
    shelf: shelf.map((code) => describe(code, 'shelf')),
    ams: ams.map((code) => describe(code, 'ams')),
    unlisted: strays,
    unassigned: db.prepare(`
      SELECT COUNT(*) AS count FROM filament_spools
       WHERE location IS NULL AND status IN ('new','opened')
    `).get().count,
  };
}

module.exports = {
  locationLists, allLocations, normalise, isKnown, kindOf, occupancy,
  DEFAULT_SHELF, DEFAULT_AMS,
};
