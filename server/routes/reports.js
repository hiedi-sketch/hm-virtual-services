const express = require('express');
const { pool } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

router.get('/revenue', async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const { rows } = await pool.query(`
      SELECT
        to_char(created_at, 'MM') as month,
        SUM(CASE WHEN status != 'draft' THEN total ELSE 0 END) as invoiced,
        SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) as collected,
        SUM(CASE WHEN status IN ('sent', 'overdue') THEN total ELSE 0 END) as outstanding
      FROM invoices
      WHERE to_char(created_at, 'YYYY') = $1
      GROUP BY month ORDER BY month
    `, [String(year)]);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/profitability', async (req, res) => {
  try {
    const { rows: settingRows } = await pool.query('SELECT value FROM settings WHERE key = $1', ['hourly_cost_rate']);
    const hourlyRate = parseFloat(settingRows[0]?.value || 75);

    const { rows: clients } = await pool.query(`
      SELECT c.id, c.business_name, c.package_tier, c.package_price, c.expected_hours_per_month,
        SUM(te.duration_minutes) as total_minutes_logged,
        COUNT(DISTINCT to_char(te.entry_date, 'YYYY-MM')) as months_tracked
      FROM clients c
      LEFT JOIN time_entries te ON te.client_id = c.id
      WHERE c.status = 'active'
      GROUP BY c.id
    `);

    const result = clients.map(c => {
      const hoursLogged = (c.total_minutes_logged || 0) / 60;
      const estimatedCost = hoursLogged * hourlyRate;
      const revenue = parseFloat(c.package_price);
      const profit = revenue - estimatedCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      return { ...c, hours_logged: +hoursLogged.toFixed(2), estimated_cost: +estimatedCost.toFixed(2), revenue, profit: +profit.toFixed(2), margin: +margin.toFixed(1) };
    });

    res.json({ data: result, hourly_rate: hourlyRate });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/addons', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ii.description, SUM(ii.total) as revenue, COUNT(ii.id) as count
      FROM invoice_items ii
      JOIN invoices i ON ii.invoice_id = i.id
      WHERE i.status IN ('sent', 'paid', 'overdue')
      GROUP BY ii.description ORDER BY revenue DESC
    `);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/aging', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { rows } = await pool.query(`
      SELECT i.*, c.business_name as client_name,
        ($1::date - i.due_date::date) as days_overdue
      FROM invoices i JOIN clients c ON i.client_id = c.id
      WHERE i.status IN ('sent', 'overdue') AND i.due_date < $2
      ORDER BY days_overdue DESC
    `, [today, today]);

    const buckets = { '0-30': [], '31-60': [], '61-90': [], '90+': [] };
    for (const inv of rows) {
      const d = Math.floor(Number(inv.days_overdue));
      if (d <= 30) buckets['0-30'].push(inv);
      else if (d <= 60) buckets['31-60'].push(inv);
      else if (d <= 90) buckets['61-90'].push(inv);
      else buckets['90+'].push(inv);
    }
    res.json({ data: buckets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/settings/goals', async (req, res) => {
  try {
    const [{ rows: clientGoalRows }, { rows: mrrGoalRows }] = await Promise.all([
      pool.query('SELECT value FROM settings WHERE key = $1', ['active_clients_goal']),
      pool.query('SELECT value FROM settings WHERE key = $1', ['mrr_goal']),
    ]);
    res.json({
      active_clients_goal: parseInt(clientGoalRows[0]?.value || 10),
      mrr_goal: parseInt(mrrGoalRows[0]?.value || 5000),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/settings/goals', async (req, res) => {
  try {
    const { active_clients_goal, mrr_goal } = req.body;
    if (active_clients_goal !== undefined) {
      await pool.query('UPDATE settings SET value = $1 WHERE key = $2', [String(active_clients_goal), 'active_clients_goal']);
    }
    if (mrr_goal !== undefined) {
      await pool.query('UPDATE settings SET value = $1 WHERE key = $2', [String(mrr_goal), 'mrr_goal']);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7) + '-01';

    const [
      activeClientsResult,
      invoicesDueResult,
      outstandingResult,
      recentActivityResult,
      overdueTasksResult,
      tasksTodayResult,
      upcomingResult,
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) as c FROM clients WHERE status = 'active'"),
      pool.query(
        `SELECT COUNT(*) as c FROM invoices WHERE status IN ('sent','overdue') AND due_date >= $1 AND due_date <= ($2::date + INTERVAL '1 month')`,
        [monthStart, monthStart]
      ),
      pool.query("SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE status IN ('sent','overdue')"),
      pool.query(`
        SELECT 'invoice' as type, i.invoice_number as ref, i.status, c.business_name, i.updated_at as at
        FROM invoices i JOIN clients c ON i.client_id = c.id
        WHERE i.status != 'draft'
        UNION ALL
        SELECT 'message' as type, c.business_name as ref, 'new' as status, c.business_name, m.created_at as at
        FROM messages m JOIN clients c ON m.client_id = c.id
        ORDER BY at DESC LIMIT 10
      `),
      pool.query(`
        SELECT tasks.title, tasks.due_date, tasks.priority, clients.business_name as client_name
        FROM tasks JOIN clients ON tasks.client_id = clients.id
        WHERE tasks.due_date < CURRENT_DATE AND tasks.status != 'done'
        ORDER BY tasks.due_date ASC
      `),
      pool.query(`
        SELECT tasks.title, tasks.due_date, tasks.priority, clients.business_name as client_name
        FROM tasks JOIN clients ON tasks.client_id = clients.id
        WHERE tasks.due_date = CURRENT_DATE AND tasks.status != 'done'
        ORDER BY
          CASE tasks.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END ASC
      `),
      pool.query(`
        SELECT tasks.title, tasks.due_date, tasks.priority, clients.business_name as client_name
        FROM tasks JOIN clients ON tasks.client_id = clients.id
        WHERE tasks.due_date > CURRENT_DATE AND tasks.priority = 'high' AND tasks.status != 'done'
        ORDER BY tasks.due_date ASC
      `),
    ]);

    res.json({
      data: {
        activeClients: parseInt(activeClientsResult.rows[0].c),
        invoicesDueThisMonth: parseInt(invoicesDueResult.rows[0].c),
        outstandingBalance: parseFloat(outstandingResult.rows[0].total),
        recentActivity: recentActivityResult.rows,
        overdueTasks: overdueTasksResult.rows,
        tasksDueToday: tasksTodayResult.rows,
        upcomingHighPriority: upcomingResult.rows,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
