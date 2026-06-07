const express = require('express');
const { pool } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/threads', async (req, res) => {
  try {
    if (req.user.role === 'client') {
      const { rows: clientRows } = await pool.query('SELECT id FROM clients WHERE user_id = $1', [req.user.id]);
      if (!clientRows[0]) return res.json({ data: [] });

      const { rows } = await pool.query(`
        SELECT c.id as client_id, c.business_name,
          (SELECT COUNT(*) FROM messages WHERE client_id = c.id AND is_read = 0 AND sender_id != $1) as unread_count,
          (SELECT content FROM messages WHERE client_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
          (SELECT created_at FROM messages WHERE client_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
        FROM clients c WHERE c.id = $2
      `, [req.user.id, clientRows[0].id]);
      return res.json({ data: rows });
    }

    const { rows } = await pool.query(`
      SELECT c.id as client_id, c.business_name,
        (SELECT COUNT(*) FROM messages WHERE client_id = c.id AND is_read = 0 AND sender_id != $1) as unread_count,
        (SELECT content FROM messages WHERE client_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE client_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
      FROM clients c
      WHERE EXISTS (SELECT 1 FROM messages WHERE client_id = c.id)
      ORDER BY last_message_at DESC
    `, [req.user.id]);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/thread/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;

    if (req.user.role === 'client') {
      const { rows } = await pool.query('SELECT id FROM clients WHERE user_id = $1', [req.user.id]);
      if (!rows[0] || rows[0].id !== parseInt(clientId)) return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      'UPDATE messages SET is_read = 1 WHERE client_id = $1 AND sender_id != $2',
      [clientId, req.user.id]
    );

    const { rows } = await pool.query(`
      SELECT m.*, u.name as sender_name, u.role as sender_role
      FROM messages m JOIN users u ON m.sender_id = u.id
      WHERE m.client_id = $1 ORDER BY m.created_at ASC
    `, [clientId]);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { content } = req.body;
    let { client_id } = req.body;

    if (!content) return res.status(400).json({ error: 'Content required' });

    if (req.user.role === 'client') {
      const { rows } = await pool.query('SELECT id FROM clients WHERE user_id = $1', [req.user.id]);
      if (!rows[0]) return res.status(400).json({ error: 'Client not found' });
      client_id = rows[0].id;
    }

    if (!client_id) return res.status(400).json({ error: 'Client ID required' });

    const { rows } = await pool.query(
      'INSERT INTO messages (client_id, sender_id, content) VALUES ($1, $2, $3) RETURNING id',
      [client_id, req.user.id, content]
    );

    const { rows: msg } = await pool.query(`
      SELECT m.*, u.name as sender_name, u.role as sender_role
      FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = $1
    `, [rows[0].id]);
    res.status(201).json({ data: msg[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    let count = 0;
    if (req.user.role === 'admin') {
      const { rows } = await pool.query(
        'SELECT COUNT(*) as c FROM messages WHERE is_read = 0 AND sender_id != $1',
        [req.user.id]
      );
      count = parseInt(rows[0].c);
    } else {
      const { rows: clientRows } = await pool.query('SELECT id FROM clients WHERE user_id = $1', [req.user.id]);
      if (clientRows[0]) {
        const { rows } = await pool.query(
          'SELECT COUNT(*) as c FROM messages WHERE client_id = $1 AND is_read = 0 AND sender_id != $2',
          [clientRows[0].id, req.user.id]
        );
        count = parseInt(rows[0].c);
      }
    }
    res.json({ data: { count } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
