const PDFDocument = require('pdfkit');

const BRAND = {
  primary: '#2B7A8B',
  accent: '#4AAFC4',
  gray: '#B0B5BC',
  light: '#EDE9E3',
};

function generateInvoicePDF(invoice, client, items, settings, res) {
  const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${invoice.invoice_number}.pdf"`);
  doc.pipe(res);

  // Header band
  doc.rect(0, 0, doc.page.width, 120).fill(BRAND.primary);

  // Business name
  doc.fillColor('#FFFFFF').fontSize(22).font('Helvetica-Bold')
    .text(settings.business_name || 'HM Virtual Services', 50, 35);

  doc.fontSize(9).font('Helvetica').fillColor('#FFFFFF');
  if (settings.business_address) doc.text(settings.business_address, 50, 62);
  if (settings.business_email) doc.text(settings.business_email, 50, 74);
  if (settings.business_phone) doc.text(settings.business_phone, 50, 86);

  // Invoice label on right
  doc.fontSize(28).font('Helvetica-Bold').fillColor('#FFFFFF')
    .text('INVOICE', 370, 35, { width: 180, align: 'right' });
  doc.fontSize(11).font('Helvetica').fillColor('#FFFFFF')
    .text(invoice.invoice_number, 370, 68, { width: 180, align: 'right' });

  doc.fillColor('#000000');
  let y = 145;

  // Bill To + Invoice Info columns
  doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND.primary).text('BILL TO', 50, y);
  doc.fontSize(9).font('Helvetica-Bold').fillColor(BRAND.primary).text('INVOICE DETAILS', 350, y);

  y += 16;
  doc.font('Helvetica').fillColor('#333333').fontSize(10)
    .text(client.business_name, 50, y)
    .text(client.contact_name, 50, y + 13)
    .text(client.email, 50, y + 26);
  if (client.phone) doc.text(client.phone, 50, y + 39);

  const infoY = y;
  const labelX = 350, valX = 460;
  const addDetail = (label, value, offset) => {
    doc.font('Helvetica-Bold').fillColor('#555').fontSize(9).text(label, labelX, infoY + offset);
    doc.font('Helvetica').fillColor('#333').fontSize(9).text(value || '—', valX, infoY + offset);
  };
  addDetail('Invoice #:', invoice.invoice_number, 0);
  addDetail('Date:', new Date(invoice.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), 14);
  addDetail('Due Date:', invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—', 28);
  addDetail('Status:', invoice.status.toUpperCase(), 42);
  if (invoice.billing_period_start) {
    const bpStart = new Date(invoice.billing_period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const bpEnd = new Date(invoice.billing_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    addDetail('Period:', `${bpStart} – ${bpEnd}`, 56);
  }

  y += 90;

  // Line items table header
  doc.rect(50, y, doc.page.width - 100, 22).fill(BRAND.primary);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
  doc.text('DESCRIPTION', 58, y + 7);
  doc.text('QTY', 380, y + 7, { width: 50, align: 'right' });
  doc.text('UNIT PRICE', 435, y + 7, { width: 65, align: 'right' });
  doc.text('TOTAL', 505, y + 7, { width: 45, align: 'right' });

  y += 22;
  doc.fillColor('#333').font('Helvetica').fontSize(9);

  let rowAlt = false;
  for (const item of items) {
    if (rowAlt) doc.rect(50, y, doc.page.width - 100, 20).fill('#F5F3F0');
    rowAlt = !rowAlt;

    doc.fillColor('#333')
      .text(item.description, 58, y + 6, { width: 315 })
      .text(Number(item.quantity).toFixed(2), 380, y + 6, { width: 50, align: 'right' })
      .text(`$${Number(item.unit_price).toFixed(2)}`, 435, y + 6, { width: 65, align: 'right' })
      .text(`$${Number(item.total).toFixed(2)}`, 505, y + 6, { width: 45, align: 'right' });
    y += 20;
  }

  y += 10;
  doc.moveTo(350, y).lineTo(doc.page.width - 50, y).strokeColor(BRAND.gray).lineWidth(0.5).stroke();
  y += 8;

  const addTotalRow = (label, value, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor('#333').fontSize(9)
      .text(label, 350, y, { width: 150, align: 'right' })
      .text(value, 505, y, { width: 45, align: 'right' });
    y += 16;
  };

  addTotalRow('Subtotal:', `$${Number(invoice.subtotal).toFixed(2)}`);
  if (invoice.discount_amount > 0) {
    addTotalRow(`Prepay Discount (${invoice.discount_percent}%):`, `-$${Number(invoice.discount_amount).toFixed(2)}`);
  }
  doc.moveTo(350, y).lineTo(doc.page.width - 50, y).strokeColor(BRAND.gray).lineWidth(0.5).stroke();
  y += 6;
  addTotalRow('TOTAL DUE:', `$${Number(invoice.total).toFixed(2)}`, true);

  if (invoice.client_notes) {
    y += 20;
    doc.font('Helvetica-Bold').fillColor(BRAND.primary).fontSize(9).text('NOTES', 50, y);
    y += 14;
    doc.font('Helvetica').fillColor('#555').fontSize(9).text(invoice.client_notes, 50, y, { width: 480 });
  }

  const settings_terms = 'Net 15';
  y += 50;
  doc.rect(50, y, doc.page.width - 100, 1).fill(BRAND.accent);
  y += 10;
  doc.font('Helvetica').fillColor(BRAND.gray).fontSize(8)
    .text(`Payment Terms: ${settings_terms}  |  Thank you for your business!`, 50, y, { width: 480, align: 'center' });

  doc.end();
}

module.exports = { generateInvoicePDF };
