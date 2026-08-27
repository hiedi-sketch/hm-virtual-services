const db = require('../db/database');

function logStock(entityType, entityId, change, unit, reason, reference) {
  // A zero-quantity stock movement is not a movement.
  if (!change) return;
  db.prepare(`
    INSERT INTO stock_log (entity_type, entity_id, change, unit, reason, reference)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(entityType, entityId, change, unit, reason || null, reference || null);
}

/** Build a partial UPDATE from whichever whitelisted fields the body supplied. */
function applyUpdate(table, id, fields, body) {
  const keys = fields.filter((k) => body[k] !== undefined);
  if (!keys.length) return false;
  db.prepare(
    `UPDATE ${table} SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(...keys.map((k) => body[k]), id);
  return true;
}

/**
 * Something worth remembering that did not change a quantity — a spool moving
 * from a shelf slot into the printer, for instance. Shares the stock log so
 * one history covers everything that happened to a thing.
 */
function logEvent(entityType, entityId, reason, reference) {
  db.prepare(`
    INSERT INTO stock_log (entity_type, entity_id, change, unit, reason, reference)
    VALUES (?, ?, 0, NULL, ?, ?)
  `).run(entityType, entityId, reason, reference || null);
}

module.exports = { logStock, logEvent, applyUpdate };
