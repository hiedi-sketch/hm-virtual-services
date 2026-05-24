const express = require('express');
const db = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { generateInvoicePDF } = require('../utils/pdf');

const router = express.Router();
router.use(authenticateToken);

const PREPAY_DISCOUNTS = { 3: 5, 6: 10, 12: 20 };

function getNextInvoiceNumber() {
  const year = new Date().getFullYear();
  const last = db.prepare(
    `SELECT invoice_number FROM invoices WHERE invoice_number LIKE 'HM-${year}-%' ORDER BY invoice_number DESC LIMIT 1`
  ).get();
  if (!last) return `HM-${year}-001`;
  const num = parseInt(last.invoice_number.split('-')[2]) + 1;
  return `HM-${year}-${String(num).padStart(3, '0')}`;
}

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

router.get('/', (req, res) => {
  const { status, client_id } = req.query;
  let query = `
    SELECT i.*, c.business_name as client_name, c.contact_name
    FROM invoices i JOIN clients c ON i.client_id = c.id WHERE 1=1
  `;
  const params = [];

  if (req.user.role === 'client') {
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (!client) return res.json({ data: [] });
    query += " AND i.client_id = ? AND i.status != 'draft'";
    params.push(client.id);
  } else {
    if (client_id) { query += ' AND i.client_id = ?'; params.push(client_id); }
    if (status) { query += ' AND i.status = ?'; params.push(status); }
  }

  query += ' ORDER BY i.created_at DESC';
  const invoices = db.prepare(query).all(...params);
  res.json({ data: invoices });
});

