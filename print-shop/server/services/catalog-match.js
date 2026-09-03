const db = require('../db/database');

/**
 * Find the catalog item a Shopify line is talking about.
 *
 * A shop accumulates more than one way of naming the same product. Items
 * imported from a spreadsheet carry this shop's own SKU and keep the file's
 * code as a barcode; items pulled from Shopify carry a variant id; items typed
 * in by hand may have neither. Looking in one place only means a catalog full
 * of the right products still reads as "nothing matched".
 *
 * Tried in order of how certain each one is.
 */

const norm = (v) => String(v || '').trim().toLowerCase();

function findItem({ variantId = null, sku = null, barcode = null, title = null } = {}) {
  // 1. The variant id, set when a product pull linked them. Unambiguous.
  if (variantId) {
    const hit = db.prepare('SELECT * FROM items WHERE shopify_variant_id = ?').get(variantId);
    if (hit) return { item: hit, matched_on: 'variant' };
  }

  // 2. Our own SKU, for a shop that numbers its catalog the way Shopify does.
  if (sku) {
    const hit = db.prepare('SELECT * FROM items WHERE LOWER(TRIM(sku)) = ?').get(norm(sku));
    if (hit) return { item: hit, matched_on: 'sku' };
  }

  // 3. The barcode — where a spreadsheet import puts the code the file carried,
  //    which for a Shopify export is Shopify's own SKU.
  for (const code of [sku, barcode].filter(Boolean)) {
    const hit = db.prepare(
      'SELECT * FROM items WHERE LOWER(TRIM(barcode)) = ? OR LOWER(TRIM(vendor_barcode)) = ?'
    ).get(norm(code), norm(code));
    if (hit) return { item: hit, matched_on: 'barcode' };
  }

  // 4. The name, last and only when it is exact. Products imported from a shop
  //    export are named after the shop's own titles, so this catches a line
  //    whose codes were never filled in on either side.
  if (title) {
    const hit = db.prepare('SELECT * FROM items WHERE LOWER(TRIM(name)) = ?').get(norm(title));
    if (hit) return { item: hit, matched_on: 'name' };
  }

  return null;
}

module.exports = { findItem };
