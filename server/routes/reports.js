const express = require('express');
const db = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

router.get('/revenue', (req, res) => {
  const { year = new Date().getFullYear() } = req.query;

  const data = db.prepare(`
    SELECT
      strftime('%m', created_at) as month,
      SUM(CASE WHEN status != 'draft' THEN total ELSE 0 END) as invoiced,
      SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) as collected,
      SUM(CASE WHEN status IN ('sent', 'overdue') THEN total ELSE 0 END) as outstanding
    FROM invoices
    WHERE strftime('%Y', created_at) = ?
    GROUP BY month ORDER BY month
  `).all(String(year));

  res.json({ data });
});

router.get('/profitability', (req, res) => {
  const settings = db.prepare('SELECT value FROM settings WHERE key = ?').get('hourly_cost_rate');
  const hourlyRate = parseFloat(settings?.value || 75);

  const clients = db.prepare(`
    SELECT c.id, c.business_name, c.package_tier, c.package_price, c.expected_hours_per_month,
      SUM(te.duration_minutes) as total_minutes_logged,
      COUNT(DISTINCT strftime('%Y-%m', te.entry_date)) as months_tracked
    FROM clients c
    LEFT JOIN time_entries te ON te.client_id = c.id
    WHERE c.status = 'active'
    GROUP BY c.id
  `).all();

  const result = clients.map(c => {
    const hoursLogged = (c.total_minutes_logged || 0) / 60;
    const estimatedCost = hoursLogged * hourlyRate;
    const revenue = c.package_price;
    const profit = revenue - estimatedCost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { ...c, hours_logged: +hoursLogged.toFixed(2), estimated_cost: +estimatedCost.toFixed(2), revenue, profit: +profit.toFixed(2), margin: +margin.toFixed(1) };
  });

  res.json({ data: result, hourly_rate: hourlyRate });
});

router.get('/addons', (req, res) => {
  const data = db.prepare(`
    SELECT ii.description, SUM(ii.total) as revenue, COUNT(ii.id) as count
    FROM invoice_items ii
    JOIN invoices i ON ii.invoice_id = i.id
    WHERE i.status IN ('sent', 'paid', 'overdue')
    GROUP BY ii.description ORDER BY revenue DESC
  `).all();
  res.json({ data });
});

router.get('/aging', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const data = db.prepare(`
    SELECT i.*, c.business_name as client_name,
      julianday(?) - julianday(i.due_date) as days_overdue
    FROM invoices i JOIN clients c ON i.client_id = c.id
    WHERE i.status IN ('sent', 'overdue') AND i.due_date < ?
    ORDER BY days_overdue DESC
  `).all(today, today);

  const buckets = { '0-30': [], '31-60': [], '61-90': [], '90+': [] };
  for (const inv of data) {
    const d = Math.floor(inv.days_overdue);
    if (d <= 30) buckets['0-30'].push(inv);
    else if (d <= 60) buckets['31-60'].push(inv);
    else if (d <= 90) buckets['61-90'].push(inv);
    else buckets['90+'].push(inv);
  }
  res.json({ data: buckets });
});

router.get('/dashboard', (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 7) + '-01';

  const activeClients = db.prepare("SELECT COUNT(*) as c FROM clients WHERE status = 'active'").get().c;
  const invoicesDueThisMonth = db.prepare(`
    SELECT COUNT(*) as c FROM invoices WHERE status IN ('sent','overdue') AND due_date >= ? AND due_date <= date(?, '+1 month')
  `).get(monthStart, monthStart).c;
  const outstandingBalance = db.prepare(
    "SELECT COALESCE(SUM(total), 0) as total FROM invoices WHERE status IN ('sent','overdue')"
  ).get().total;
    const recentActivity = db.prepare(`
    SELECT 'invoice' as type, i.invoice_number as ref, i.status, c.business_name, i.updated_at as at
    FROM invoices i JOIN clients c ON i.client_id = c.id
    WHERE i.status != 'draft'
    UNION ALL
    SELECT 'message' as type, c.business_name as ref, 'new' as status, c.business_name, m.created_at as at
    FROM messages m JOIN clients c ON m.client_id = c.id
    ORDER BY at DESC LIMIT 10
  `).all();
  const overdueTasks = db.prepare(`
  SELECT tasks.title, tasks.due_date, tasks.priority, clients.business_name as client_name
  FROM tasks
  JOIN clients ON tasks.client_id = clients.id
  WHERE tasks.due_date < date('now')
  AND tasks.status != 'done'
  ORDER BY tasks.due_date ASC
`).all();
const tasksDueToday = db.prepare(`
  SELECT tasks.title, tasks.due_date, tasks.priority, clients.business_name as client_name
  FROM tasks
  JOIN clients ON tasks.client_id = clients.id
  WHERE tasks.due_date = date('now')
  AND tasks.status != 'done'
  ORDER BY 
    CASE tasks.priority
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 3
      ELSE 4
    END ASC
`).all();
// GET goals
router.get('/settings/goals', (req, res) => {
  const clientGoal = db.prepare('SELECT value FROM settings WHERE key = ?').get('active_clients_goal');
  const mrrGoal = db.prepare('SELECT value FROM settings WHERE key = ?').get('mrr_goal');
  res.json({ 
    active_clients_goal: parseInt(clientGoal?.value || 10),
    mrr_goal: parseInt(mrrGoal?.value || 5000)
  });
});

// UPDATE goals
router.put('/settings/goals', (req, res) => {
  const { active_clients_goal, mrr_goal } = req.body;
  if (active_clients_goal !== undefined) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(active_clients_goal), 'active_clients_goal');
  }
  if (mrr_goal !== undefined) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(String(mrr_goal), 'mrr_goal');
  }
  res.json({ success: true });
});

const upcomingHighPriority = db.prepare(`
  SELECT tasks.title, tasks.due_date, tasks.priority, clients.business_name as client_name
  FROM tasks
  JOIN clients ON tasks.client_id = clients.id
  WHERE tasks.due_date > date('now')
  AND tasks.priority = 'high'
  AND tasks.status != 'done'
  ORDER BY tasks.due_date ASC
`).all();
  res.json({ data: { activeClients, invoicesDueThisMonth, outstandingBalance, tasksDueToday, recentActivity, overdueTasks, upcomingHighPriority } });
});

module.exports = router;
