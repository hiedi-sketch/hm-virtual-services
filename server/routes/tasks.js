const express = require('express');
const { pool } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const TASK_SELECT = `
  SELECT t.*, c.contact_name as client_name, c.business_name as client_business_name
  FROM tasks t LEFT JOIN clients c ON t.client_id = c.id
`;

router.get('/', async (req, res) => {
  try {
    const { status, client_id, priority, task_type } = req.query;
    let query = `${TASK_SELECT} WHERE 1=1`;
    const params = [];

    if (req.user.role === 'client') {
      const { rows } = await pool.query('SELECT id FROM clients WHERE user_id = $1', [req.user.id]);
      if (!rows[0]) return res.json({ data: [] });
      params.push(rows[0].id);
      query += ` AND t.client_id = $${params.length} AND t.is_client_visible = 1`;
    } else {
      if (client_id) {
        params.push(client_id);
        query += ` AND t.client_id = $${params.length}`;
      }
    }

    if (status) { params.push(status); query += ` AND t.status = $${params.length}`; }
    if (priority) { params.push(priority); query += ` AND t.priority = $${params.length}`; }
    if (task_type) { params.push(task_type); query += ` AND t.task_type = $${params.length}`; }
    query += ' ORDER BY t.due_date ASC, t.priority ASC';

    const { rows } = await pool.query(query, params);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const {
      client_id, title, description,
      status = 'todo', priority = 'medium',
      due_date, is_client_visible = 0,
      task_type = 'bk',
    } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });

    const { rows } = await pool.query(`
      INSERT INTO tasks (client_id, title, description, status, priority, due_date, is_client_visible, task_type)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
    `, [client_id || null, title, description, status, priority, due_date, is_client_visible ? 1 : 0, task_type]);

    const { rows: task } = await pool.query(`${TASK_SELECT} WHERE t.id = $1`, [rows[0].id]);
    res.status(201).json({ data: task[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    const task = rows[0];
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const { client_id, title, description, status, priority, due_date, is_client_visible, task_type, is_pinned } = req.body;
    await pool.query(`
      UPDATE tasks SET
        client_id=$1, title=$2, description=$3, status=$4, priority=$5,
        due_date=$6, is_client_visible=$7, task_type=$8, is_pinned=$9, updated_at=NOW()
      WHERE id=$10
    `, [
      client_id !== undefined ? (client_id || null) : task.client_id,
      title ?? task.title,
      description ?? task.description,
      status ?? task.status,
      priority ?? task.priority,
      due_date ?? task.due_date,
      is_client_visible !== undefined ? (is_client_visible ? 1 : 0) : task.is_client_visible,
      task_type ?? task.task_type ?? 'bk',
      is_pinned !== undefined ? (is_pinned ? 1 : 0) : (task.is_pinned ?? 0),
      id,
    ]);

    const { rows: updated } = await pool.query(`${TASK_SELECT} WHERE t.id = $1`, [id]);
    res.json({ data: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Task not found' });

    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
