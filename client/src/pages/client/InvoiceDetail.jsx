import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import Badge from '../../components/common/Badge';
import { PageLoader } from '../../components/common/LoadingSkeleton';

export default function ClientInvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/invoices/${id}`).then(r => setInvoice(r.data.data)).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <PageLoader />;
  if (!invoice) return <div className="p-8 text-silver">Invoice not found.</div>;

  const fmt = n => `$${Number(n).toFixed(2)}`;

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="text-silver hover:text-primary text-sm">← Invoices</button>
        <h1 className="text-2xl font-bold text-primary">{invoice.invoice_number}</h1>
        <Badge status={invoice.status} />
        <a href={`/api/invoices/${id}/pdf`} target="_blank" className="ml-auto btn-primary text-sm">Download PDF</a>
      </div>

      <div className="card">
        {/* Header */}
        <div className="bg-primary -mx-6 -mt-6 rounded-t-xl px-8 py-6 mb-8 flex justify-between items-start">
          <div>
            <h2 className="text-white font-bold text-xl">HM Virtual Services</h2>
            <p className="text-white/70 text-sm mt-1">hiedi@hmvirtualservices.com</p>
          </div>
          <div className="text-right">
            <p className="text-white text-2xl font-bold">INVOICE</p>
            <p className="text-white/80 text-sm">{invoice.invoice_number}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="label mb-2">Bill To</p>
            <p className="font-bold text-gray-800">{invoice.client_name}</p>
            <p className="text-sm text-gray-600">{invoice.contact_name}</p>
            <p className="text-sm text-gray-600">{invoice.client_email}</p>
          </div>
          <div className="text-right">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-end gap-8"><dt className="text-silver">Invoice #</dt><dd className="font-medium">{invoice.invoice_number}</dd></div>
              <div className="flex justify-end gap-8"><dt className="text-silver">Date</dt><dd className="font-medium">{new Date(invoice.created_at).toLocaleDateString()}</dd></div>
              <div className="flex justify-end gap-8"><dt className="text-silver">Due</dt><dd className="font-medium">{invoice.due_date || '—'}</dd></div>
              {invoice.billing_period_start && (
                <div className="flex justify-end gap-8"><dt className="text-silver">Period</dt><dd className="font-medium">{invoice.billing_period_start} – {invoice.billing_period_end}</dd></div>
              )}
            </dl>
          </div>
        </div>

        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="bg-linen">
              <th className="text-left py-2 px-3 text-xs font-semibold text-silver uppercase">Description</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-silver uppercase">Qty</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-silver uppercase">Unit Price</th>
              <th className="text-right py-2 px-3 text-xs font-semibold text-silver uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-linen">
            {invoice.items?.map((item, i) => (
              <tr key={i}>
                <td className="py-3 px-3 text-gray-700">{item.description}</td>
                <td className="py-3 px-3 text-right text-gray-600">{item.quantity}</td>
                <td className="py-3 px-3 text-right text-gray-600">{fmt(item.unit_price)}</td>
                <td className="py-3 px-3 text-right font-medium">{fmt(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto max-w-xs space-y-2 text-sm pt-4 border-t border-linen">
          <div className="flex justify-between"><span className="text-silver">Subtotal</span><span>{fmt(invoice.subtotal)}</span></div>
          {invoice.discount_amount > 0 && (
            <div className="flex justify-between text-green-600"><span>Prepay Discount ({invoice.discount_percent}%)</span><span>-{fmt(invoice.discount_amount)}</span></div>
          )}
          <div className="flex justify-between font-bold text-lg border-t border-linen pt-2">
            <span>Total Due</span><span className="text-primary">{fmt(invoice.total)}</span>
          </div>
          {invoice.status === 'paid' && <p className="text-green-600 text-xs text-right">Paid ✓</p>}
        </div>

        {invoice.client_notes && (
          <div className="mt-6 pt-4 border-t border-linen">
            <p className="text-xs font-semibold text-silver uppercase mb-1">Notes</p>
            <p className="text-sm text-gray-600">{invoice.client_notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
