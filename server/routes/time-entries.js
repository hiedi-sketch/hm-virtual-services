const express = require('express');
const db = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

// Derive cross-format duration/date values so both old and new frontends work
function resolveFields({ duration_minutes, duration_seconds, entry_date, start_time, end_time }) {
  const secs = duration_seconds != null
    ? Number(duration_seconds)
    : (duration_minutes != null ? Math.round(Number(duration_minutes) * 60) : null);

  const mins = duration_minutes != null
    ? Number(duration_minutes)
    : (secs != null ? Math.round(secs / 60) : null);

  // Prefer start_time date, fall back to entry_date
  const date = entry_date || (start_time ? start_time.slice(0, 10) : null);

  return {
    duration_seconds: secs,
    duration_minutes: mins,
    entry_date: date,
    start_time: start_time || null,
    end_time: end_time || null,
  };
}

router.get('/', (req, res) => {
  const { client_id, start_date, end_date, task_type } = req.query;
  let query = `
    SELECT te.*, c.business_name as client_name
    FROM time_entries te
    LEFT JOIN clients c ON te.client_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (client_id) { query += ' AND te.client_id = ?'; params.push(client_id); }
  // Filter by start_time date when present, fall back to entry_date
  if (start_date) {
    query += ' AND COALESCE(substr(te.start_time, 1, 10), te.entry_date) >= ?';
    params.push(start_date);
  }
  if (end_date) {
    query += ' AND COALESCE(substr(te.start_time, 1, 10), te.entry_date) <= ?';
    params.push(end_date);
  }
  if (task_type) { query += ' AND te.task_type = ?'; params.push(task_type); }
  query += ' ORDER BY COALESCE(te.start_time, te.entry_date) DESC, te.id DESC';

  const entries = db.prepare(query).all(...params);
  res.json({ data: entries });
});

router.get('/summary', (req, res) => {
  const { year, month } = req.query;
  let query = `
    SELECT c.id as client_id, c.business_name, c.expected_hours_per_month,
           SUM(COALESCE(te.duration_seconds, te.duration_minutes * 60, 0)) as total_seconds,
           SUM(COALESCE(te.duration_minutes, 0)) as total_minutes,
           COUNT(te.id) as entry_count
    FROM clients c
    LEFT JOIN time_entries te ON te.client_id = c.id
  `;
  const params = [];
  if (year && month) {
    query += ` AND strftime('%Y', COALESCE(substr(te.start_time, 1, 10), te.entry_date)) = ?
               AND strftime('%m', COALESCE(substr(te.start_time, 1, 10), te.entry_date)) = ?`;
    params.push(year, month.toString().padStart(2, '0'));
  }
  query += ' GROUP BY c.id ORDER BY c.business_name';

  const summary = db.prepare(query).all(...params);
  res.json({ data: summary });
});

router.post('/', (req, res) => {
  const { client_id, description, task_type = 'va', task_id } = req.body;
  const resolved = resolveFields(req.body);

  if (resolved.entry_date == null) {
    return res.status(400).json({ error: 'Date or start_time is required' });
  }
  if (resolved.duration_seconds == null && resolved.duration_minutes == null) {
    return res.status(400).json({ error: 'Duration is required' });
  }

  const id = db.prepare(`
    INSERT INTO time_entries
      (client_id, description, duration_minutes, duration_seconds, entry_date, start_time, end_time, task_type, task_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    client_id || null,
    description,
    resolved.duration_minutes,
    resolved.duration_seconds,
    resolved.entry_date,
    resolved.start_time,
    resolved.end_time,
    task_type,
    task_id || null
  ).lastInsertRowid;

  const entry = db.prepare(`
    SELECT te.*, c.business_name as client_name FROM time_entries te
    LEFT JOIN clients c ON te.client_id = c.id WHERE te.id = ?
  `).get(id);

  res.status(201).json({ data: entry });
});

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id);
  if (!entry) return res.status(404).json({ error: 'Time entry not found' });

  const { client_id, description, task_type, task_id } = req.body;
  const resolved = resolveFields(req.body);

  db.prepare(`
    UPDATE time_entries SET
      client_id = ?, description = ?,
      duration_minutes = ?, duration_seconds = ?,
      entry_date = ?, start_time = ?, end_time = ?,
      task_type = ?, task_id = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    client_id !== undefined ? (client_id || null) : entry.client_id,
    description !== undefined ? description : entry.description,
    resolved.duration_minutes !== null ? resolved.duration_minutes : entry.duration_minutes,
    resolved.duration_seconds !== null ? resolved.duration_seconds : entry.duration_seconds,
    resolved.entry_date || entry.entry_date,
    resolved.start_time !== null ? resolved.start_time : entry.start_time,
    resolved.end_time !== null ? resolved.end_time : entry.end_time,
    task_type !== undefined ? (task_type ?? entry.task_type ?? 'va') : entry.task_type,
    task_id !== undefined ? (task_id || null) : entry.task_id,
    id
  );

  const updated = db.prepare(`
    SELECT te.*, c.business_name as client_name FROM time_entries te
    LEFT JOIN clients c ON te.client_id = c.id WHERE te.id = ?
  `).get(id);
  res.json({ data: updated });
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(id);
  if (!entry) return res.status(404).json({ error: 'Time entry not found' });

  db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
