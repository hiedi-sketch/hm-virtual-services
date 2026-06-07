const express = require('express');
const { pool, withTransaction } = require('../db/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { generateInvoicePDF } = require('../utils/pdf');

const router = express.Router();
router.use(authenticateToken);

const PREPAY_DISCOUNTS = { 3: 5, 6: 10, 12: 20 };

async function getNextInvoiceNumber() {
  const year = new Date().getFullYear();
  const { rows } = await pool.query(
    `SELECT invoice_number FROM invoices WHERE invoice_number LIKE $1 ORDER BY invoice_number DESC LIMIT 1`,
    [`HM-${year}-%`]
  );
  if (!rows[0]) return `HM-${year}-001`;
  const num = parseInt(rows[0].invoice_number.split('-')[2]) + 1;
  return `HM-${year}-${String(num).padStart(3, '0')}`;
}

async function getSettings() {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

router.get('/', async (req, res) => {
  try {
    const { status, client_id } = req.query;
    let query = `
      SELECT i.*, c.business_name as client_name, c.contact_name
      FROM invoices i JOIN clients c ON i.client_id = c.id WHERE 1=1
    `;
    const params = [];

    if (req.user.role === 'client') {
      const { rows: clientRows } = await pool.query('SELECT id FROM clients WHERE user_id = $1', [req.user.id]);
      if (!clientRows[0]) return res.json({ data: [] });
      params.push(clientRows[0].id);
      query += ` AND i.client_id = $${params.length} AND i.status != 'draft'`;
    } else {
      if (client_id) { params.push(client_id); query += ` AND i.client_id = $${params.length}`; }
      if (status) { params.push(status); query += ` AND i.status = $${params.length}`; }
    }

    query += ' ORDER BY i.created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT i.*, c.business_name as client_name, c.contact_name, c.email as client_email, c.phone as client_phone
      FROM invoices i JOIN clients c ON i.client_id = c.id WHERE i.id = $1
    `, [id]);
    const invoice = rows[0];
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    if (req.user.role === 'client') {
      const { rows: clientRows } = await pool.query('SELECT id FROM clients WHERE user_id = $1', [req.user.id]);
      if (!clientRows[0] || clientRows[0].id !== invoice.client_id || invoice.status === 'draft') {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const { rows: items } = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id', [id]);
    res.json({ data: { ...invoice, items } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { client_id, items, discount_percent = 0, due_date, client_notes, internal_notes, billing_period_start, billing_period_end, status = 'draft' } = req.body;

    if (!client_id || !items || !items.length) {
      return res.status(400).json({ error: 'Client and line items required' });
    }

    const { rows: clientRows } = await pool.query('SELECT * FROM clients WHERE id = $1', [client_id]);
    if (!clientRows[0]) return res.status(404).json({ error: 'Client not found' });

    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const discountAmount = +(subtotal * (discount_percent / 100)).toFixed(2);
    const total = +(subtotal - discountAmount).toFixed(2);
    const invoiceNumber = await getNextInvoiceNumber();

    const invoiceId = await withTransaction(async (pgClient) => {
      const { rows } = await pgClient.query(`
        INSERT INTO invoices (client_id, invoice_number, status, due_date, subtotal, discount_percent, discount_amount, total, client_notes, internal_notes, billing_period_start, billing_period_end)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id
      `, [client_id, invoiceNumber, status, due_date, subtotal, discount_percent, discountAmount, total, client_notes, internal_notes, billing_period_start, billing_period_end]);
      const id = rows[0].id;

      for (const item of items) {
        await pgClient.query(
          'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5)',
          [id, item.description, item.quantity, item.unit_price, +(item.quantity * item.unit_price).toFixed(2)]
        );
      }
      return id;
    });

    const { rows: invoice } = await pool.query(
      `SELECT i.*, c.business_name as client_name FROM invoices i JOIN clients c ON i.client_id = c.id WHERE i.id = $1`,
      [invoiceId]
    );
    const { rows: invoiceItems } = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [invoiceId]);
    res.status(201).json({ data: { ...invoice[0], items: invoiceItems } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
    const invoice = rows[0];
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const { status, due_date, client_notes, internal_notes, items, discount_percent } = req.body;
    const paid_at = status === 'paid' && invoice.status !== 'paid' ? new Date().toISOString() : invoice.paid_at;

    let subtotal = parseFloat(invoice.subtotal);
    let discountAmount = parseFloat(invoice.discount_amount);
    let total = parseFloat(invoice.total);
    const dp = discount_percent !== undefined ? discount_percent : invoice.discount_percent;

    await withTransaction(async (pgClient) => {
      if (items !== undefined) {
        await pgClient.query('DELETE FROM invoice_items WHERE invoice_id = $1', [id]);
        subtotal = 0;
        for (const item of items) {
          const lineTotal = +(item.quantity * item.unit_price).toFixed(2);
          await pgClient.query(
            'INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total) VALUES ($1,$2,$3,$4,$5)',
            [id, item.description, item.quantity, item.unit_price, lineTotal]
          );
          subtotal += lineTotal;
        }
        discountAmount = +(subtotal * (dp / 100)).toFixed(2);
        total = +(subtotal - discountAmount).toFixed(2);
      }

      await pgClient.query(`
        UPDATE invoices SET status=$1, due_date=$2, client_notes=$3, internal_notes=$4,
          subtotal=$5, discount_percent=$6, discount_amount=$7, total=$8, paid_at=$9, updated_at=NOW()
        WHERE id=$10
      `, [
        status ?? invoice.status,
        due_date ?? invoice.due_date,
        client_notes ?? invoice.client_notes,
        internal_notes ?? invoice.internal_notes,
        subtotal, dp, discountAmount, total,
        paid_at, id,
      ]);
    });

    const { rows: updated } = await pool.query(
      `SELECT i.*, c.business_name as client_name FROM invoices i JOIN clients c ON i.client_id = c.id WHERE i.id = $1`,
      [id]
    );
    const { rows: updatedItems } = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = $1', [id]);
    res.json({ data: { ...updated[0], items: updatedItems } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
    const invoice = rows[0];
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    if (req.user.role === 'client') {
      const { rows: clientRows } = await pool.query('SELECT id FROM clients WHERE user_id = $1', [req.user.id]);
      if (!clientRows[0] || clientRows[0].id !== invoice.client_id || invoice.status === 'draft') {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const { rows: clientRows } = await pool.query('SELECT * FROM clients WHERE id = $1', [invoice.client_id]);
    const { rows: items } = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id', [id]);
    const settings = await getSettings();

    generateInvoicePDF(invoice, clientRows[0], items, settings, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate-defaults', requireAdmin, async (req, res) => {
  try {
    const { client_id } = req.body;
    if (!client_id) return res.status(400).json({ error: 'Client ID required' });

    const { rows: clientRows } = await pool.query('SELECT * FROM clients WHERE id = $1', [client_id]);
    const client = clientRows[0];
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const { rows: addons } = await pool.query(
      'SELECT * FROM client_addons WHERE client_id = $1 AND is_active = 1',
      [client_id]
    );
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
        items.push({ description: `Full Service Payroll (${addon.employee_count} employees)`, quantity: 1, unit_price: 75 + addon.employee_count * 5 });
      }
      if (addon.addon_type === 'priority') items.push({ description: 'Priority Services Add-on', quantity: 1, unit_price: 100 });
      if (addon.addon_type === 'state_tax') items.push({ description: 'Additional State Tax Filing', quantity: addon.quantity, unit_price: 50 });
      if (addon.addon_type === 'w2') items.push({ description: 'End of Year W-2', quantity: addon.quantity, unit_price: 250 + (addon.quantity * 2) });
      if (addon.addon_type === '1099') items.push({ description: 'End of Year 1099', quantity: addon.quantity, unit_price: 250 + (addon.quantity * 2) });
    }

    const discount_percent = PREPAY_DISCOUNTS[client.prepay_months] || 0;
    res.json({ data: { items, discount_percent } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
