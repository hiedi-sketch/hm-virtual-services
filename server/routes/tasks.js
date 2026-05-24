const express = require('express');
const db = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// Use contact_name as the display name throughout
const TASK_SELECT = `
  SELECT t.*, c.contact_name as client_name, c.business_name as client_business_name
  FROM tasks t LEFT JOIN clients c ON t.client_id = c.id
`;

router.get('/', (req, res) => {
  const { status, client_id, priority, task_type } = req.query;
  let query = `${TASK_SELECT} WHERE 1=1`;
  const params = [];

  if (req.user.role === 'client') {
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (!client) return res.json({ data: [] });
    query += ' AND t.client_id = ? AND t.is_client_visible = 1';
    params.push(client.id);
  } else {
    if (client_id) { query += ' AND t.client_id = ?'; params.push(client_id); }
  }

  if (status) { query += ' AND t.status = ?'; params.push(status); }
  if (priority) { query += ' AND t.priority = ?'; params.push(priority); }
  if (task_type) { query += ' AND t.task_type = ?'; params.push(task_type); }
  query += ' ORDER BY t.due_date ASC, t.priority ASC';

  const tasks = db.prepare(query).all(...params);
  res.json({ data: tasks });
});

router.post('/', requireAdmin, (req, res) => {
  const {
    client_id, title, description,
    status = 'todo', priority = 'medium',
    due_date, is_client_visible = 0,
    task_type = 'bk',
  } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  const id = db.prepare(`
    INSERT INTO tasks (client_id, title, description, status, priority, due_date, is_client_visible, task_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(client_id || null, title, description, status, priority, due_date, is_client_visible ? 1 : 0, task_type).lastInsertRowid;

  const task = db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id);
  res.status(201).json({ data: task });
});

router.put('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { client_id, title, description, status, priority, due_date, is_client_visible, task_type, is_pinned } = req.body;
  db.prepare(`
    UPDATE tasks SET
      client_id=?, title=?, description=?, status=?, priority=?,
      due_date=?, is_client_visible=?, task_type=?, is_pinned=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(
    client_id !== undefined ? (client_id || null) : task.client_id,
    title ?? task.title,
    description ?? task.description,
    status ?? task.status,
    priority ?? task.priority,
    due_date ?? task.due_date,
    is_client_visible !== undefined ? (is_client_visible ? 1 : 0) : task.is_client_visible,
    task_type ?? task.task_type ?? 'bk',
    is_pinned !== undefined ? (is_pinned ? 1 : 0) : (task.is_pinned ?? 0),
    id
  );

  const updated = db.prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id);
  res.json({ data: updated });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
