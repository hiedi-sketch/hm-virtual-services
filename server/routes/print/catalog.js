const express = require('express');
const db = require('../../db/database');
const { nextSku, defaultBarcode } = require('../../utils/print-sku');
const { getSettings, priceItem, computeItemCost, previewItemCost } = require('../../utils/print-costing');
const { materialSummary, filamentSummary } = require('../../utils/print-planning');
const { logStock, applyUpdate } = require('./helpers');

const router = express.Router();

const EDITABLE = [
  'name', 'item_type', 'category', 'description', 'sku', 'barcode', 'vendor_barcode',
  'print_time_minutes', 'units_per_print', 'labor_minutes', 'qty_on_hand', 'reorder_point',
  'purchase_cost', 'cost_override', 'wholesale_override', 'retail_override',
  'vendor_name', 'vendor_url', 'image_url', 'notes', 'is_active', 'lead_time_days',
];

/** Resolve a BOM row into something the UI can label without extra lookups. */
function decorateComponents(itemId) {
  const rows = db.prepare('SELECT * FROM print_item_components WHERE item_id = ? ORDER BY id').all(itemId);
  return rows.map((c) => {
    if (c.component_type === 'filament') {
      const f = db.prepare('SELECT * FROM print_filaments WHERE id = ?').get(c.ref_id);
      return {
        ...c,
        label: f ? `${f.brand} ${f.material_type} — ${f.color_name}` : 'Missing filament',
        unit: 'g',
        unit_cost: f ? (f.cost_per_kg || 0) / 1000 : 0,
        color_hex: f?.color_hex,
        missing: !f,
      };
    }
    if (c.component_type === 'material') {
      const m = db.prepare('SELECT * FROM print_materials WHERE id = ?').get(c.ref_id);
      return {
        ...c,
        label: m ? m.name : 'Missing material',
        unit: m?.unit || 'each',
        unit_cost: m ? (m.pack_cost != null && m.pack_size > 0 ? m.pack_cost / m.pack_size : m.cost_per_unit) : 0,
        missing: !m,
      };
    }
    const i = db.prepare('SELECT * FROM print_items WHERE id = ?').get(c.ref_id);
    return {
      ...c,
      label: i ? i.name : 'Missing item',
      unit: 'each',
      unit_cost: i ? computeItemCost(i.id).total_cost : 0,
      missing: !i,
    };
  });
}

