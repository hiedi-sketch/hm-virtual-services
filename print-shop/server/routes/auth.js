const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const accessToken = (user) =>
  jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  });

const refreshToken = (user) =>
  jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '30d',
  });

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'That email and password do not match' });
  }

  const refresh = refreshToken(user);
  // Sessions are long-lived on purpose: this runs on a tablet at the bench.
  const days = 30;
  db.prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(
    user.id, refresh, new Date(Date.now() + days * 86400000).toISOString()
  );

  res.json({
    accessToken: accessToken(user),
    refreshToken: refresh,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

router.post('/refresh', (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) return res.status(401).json({ error: 'Refresh token required' });

  const stored = db.prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(token);
  if (!stored) return res.status(403).json({ error: 'Invalid refresh token' });

  if (new Date(stored.expires_at) < new Date()) {
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(token);
    return res.status(403).json({ error: 'Refresh token expired' });
  }

  jwt.verify(token, process.env.JWT_REFRESH_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ error: 'Invalid refresh token' });
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(403).json({ error: 'Account not found' });
    res.json({ accessToken: accessToken(user) });
  });
});

router.post('/logout', (req, res) => {
  if (req.body.refreshToken) {
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(req.body.refreshToken);
  }
  res.json({ message: 'Signed out' });
});

router.get('/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Account not found' });
  res.json({ user });
});

router.put('/password', authenticateToken, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'Use at least 8 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(bcrypt.hashSync(new_password, 10), user.id);
  // Signing out everywhere else is the point of changing a password.
  db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(user.id);
  res.json({ message: 'Password updated' });
});

module.exports = router;
