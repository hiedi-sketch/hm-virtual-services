import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import Badge from '../../components/common/Badge';
import { TableSkeleton } from '../../components/common/LoadingSkeleton';

export default function ClientInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.get('/invoices').then(r => setInvoices(r.data.data)).finally(() => setLoading(false));
  }, []);

  const filtered = filter ? invoices.filter(i => i.status === filter) : invoices;
  const fmt = n => `$${Number(n).toFixed(2)}`;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-primary mb-6">Invoices</h1>

      <div className="card mb-6">
        <div className="flex gap-2 flex-wrap">
          {['', 'sent', 'paid', 'overdue'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === s ? 'bg-primary text-white' : 'bg-linen text-gray-600 hover:bg-greige'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? <TableSkeleton rows={4} /> : filtered.length === 0 ? (
          <p className="text-silver text-sm text-center py-8">No invoices found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-linen">
              <th className="pb-3 text-left label">Invoice #</th>
              <th className="pb-3 text-left label">Status</th>
              <th className="pb-3 text-left label">Date</th>
              <th className="pb-3 text-left label">Due</th>
              <th className="pb-3 text-right label">Amount</th>
              <th className="pb-3 text-right label">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-linen">
              {filtered.map(inv => (
                <tr key={inv.id} className="hover:bg-linen/40">
                  <td className="py-3">
                    <Link to={`/client/invoices/${inv.id}`} className="font-semibold text-primary hover:underline">{inv.invoice_number}</Link>
                  </td>
                  <td className="py-3"><Badge status={inv.status} /></td>
                  <td className="py-3 text-gray-600">{new Date(inv.created_at).toLocaleDateString()}</td>
                  <td className="py-3 text-gray-600">{inv.due_date || '—'}</td>
                  <td className="py-3 text-right font-semibold">{fmt(inv.total)}</td>
                  <td className="py-3 text-right">
                    <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" className="text-xs text-primary hover:underline">Download PDF</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
