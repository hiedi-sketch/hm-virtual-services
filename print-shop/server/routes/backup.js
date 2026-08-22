const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const db = require('../db/database');

const router = express.Router();

/**
 * Download the whole shop as a SQLite file.
 *
 * The database is in WAL mode, so copying the file off disk can miss recent
 * writes. better-sqlite3's backup() takes a consistent snapshot of a live
 * database instead, which is what makes this safe to run mid-print.
 */
router.get('/', async (req, res, next) => {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const tempPath = path.join(os.tmpdir(), `print-shop-backup-${process.pid}-${Date.now()}.sqlite`);

  try {
    await db.backup(tempPath);
    res.download(tempPath, `print-shop-${stamp}.sqlite`, (err) => {
      fs.unlink(tempPath, () => { /* best effort */ });
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    fs.unlink(tempPath, () => {});
    next(err);
  }
});

module.exports = router;
