const express = require('express');
const db = require('../db/database');
const { nextOrderNumber } = require('../utils/sku');
const { getSettings, priceItem, computeItemCost, round2 } = require('../utils/costing');
const { suggestShipDate, orderProjections, estimatedMinutes } = require('../utils/planning');

const router = express.Router();

const EDITABLE = [
  'order_number', 'customer_name', 'customer_email', 'channel', 'order_type', 'status',
  'order_date', 'promised_ship_date', 'shipped_date', 'tracking_number', 'notes', 'shipping_total',
];

function orderTotals(orderId) {
  const items = db.prepare(`
    SELECT oi.*, i.name AS item_name, i.sku AS item_sku, i.item_type, i.print_time_minutes
      FROM order_items oi LEFT JOIN items i ON oi.item_id = i.id
     WHERE oi.order_id = ? ORDER BY oi.id
  `).all(orderId);

  let revenue = 0;
  let cost = 0;
  for (const line of items) {
    revenue += (line.quantity || 0) * (line.unit_price || 0);
    if (line.item_id) cost += (line.quantity || 0) * computeItemCost(line.item_id).total_cost;
    line.line_total = round2((line.quantity || 0) * (line.unit_price || 0));
  }
  return { items, revenue: round2(revenue), cost: round2(cost), profit: round2(revenue - cost) };
}

function hydrate(order, projectionsById) {
  const totals = orderTotals(order.id);
  const queue = db.prepare(`
    SELECT q.*, i.name AS item_name FROM queue_jobs q
      JOIN items i ON q.item_id = i.id
     WHERE q.order_id = ? ORDER BY q.position, q.id
  `).all(order.id);

  return {
    ...order,
    ...totals,
    queue_entries: queue,
    projection: projectionsById?.get(order.id) || null,
    needs_queueing: totals.items.some(
      (line) => line.item_id && line.item_type !== 'tool' &&
        !queue.some((q) => q.order_item_id === line.id && q.status !== 'cancelled')
    ),
  };
}

router.get('/', (req, res) => {
  const { status, q } = req.query;
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (q) {
    sql += ' AND (order_number LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'in_production' THEN 1 WHEN 'ready' THEN 2 ELSE 3 END, order_date DESC, id DESC";

  const { projections } = orderProjections();
  const byId = new Map(projections.map((p) => [p.order_id, p]));
  res.json({ data: db.prepare(sql).all(...params).map((o) => hydrate(o, byId)) });
});

router.get('/suggest-ship-date', (req, res) => {
  res.json({ data: suggestShipDate(req.query.order_date || null, Number(req.query.minutes) || 0) });
});

router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  const { projections } = orderProjections();
  res.json({ data: hydrate(order, new Map(projections.map((p) => [p.order_id, p]))) });
});

router.post('/', (req, res) => {
  const settings = getSettings();
  const { items = [] } = req.body;
  const orderDate = req.body.order_date || new Date().toISOString().slice(0, 10);

  const extraMinutes = items.reduce((sum, line) => {
    if (!line.item_id) return sum;
    return sum + (computeItemCost(line.item_id).print_minutes_per_unit || 0) * (Number(line.quantity) || 0);
  }, 0);
  const suggested = suggestShipDate(orderDate, extraMinutes, settings);

  const body = {
    ...req.body,
    order_date: orderDate,
    order_number: req.body.order_number || nextOrderNumber(),
    promised_ship_date: req.body.promised_ship_date || suggested.suggested_ship_date,
  };
  const keys = EDITABLE.filter((k) => body[k] !== undefined);

  const create = db.transaction(() => {
    const id = db.prepare(
      `INSERT INTO orders (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
    ).run(...keys.map((k) => body[k])).lastInsertRowid;

    const insertLine = db.prepare(`
      INSERT INTO order_items (order_id, item_id, description, quantity, unit_price)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const line of items) {
      // Default to the price band the order is being written at.
      let price = line.unit_price;
      if (price == null && line.item_id) {
        const priced = priceItem(line.item_id, settings);
        price = body.order_type === 'wholesale' ? priced.wholesale_price : priced.retail_price;
      }
      insertLine.run(id, line.item_id || null, line.description || null, Number(line.quantity) || 1, price || 0);
    }
    return id;
  });

  try {
    const id = create();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    res.status(201).json({ data: hydrate(order), suggestion: suggested });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(400).json({ error: 'That order number is already in use' });
    }
    throw err;
  }
});

router.put('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const update = db.transaction(() => {
    const keys = EDITABLE.filter((k) => req.body[k] !== undefined);
    if (keys.length) {
      db.prepare(
        `UPDATE orders SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`
      ).run(...keys.map((k) => req.body[k]), req.params.id);
    }

    if (Array.isArray(req.body.items)) {
      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(req.params.id);
      const insertLine = db.prepare(`
        INSERT INTO order_items (order_id, item_id, description, quantity, unit_price)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const line of req.body.items) {
        insertLine.run(
          req.params.id, line.item_id || null, line.description || null,
          Number(line.quantity) || 1, Number(line.unit_price) || 0
        );
      }
    }
  });
  update();

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  const { projections } = orderProjections();
  res.json({ data: hydrate(updated, new Map(projections.map((p) => [p.order_id, p]))) });
});

router.delete('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

/** Push every printable line on this order into the production queue. */
router.post('/:id/queue', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const lines = db.prepare(`
    SELECT oi.*, i.item_type FROM order_items oi
      JOIN items i ON oi.item_id = i.id
     WHERE oi.order_id = ? AND i.item_type <> 'tool'
  `).all(order.id);

  const maxPosition = db.prepare('SELECT IFNULL(MAX(position), 0) AS max FROM queue_jobs').get().max;
  let position = maxPosition;
  let added = 0;

  const enqueue = db.transaction(() => {
    for (const line of lines) {
      const already = db.prepare(`
        SELECT COUNT(*) AS count FROM queue_jobs WHERE order_item_id = ? AND status <> 'cancelled'
      `).get(line.id).count;
      if (already > 0) continue;

      position += 1;
      const minutes = estimatedMinutes({ item_id: line.item_id, quantity: line.quantity, estimated_minutes: null });
      db.prepare(`
        INSERT INTO queue_jobs (order_id, order_item_id, item_id, quantity, priority, position, estimated_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(order.id, line.id, line.item_id, line.quantity, req.body.priority || 'normal', position, minutes);
      added += 1;
    }
    if (added > 0 && order.status === 'new') {
      db.prepare("UPDATE orders SET status = 'in_production', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(order.id);
    }
  });
  enqueue();

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  const { projections } = orderProjections();
  res.json({
    data: hydrate(updated, new Map(projections.map((p) => [p.order_id, p]))),
    message: added ? `${added} item(s) queued` : 'Everything on this order is already queued',
  });
});

module.exports = router;
