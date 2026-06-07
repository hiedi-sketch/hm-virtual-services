const express = require('express');
const { pool } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

function resolveFields({ duration_minutes, duration_seconds, entry_date, start_time, end_time }) {
  const secs = duration_seconds != null
    ? Number(duration_seconds)
    : (duration_minutes != null ? Math.round(Number(duration_minutes) * 60) : null);

  const mins = duration_minutes != null
    ? Number(duration_minutes)
    : (secs != null ? Math.round(secs / 60) : null);

  const date = entry_date || (start_time ? start_time.slice(0, 10) : null);

  return {
    duration_seconds: secs,
    duration_minutes: mins,
    entry_date: date,
    start_time: start_time || null,
    end_time: end_time || null,
  };
}

router.get('/', async (req, res) => {
  try {
    const { client_id, start_date, end_date, task_type } = req.query;
    let query = `
      SELECT te.*, c.business_name as client_name
      FROM time_entries te
      LEFT JOIN clients c ON te.client_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (client_id) { params.push(client_id); query += ` AND te.client_id = $${params.length}`; }
    if (start_date) {
      params.push(start_date);
      query += ` AND COALESCE(LEFT(te.start_time, 10), te.entry_date::text) >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND COALESCE(LEFT(te.start_time, 10), te.entry_date::text) <= $${params.length}`;
    }
    if (task_type) { params.push(task_type); query += ` AND te.task_type = $${params.length}`; }
    query += ' ORDER BY COALESCE(te.start_time, te.entry_date::text) DESC, te.id DESC';

    const { rows } = await pool.query(query, params);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
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
      params.push(String(year), String(month).padStart(2, '0'));
      query += `
        AND to_char(COALESCE(LEFT(te.start_time, 10), te.entry_date::text)::date, 'YYYY') = $1
        AND to_char(COALESCE(LEFT(te.start_time, 10), te.entry_date::text)::date, 'MM') = $2
      `;
    }
    query += ' GROUP BY c.id ORDER BY c.business_name';

    const { rows } = await pool.query(query, params);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { client_id, description, task_type = 'va', task_id } = req.body;
    const resolved = resolveFields(req.body);

    if (resolved.entry_date == null) {
      return res.status(400).json({ error: 'Date or start_time is required' });
    }
    if (resolved.duration_seconds == null && resolved.duration_minutes == null) {
      return res.status(400).json({ error: 'Duration is required' });
    }

    const { rows } = await pool.query(`
      INSERT INTO time_entries
        (client_id, description, duration_minutes, duration_seconds, entry_date, start_time, end_time, task_type, task_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
    `, [
      client_id || null, description,
      resolved.duration_minutes, resolved.duration_seconds,
      resolved.entry_date, resolved.start_time, resolved.end_time,
      task_type, task_id || null,
    ]);

    const { rows: entry } = await pool.query(`
      SELECT te.*, c.business_name as client_name FROM time_entries te
      LEFT JOIN clients c ON te.client_id = c.id WHERE te.id = $1
    `, [rows[0].id]);
    res.status(201).json({ data: entry[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM time_entries WHERE id = $1', [id]);
    const entry = rows[0];
    if (!entry) return res.status(404).json({ error: 'Time entry not found' });

    const { client_id, description, task_type, task_id } = req.body;
    const resolved = resolveFields(req.body);

    await pool.query(`
      UPDATE time_entries SET
        client_id = $1, description = $2,
        duration_minutes = $3, duration_seconds = $4,
        entry_date = $5, start_time = $6, end_time = $7,
        task_type = $8, task_id = $9,
        updated_at = NOW()
      WHERE id = $10
    `, [
      client_id !== undefined ? (client_id || null) : entry.client_id,
      description !== undefined ? description : entry.description,
      resolved.duration_minutes !== null ? resolved.duration_minutes : entry.duration_minutes,
      resolved.duration_seconds !== null ? resolved.duration_seconds : entry.duration_seconds,
      resolved.entry_date || entry.entry_date,
      resolved.start_time !== null ? resolved.start_time : entry.start_time,
      resolved.end_time !== null ? resolved.end_time : entry.end_time,
      task_type !== undefined ? (task_type ?? entry.task_type ?? 'va') : entry.task_type,
      task_id !== undefined ? (task_id || null) : entry.task_id,
      id,
    ]);

    const { rows: updated } = await pool.query(`
      SELECT te.*, c.business_name as client_name FROM time_entries te
      LEFT JOIN clients c ON te.client_id = c.id WHERE te.id = $1
    `, [id]);
    res.json({ data: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM time_entries WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Time entry not found' });

    await pool.query('DELETE FROM time_entries WHERE id = $1', [id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