function replaceComponents(itemId, components) {
  db.prepare('DELETE FROM print_item_components WHERE item_id = ?').run(itemId);
  const insert = db.prepare(`
    INSERT INTO print_item_components (item_id, component_type, ref_id, quantity, notes)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const c of components) {
    if (!c || !c.component_type || !c.ref_id) continue;
    // An item that lists itself would make the cost roll-up loop forever.
    if (c.component_type === 'item' && Number(c.ref_id) === Number(itemId)) continue;
    insert.run(itemId, c.component_type, c.ref_id, Number(c.quantity) || 0, c.notes || null);
  }
}

router.get('/', (req, res) => {
  const settings = getSettings();
  const { item_type, q, needs_reorder, active } = req.query;

  let sql = 'SELECT id FROM print_items WHERE 1=1';
  const params = [];
  if (item_type) { sql += ' AND item_type = ?'; params.push(item_type); }
  if (active === '1') sql += ' AND is_active = 1';
  if (q) {
    sql += ' AND (name LIKE ? OR sku LIKE ? OR category LIKE ? OR barcode LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY item_type, name';

  const ids = db.prepare(sql).all(...params).map((r) => r.id);
  let items = ids.map((id) => priceItem(id, settings));
  if (needs_reorder === '1') items = items.filter((i) => i.qty_on_hand <= i.reorder_point);

  res.json({ data: items });
});

router.get('/options', (req, res) => {
  res.json({
    data: {
      filaments: filamentSummary().map((f) => ({
        id: f.id,
        label: `${f.brand} ${f.material_type} — ${f.color_name}`,
        color_hex: f.color_hex,
        cost_per_kg: f.cost_per_kg,
        grams_on_hand: f.grams_on_hand,
      })),
      materials: materialSummary().map((m) => ({
        id: m.id, label: m.name, unit: m.unit, unit_cost: m.unit_cost, qty_on_hand: m.qty_on_hand,
      })),
      items: db.prepare("SELECT id, name, sku, item_type FROM print_items WHERE item_type IN ('component','product') ORDER BY name").all()
        .map((i) => ({ id: i.id, label: `${i.name} (${i.sku})`, item_type: i.item_type })),
      settings: getSettings(),
    },
  });
});

/** Live cost + suggested prices for an item still being edited. */
router.post('/preview', (req, res) => {
  res.json({ data: previewItemCost(req.body) });
});

router.get('/:id', (req, res) => {
  const item = priceItem(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json({ data: { ...item, components: decorateComponents(item.id) } });
});

router.post('/', (req, res) => {
  const { name, item_type = 'product', components = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!['product', 'component', 'tool'].includes(item_type)) {
    return res.status(400).json({ error: 'Item type must be product, component or tool' });
  }

  const finalSku = req.body.sku || nextSku('print_items', item_type);
  const body = { ...req.body, sku: finalSku, barcode: req.body.barcode || defaultBarcode(finalSku) };
  const keys = EDITABLE.filter((k) => body[k] !== undefined);

  try {
    const create = db.transaction(() => {
      const id = db.prepare(
        `INSERT INTO print_items (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
      ).run(...keys.map((k) => body[k])).lastInsertRowid;
      replaceComponents(id, components);
      if (body.qty_on_hand) logStock('item', id, body.qty_on_hand, 'each', 'opening stock');
      return id;
    });
    const id = create();
    const item = priceItem(id);
    res.status(201).json({ data: { ...item, components: decorateComponents(id) } });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'That SKU or barcode is already in use' });
    }
    throw err;
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM print_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });

  const update = db.transaction(() => {
    applyUpdate('print_items', req.params.id, EDITABLE, req.body);
    if (Array.isArray(req.body.components)) replaceComponents(Number(req.params.id), req.body.components);
  });

  try {
    update();
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'That SKU or barcode is already in use' });
    }
    throw err;
  }

  const item = priceItem(Number(req.params.id));
  res.json({ data: { ...item, components: decorateComponents(item.id) } });
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM print_items WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Item not found' });

  const usedBy = db.prepare(`
    SELECT COUNT(*) AS count FROM print_item_components WHERE component_type = 'item' AND ref_id = ?
  `).get(req.params.id).count;
  const onOrders = db.prepare('SELECT COUNT(*) AS count FROM print_order_items WHERE item_id = ?')
    .get(req.params.id).count;
  if (usedBy > 0 || onOrders > 0) {
    return res.status(400).json({
      error: 'This item is used by another item or an order. Mark it inactive instead.',
    });
  }

  db.prepare('DELETE FROM print_items WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

router.post('/:id/adjust', (req, res) => {
  const item = db.prepare('SELECT * FROM print_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const { mode = 'receive', quantity, reason, reference } = req.body;
  const qty = Number(quantity);
  if (!Number.isFinite(qty)) return res.status(400).json({ error: 'Quantity must be a number' });

  let change = 0;
  if (mode === 'receive') change = Math.abs(qty);
  else if (mode === 'consume') change = -Math.abs(qty);
  else if (mode === 'count') change = qty - (item.qty_on_hand || 0);
  else return res.status(400).json({ error: 'Mode must be receive, consume or count' });

  db.prepare('UPDATE print_items SET qty_on_hand = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run((item.qty_on_hand || 0) + change, item.id);
  logStock('item', item.id, change, 'each', reason || mode, reference);

  res.json({ data: priceItem(item.id) });
});

module.exports = { router, decorateComponents };
