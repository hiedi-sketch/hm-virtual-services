const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
  );
}

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, refreshToken, expires);

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role, name: user.name }
  });
});

router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

  const stored = db.prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(refreshToken);
  if (!stored) return res.status(403).json({ error: 'Invalid refresh token' });

  if (new Date(stored.expires_at) < new Date()) {
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
    return res.status(403).json({ error: 'Refresh token expired' });
  }

  jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ error: 'Invalid refresh token' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(403).json({ error: 'User not found' });

    const accessToken = generateAccessToken(user);
    res.json({ accessToken });
  });
});

router.post('/logout', (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(refreshToken);
  }
  res.json({ message: 'Logged out' });
});

router.get('/me', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT id, email, role, name FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  let clientData = null;
  if (user.role === 'client') {
    clientData = db.prepare('SELECT * FROM clients WHERE user_id = ?').get(user.id);
    if (clientData) {
      const addons = db.prepare('SELECT * FROM client_addons WHERE client_id = ? AND is_active = 1').all(clientData.id);
      clientData = { ...clientData, addons };
    }
  }
  res.json({ user, client: clientData });
});

router.put('/me/password', authenticateToken, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const bcrypt = require('bcryptjs');
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'Password updated' });
});

module.exports = router;
