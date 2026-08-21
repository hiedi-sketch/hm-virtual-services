const db = require('../db/database');

function logStock(entityType, entityId, change, unit, reason, reference) {
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

module.exports = { logStock, applyUpdate };
