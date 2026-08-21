const express = require('express');
const db = require('../../db/database');
const { nextSku, defaultBarcode } = require('../../utils/print-sku');
const { materialSummary } = require('../../utils/print-planning');
const { logStock, applyUpdate } = require('./helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const list = materialSummary();
  const filtered = req.query.needs_reorder === '1' ? list.filter((m) => m.needs_reorder) : list;
  res.json({ data: filtered });
});

router.get('/:id', (req, res) => {
  const [material] = materialSummary(Number(req.params.id));
  if (!material) return res.status(404).json({ error: 'Material not found' });
  res.json({ data: material });
});

const EDITABLE = [
  'name', 'category', 'unit', 'cost_per_unit', 'pack_size', 'pack_cost', 'qty_on_hand',
  'qty_on_order', 'reorder_point', 'vendor_name', 'vendor_url', 'vendor_sku', 'sku',
  'barcode', 'vendor_barcode', 'notes', 'is_active',
];

router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const finalSku = req.body.sku || nextSku('print_materials', 'material');
  const finalBarcode = req.body.barcode || defaultBarcode(finalSku);
  const body = { ...req.body, sku: finalSku, barcode: finalBarcode };
  const keys = EDITABLE.filter((k) => body[k] !== undefined);

  try {
    const id = db.prepare(
      `INSERT INTO print_materials (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
    ).run(...keys.map((k) => body[k])).lastInsertRowid;

    if (body.qty_on_hand) logStock('material', id, body.qty_on_hand, body.unit || 'each', 'opening stock');
    const [material] = materialSummary(id);
    res.status(201).json({ data: material });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'That SKU or barcode is already in use' });
    }
    throw err;
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM print_materials WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Material not found' });
  applyUpdate('print_materials', req.params.id, EDITABLE, req.body);
  const [material] = materialSummary(Number(req.params.id));
  res.json({ data: material });
});

router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM print_materials WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Material not found' });

  const used = db.prepare(`
    SELECT COUNT(*) AS count FROM print_item_components
    WHERE component_type = 'material' AND ref_id = ?
  `).get(req.params.id).count;
  if (used > 0) {
    return res.status(400).json({ error: `In use by ${used} catalog item(s). Mark it inactive instead.` });
  }

  db.prepare('DELETE FROM print_materials WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

/** Receive stock, use stock, or set a counted quantity. */
router.post('/:id/adjust', (req, res) => {
  const material = db.prepare('SELECT * FROM print_materials WHERE id = ?').get(req.params.id);
  if (!material) return res.status(404).json({ error: 'Material not found' });

  const { mode = 'receive', quantity, reason, reference } = req.body;
  const qty = Number(quantity);
  if (!Number.isFinite(qty)) return res.status(400).json({ error: 'Quantity must be a number' });

  let change = 0;
  if (mode === 'receive') change = Math.abs(qty);
  else if (mode === 'consume') change = -Math.abs(qty);
  else if (mode === 'count') change = qty - (material.qty_on_hand || 0);
  else return res.status(400).json({ error: 'Mode must be receive, consume or count' });

  const onOrder = mode === 'receive'
    ? Math.max(0, (material.qty_on_order || 0) - Math.abs(qty))
    : material.qty_on_order || 0;

  db.prepare(`
    UPDATE print_materials SET qty_on_hand = ?, qty_on_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run((material.qty_on_hand || 0) + change, onOrder, material.id);

  logStock('material', material.id, change, material.unit, reason || mode, reference);
  const [updated] = materialSummary(material.id);
  res.json({ data: updated });
});

module.exports = router;