router.get('/:id', (req, res) => {
  const { id } = req.params;
  const invoice = db.prepare(`
    SELECT i.*, c.business_name as client_name, c.contact_name, c.email as client_email, c.phone as client_phone
    FROM invoices i JOIN clients c ON i.client_id = c.id WHERE i.id = ?
  `).get(id);

  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  if (req.user.role === 'client') {
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (!client || client.id !== invoice.client_id || invoice.status === 'draft') {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').all(id);
  res.json({ data: { ...invoice, items } });
});

router.post('/', requireAdmin, (req, res) => {
  const { client_id, items, discount_percent = 0, due_date, client_notes, internal_notes, billing_period_start, billing_period_end, status = 'draft' } = req.body;

  if (!client_id || !items || !items.length) {
    return res.status(400).json({ error: 'Client and line items required' });
  }

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  const discountAmount = +(subtotal * (discount_percent / 100)).toFixed(2);
  const total = +(subtotal - discountAmount).toFixed(2);
  const invoiceNumber = getNextInvoiceNumber();

  const tx = db.transaction(() => {
    const invoiceId = db.prepare(`
      INSERT INTO invoices (client_id, invoice_number, status, due_date, subtotal, discount_percent, discount_amount, total, client_notes, internal_notes, billing_period_start, billing_period_end)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(client_id, invoiceNumber, status, due_date, subtotal, discount_percent, discountAmount, total, client_notes, internal_notes, billing_period_start, billing_period_end).lastInsertRowid;

    const insertItem = db.prepare(
      'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)'
    );
    for (const item of items) {
      insertItem.run(invoiceId, item.description, item.quantity, item.unit_price, +(item.quantity * item.unit_price).toFixed(2));
    }
    return invoiceId;
  });

  const invoiceId = tx();
  const invoice = db.prepare(`
    SELECT i.*, c.business_name as client_name FROM invoices i JOIN clients c ON i.client_id = c.id WHERE i.id = ?
  `).get(invoiceId);
  const invoiceItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId);
  res.status(201).json({ data: { ...invoice, items: invoiceItems } });
});

router.put('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  const { status, due_date, client_notes, internal_notes, items, discount_percent } = req.body;
  const paid_at = status === 'paid' && invoice.status !== 'paid' ? new Date().toISOString() : invoice.paid_at;

  let subtotal = invoice.subtotal;
  let discountAmount = invoice.discount_amount;
  let total = invoice.total;
  const dp = discount_percent !== undefined ? discount_percent : invoice.discount_percent;

  const tx = db.transaction(() => {
    if (items !== undefined) {
      db.prepare('DELETE FROM invoice_items WHERE invoice_id = ?').run(id);
      const insertItem = db.prepare(
        'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?)'
      );
      subtotal = 0;
      for (const item of items) {
        const lineTotal = +(item.quantity * item.unit_price).toFixed(2);
        insertItem.run(id, item.description, item.quantity, item.unit_price, lineTotal);
        subtotal += lineTotal;
      }
      discountAmount = +(subtotal * (dp / 100)).toFixed(2);
      total = +(subtotal - discountAmount).toFixed(2);
    }

    db.prepare(`
      UPDATE invoices SET status=?, due_date=?, client_notes=?, internal_notes=?, subtotal=?, discount_percent=?, discount_amount=?, total=?, paid_at=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      status ?? invoice.status,
      due_date ?? invoice.due_date,
      client_notes ?? invoice.client_notes,
      internal_notes ?? invoice.internal_notes,
      subtotal, dp, discountAmount, total,
      paid_at, id
    );
  });

  tx();
  const updated = db.prepare(`
    SELECT i.*, c.business_name as client_name FROM invoices i JOIN clients c ON i.client_id = c.id WHERE i.id = ?
  `).get(id);
  const updatedItems = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id);
  res.json({ data: { ...updated, items: updatedItems } });
});

router.get('/:id/pdf', (req, res) => {
  const { id } = req.params;
  const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

  if (req.user.role === 'client') {
    const client = db.prepare('SELECT id FROM clients WHERE user_id = ?').get(req.user.id);
    if (!client || client.id !== invoice.client_id || invoice.status === 'draft') {
      return res.status(403).json({ error: 'Access denied' });
    }
  }

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(invoice.client_id);
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').all(id);
  const settings = getSettings();

  generateInvoicePDF(invoice, client, items, settings, res);
});

router.post('/generate-defaults', requireAdmin, (req, res) => {
  const { client_id } = req.body;
  if (!client_id) return res.status(400).json({ error: 'Client ID required' });

  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(client_id);
  if (!client) return res.status(404).json({ error: 'Client not found' });

  const addons = db.prepare('SELECT * FROM client_addons WHERE client_id = ? AND is_active = 1').all(client_id);
  const PACKAGE_LABELS = { essentials: 'Essentials', growth: 'Growth', scale: 'Scale', full_service: 'Full Service' };

  const items = [];
  items.push({
    description: `${PACKAGE_LABELS[client.package_tier]} Package — Monthly Bookkeeping`,
    quantity: 1,
    unit_price: client.package_price,
  });

  for (const addon of addons) {
    if (addon.addon_type === 'cleanup') items.push({ description: 'Clean Up/Catch-Up Add-on', quantity: 1, unit_price: 149 });
    if (addon.addon_type === 'payroll') {
      const base = 75;
      const perEmp = addon.employee_count * 5;
      items.push({ description: `Full Service Payroll (${addon.employee_count} employees)`, quantity: 1, unit_price: base + perEmp });
    }
    if (addon.addon_type === 'priority') items.push({ description: 'Priority Services Add-on', quantity: 1, unit_price: 100 });
    if (addon.addon_type === 'state_tax') items.push({ description: 'Additional State Tax Filing', quantity: addon.quantity, unit_price: 50 });
    if (addon.addon_type === 'w2') items.push({ description: 'End of Year W-2', quantity: addon.quantity, unit_price: 250 + (addon.quantity * 2) });
    if (addon.addon_type === '1099') items.push({ description: 'End of Year 1099', quantity: addon.quantity, unit_price: 250 + (addon.quantity * 2) });
  }

  const discount_percent = PREPAY_DISCOUNTS[client.prepay_months] || 0;
  res.json({ data: { items, discount_percent } });
});

module.exports = router;
