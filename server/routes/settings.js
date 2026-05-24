const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({ data: settings });
});

router.put('/', (req, res) => {
  const allowed = ['business_name', 'business_logo', 'business_address', 'business_email', 'business_phone', 'payment_terms', 'hourly_cost_rate'];
  const upsert = db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `);
  const update = db.transaction(() => {
    for (const key of allowed) {
      if (req.body[key] !== undefined) upsert.run(key, req.body[key]);
    }
  });
  update();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  res.json({ data: Object.fromEntries(rows.map(r => [r.key, r.value])), message: 'Settings saved' });
});

router.put('/password', (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'Password updated' });
});

module.exports = router;
