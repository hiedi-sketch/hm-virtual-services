const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const uploadPath = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.png', '.jpg', '.jpeg', '.xlsx', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

router.get('/', (req, res) => {
  const { client_id, tag } = req.query;
  let query = `
    SELECT d.*, c.business_name as client_name, u.name as uploaded_by_name
    FROM documents d JOIN clients c ON d.client_id = c.id JOIN users u ON d.uploaded_by = u.id WHERE 1=1
  `;
  const params = [];

  if (req.user.role === 'client') {
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (!client) return res.json({ data: [] });
    query += ' AND d.client_id = ?'; params.push(client.id);
  } else {
    if (client_id) { query += ' AND d.client_id = ?'; params.push(client_id); }
  }
  if (tag) { query += ' AND d.tag = ?'; params.push(tag); }
  query += ' ORDER BY d.created_at DESC';

  const docs = db.prepare(query).all(...params);
  res.json({ data: docs });
});

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let { client_id, tag = 'other' } = req.body;

  if (req.user.role === 'client') {
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (!client) return res.status(400).json({ error: 'Client not found' });
    client_id = client.id;
  }

  if (!client_id) return res.status(400).json({ error: 'Client ID required' });

  const id = db.prepare(`
    INSERT INTO documents (client_id, uploaded_by, filename, original_name, mime_type, file_size, tag)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(client_id, req.user.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, tag).lastInsertRowid;

  const doc = db.prepare(`
    SELECT d.*, c.business_name as client_name, u.name as uploaded_by_name
    FROM documents d JOIN clients c ON d.client_id = c.id JOIN users u ON d.uploaded_by = u.id WHERE d.id = ?
  `).get(id);
  res.status(201).json({ data: doc });
});

router.get('/:id/download', (req, res) => {
  const { id } = req.params;
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  if (req.user.role === 'client') {
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (!client || client.id !== doc.client_id) return res.status(403).json({ error: 'Access denied' });
  }

  const filePath = path.join(uploadPath, doc.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  res.download(filePath, doc.original_name);
});

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  if (req.user.role === 'client') {
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (!client || client.id !== doc.client_id || doc.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const filePath = path.join(uploadPath, doc.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
