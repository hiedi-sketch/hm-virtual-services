const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const uploadPath = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

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

router.get('/', async (req, res) => {
  try {
    const { client_id, tag } = req.query;
    let query = `
      SELECT d.*, c.business_name as client_name, u.name as uploaded_by_name
      FROM documents d JOIN clients c ON d.client_id = c.id JOIN users u ON d.uploaded_by = u.id WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'client') {
      const { rows: clientRows } = await pool.query('SELECT id FROM clients WHERE user_id = $1', [req.user.id]);
      if (!clientRows[0]) return res.json({ data: [] });
      params.push(clientRows[0].id);
      query += ` AND d.client_id = $${params.length}`;
    } else {
      if (client_id) { params.push(client_id); query += ` AND d.client_id = $${params.length}`; }
    }
    if (tag) { params.push(tag); query += ` AND d.tag = $${params.length}`; }
    query += ' ORDER BY d.created_at DESC';

    const { rows } = await pool.query(query, params);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let { client_id, tag = 'other' } = req.body;

    if (req.user.role === 'client') {
      const { rows } = await pool.query('SELECT id FROM clients WHERE user_id = $1', [req.user.id]);
      if (!rows[0]) return res.status(400).json({ error: 'Client not found' });
      client_id = rows[0].id;
    }

    if (!client_id) return res.status(400).json({ error: 'Client ID required' });

    const { rows } = await pool.query(`
      INSERT INTO documents (client_id, uploaded_by, filename, original_name, mime_type, file_size, tag)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id
    `, [client_id, req.user.id, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, tag]);

    const { rows: doc } = await pool.query(`
      SELECT d.*, c.business_name as client_name, u.name as uploaded_by_name
      FROM documents d JOIN clients c ON d.client_id = c.id JOIN users u ON d.uploaded_by = u.id WHERE d.id = $1
    `, [rows[0].id]);
    res.status(201).json({ data: doc[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    const doc = rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    if (req.user.role === 'client') {
      const { rows: clientRows } = await pool.query('SELECT id FROM clients WHERE user_id = $1', [req.user.id]);
      if (!clientRows[0] || clientRows[0].id !== doc.client_id) return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = path.join(uploadPath, doc.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    res.download(filePath, doc.original_name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    const doc = rows[0];
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    if (req.user.role === 'client') {
      const { rows: clientRows } = await pool.query('SELECT id FROM clients WHERE user_id = $1', [req.user.id]);
      if (!clientRows[0] || clientRows[0].id !== doc.client_id || doc.uploaded_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const filePath = path.join(uploadPath, doc.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query('DELETE FROM documents WHERE id = $1', [id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
