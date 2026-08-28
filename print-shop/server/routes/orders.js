const express = require('express');
const db = require('../db/database');
const { nextOrderNumber } = require('../utils/sku');
const { getSettings, priceItem, computeItemCost, round2 } = require('../utils/costing');
const { suggestShipDate, orderProjections } = require('../utils/planning');
const { freeOrderBarcode } = require('../db/schema');
const stages = require('../utils/order-stages');
const flow = require('../services/order-flow');

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
    next_stage: stages.nextStage(order.status),
    history: flow.events(order.id, 12),
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
  // Work in progress first, in pipeline order; shipped and cancelled sink.
  const rank = stages.CHAIN.map((key, i) => `WHEN '${key}' THEN ${i}`).join(' ');
  sql += ` ORDER BY CASE status ${rank} ELSE 99 END, order_date DESC, id DESC`;

  const { projections } = orderProjections();
  const byId = new Map(projections.map((p) => [p.order_id, p]));
  res.json({ data: db.prepare(sql).all(...params).map((o) => hydrate(o, byId)) });
});

/** The stages themselves, so the app never hard-codes its own copy. */
router.get('/stages', (req, res) => {
  res.json({ data: { stages: stages.STAGES, off_chain: stages.OFF_CHAIN } });
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

    // Every order gets something printable and scannable from the start.
    const taken = new Set(
      db.prepare('SELECT barcode FROM orders WHERE barcode IS NOT NULL').all().map((r) => r.barcode)
    );
    db.prepare('UPDATE orders SET barcode = ? WHERE id = ?')
      .run(freeOrderBarcode(body.order_number, id, taken), id);
    flow.logEvent(id, null, body.status || 'new', 'created');

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

  // A status set by hand goes through the same path as a scan, so choosing
  // "Queued" from the dropdown queues the work exactly as scanning would.
  if (req.body.status !== undefined && req.body.status !== order.status) {
    try {
      flow.setStatus(order.id, req.body.status, { source: 'manual' });
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }
  }

  const update = db.transaction(() => {
    const keys = EDITABLE.filter((k) => k !== 'status' && req.body[k] !== undefined);
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

  // Queueing is the "queued" stage, so it goes through the pipeline rather
  // than round the side of it. An order already past queued just gets the work
  // added without being dragged backwards.
  let added;
  let message;
  if (stages.indexOf(order.status) < stages.indexOf('queued')) {
    const result = flow.setStatus(order.id, 'queued', { source: 'app', priority: req.body.priority || 'normal' });
    added = result.queued;
    message = added ? `${added} item(s) queued` : 'Nothing on this order needs printing';
  } else {
    added = flow.enqueueOrder(order.id, req.body.priority || 'normal');
    message = added ? `${added} item(s) queued` : 'Everything on this order is already queued';
  }

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  const { projections } = orderProjections();
  res.json({ data: hydrate(updated, new Map(projections.map((p) => [p.order_id, p]))), message });
});

/**
 * One stage along — what scanning the printed ticket does. Pass `to` to jump
 * to a particular stage instead; without it the order simply moves on.
 */
router.post('/:id/advance', (req, res) => {
  try {
    const result = req.body.to
      ? flow.setStatus(Number(req.params.id), req.body.to, { source: req.body.source || 'app', note: req.body.note })
      : flow.advance(Number(req.params.id), { source: req.body.source || 'app', note: req.body.note });

    const { projections } = orderProjections();
    res.json({
      data: hydrate(result.order, new Map(projections.map((p) => [p.order_id, p]))),
      message: `${result.order.order_number} — ${result.message.toLowerCase()}`,
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

module.exports = router;
