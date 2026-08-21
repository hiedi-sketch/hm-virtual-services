const express = require('express');
const db = require('../../db/database');
const { getSettings, computeItemCost, round2 } = require('../../utils/print-costing');
const { scheduleQueue, orderProjections, filamentSummary, materialSummary } = require('../../utils/print-planning');

const router = express.Router();

router.get('/', (req, res) => {
  const settings = getSettings();
  const { queue_hours, capacity_hours_per_day, scheduled } = scheduleQueue(settings);
  const { projections } = orderProjections(settings);

  const filaments = filamentSummary();
  const materials = materialSummary();
  const items = db.prepare('SELECT * FROM print_items WHERE is_active = 1').all();

  const orderCounts = db.prepare(`
    SELECT status, COUNT(*) AS count FROM print_orders GROUP BY status
  `).all();

  const shippedThisMonth = db.prepare(`
    SELECT IFNULL(SUM(oi.quantity * oi.unit_price), 0) AS revenue
      FROM print_orders o JOIN print_order_items oi ON oi.order_id = o.id
     WHERE o.shipped_date >= DATE('now','start of month')
  `).get().revenue;

  const inventoryValue =
    filaments.reduce((sum, f) => sum + f.value_on_hand, 0) +
    materials.reduce((sum, m) => sum + m.value_on_hand, 0) +
    items.reduce((sum, i) => sum + (i.qty_on_hand || 0) * computeItemCost(i.id).total_cost, 0);

  res.json({
    data: {
      settings,
      orders: {
        by_status: Object.fromEntries(orderCounts.map((r) => [r.status, r.count])),
        open: orderCounts
          .filter((r) => ['new', 'in_production', 'ready'].includes(r.status))
          .reduce((sum, r) => sum + r.count, 0),
        at_risk: projections.filter((p) => p.at_risk),
        next_ships: [...projections].sort((a, b) =>
          String(a.projected_ship_date).localeCompare(String(b.projected_ship_date))
        ).slice(0, 5),
      },
      queue: {
        active_jobs: scheduled.length,
        hours: queue_hours,
        days: Math.ceil(queue_hours / capacity_hours_per_day),
        capacity_hours_per_day,
        printing_now: scheduled.filter((q) => q.status === 'printing').length,
        next_up: scheduled.slice(0, 5),
      },
      inventory: {
        value: round2(inventoryValue),
        filament_reorder: filaments.filter((f) => f.needs_reorder),
        filament_short: filaments.filter((f) => f.short_by_grams > 0),
        material_reorder: materials.filter((m) => m.needs_reorder),
        low_items: items
          .filter((i) => i.item_type === 'product' && (i.qty_on_hand || 0) <= (i.reorder_point || 0))
          .map((i) => ({ id: i.id, name: i.name, sku: i.sku, qty_on_hand: i.qty_on_hand, reorder_point: i.reorder_point })),
        counts: {
          filaments: filaments.length,
          materials: materials.length,
          products: items.filter((i) => i.item_type === 'product').length,
          components: items.filter((i) => i.item_type === 'component').length,
          tools: items.filter((i) => i.item_type === 'tool').length,
        },
      },
      revenue_this_month: round2(shippedThisMonth),
    },
  });
});

module.exports = router;
