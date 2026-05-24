const express = require('express');
const db = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

router.get('/threads', (req, res) => {
  if (req.user.role === 'client') {
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (!client) return res.json({ data: [] });

    const thread = db.prepare(`
      SELECT c.id as client_id, c.business_name,
        (SELECT COUNT(*) FROM messages WHERE client_id = c.id AND is_read = 0 AND sender_id != ?) as unread_count,
        (SELECT content FROM messages WHERE client_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
        (SELECT created_at FROM messages WHERE client_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
      FROM clients c WHERE c.id = ?
    `).get(req.user.id, client.id);
    return res.json({ data: thread ? [thread] : [] });
  }

  const threads = db.prepare(`
    SELECT c.id as client_id, c.business_name,
      (SELECT COUNT(*) FROM messages WHERE client_id = c.id AND is_read = 0 AND sender_id != ?) as unread_count,
      (SELECT content FROM messages WHERE client_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT created_at FROM messages WHERE client_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
    FROM clients c
    WHERE EXISTS (SELECT 1 FROM messages WHERE client_id = c.id)
    ORDER BY last_message_at DESC
  `).all(req.user.id);

  res.json({ data: threads });
});

router.get('/thread/:clientId', (req, res) => {
  const { clientId } = req.params;

  if (req.user.role === 'client') {
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (!client || client.id !== parseInt(clientId)) return res.status(403).json({ error: 'Access denied' });
    db.prepare('UPDATE messages SET is_read = 1 WHERE client_id = ? AND sender_id != ?').run(clientId, req.user.id);
  } else {
    db.prepare('UPDATE messages SET is_read = 1 WHERE client_id = ? AND sender_id != ?').run(clientId, req.user.id);
  }

  const messages = db.prepare(`
    SELECT m.*, u.name as sender_name, u.role as sender_role
    FROM messages m JOIN users u ON m.sender_id = u.id
    WHERE m.client_id = ? ORDER BY m.created_at ASC
  `).all(clientId);

  res.json({ data: messages });
});

router.post('/', (req, res) => {
  const { content } = req.body;
  let { client_id } = req.body;

  if (!content) return res.status(400).json({ error: 'Content required' });

  if (req.user.role === 'client') {
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (!client) return res.status(400).json({ error: 'Client not found' });
    client_id = client.id;
  }

  if (!client_id) return res.status(400).json({ error: 'Client ID required' });

  const id = db.prepare(
    'INSERT INTO messages (client_id, sender_id, content) VALUES (?, ?, ?)'
  ).run(client_id, req.user.id, content).lastInsertRowid;

  const msg = db.prepare(`
    SELECT m.*, u.name as sender_name, u.role as sender_role
    FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?
  `).get(id);
  res.status(201).json({ data: msg });
});

router.get('/unread-count', (req, res) => {
  let count = 0;
  if (req.user.role === 'admin') {
    const row = db.prepare('SELECT COUNT(*) as c FROM messages WHERE is_read = 0 AND sender_id != ?').get(req.user.id);
    count = row.c;
  } else {
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (client) {
      const row = db.prepare('SELECT COUNT(*) as c FROM messages WHERE client_id = ? AND is_read = 0 AND sender_id != ?').get(client.id, req.user.id);
      count = row.c;
    }
  }
  res.json({ data: { count } });
});

module.exports = router;
