import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import Badge from '../../components/common/Badge';
import { TableSkeleton } from '../../components/common/LoadingSkeleton';
import toast from 'react-hot-toast';

export default function AdminInvoices() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  function load() {
    setLoading(true);
    api.get('/invoices', { params: { status: statusFilter || undefined } })
      .then(r => setInvoices(r.data.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [statusFilter]);

  async function updateStatus(id, status) {
    await api.put(`/invoices/${id}`, { status });
    toast.success(`Invoice marked as ${status}`);
    load();
  }

  const fmt = n => `$${Number(n).toFixed(2)}`;

  const totals = invoices.reduce((acc, inv) => {
    acc.total += Number(inv.total);
    if (inv.status === 'paid') acc.paid += Number(inv.total);
    if (['sent', 'overdue'].includes(inv.status)) acc.outstanding += Number(inv.total);
    return acc;
  }, { total: 0, paid: 0, outstanding: 0 });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-primary">Invoices</h1>
        <Link to="/admin/invoices/new" className="btn-primary">+ Create Invoice</Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Invoiced', value: fmt(totals.total) },
          { label: 'Collected', value: fmt(totals.paid) },
          { label: 'Outstanding', value: fmt(totals.outstanding) },
        ].map(c => (
          <div key={c.label} className="card">
            <p className="label">{c.label}</p>
            <p className="text-2xl font-bold text-primary mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex gap-2 flex-wrap">
          {['', 'draft', 'sent', 'paid', 'overdue'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${statusFilter === s ? 'bg-primary text-white' : 'bg-linen text-gray-600 hover:bg-greige'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? <TableSkeleton rows={5} /> : invoices.length === 0 ? (
          <p className="text-silver text-sm text-center py-8">No invoices found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-linen">
              <th className="pb-3 text-left label">Invoice #</th>
              <th className="pb-3 text-left label">Client</th>
              <th className="pb-3 text-left label">Status</th>
              <th className="pb-3 text-left label">Due Date</th>
              <th className="pb-3 text-right label">Total</th>
              <th className="pb-3 text-right label">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-linen">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-linen/40">
                  <td className="py-3">
                    <Link to={`/admin/invoices/${inv.id}`} className="font-semibold text-primary hover:underline">{inv.invoice_number}</Link>
                  </td>
                  <td className="py-3 text-gray-700">{inv.client_name}</td>
                  <td className="py-3"><Badge status={inv.status} /></td>
                  <td className="py-3 text-gray-600">{inv.due_date || '—'}</td>
                  <td className="py-3 text-right font-semibold">{fmt(inv.total)}</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1 flex-wrap">
                      {inv.status === 'draft' && <button onClick={() => updateStatus(inv.id, 'sent')} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded hover:bg-blue-100">Send</button>}
                      {inv.status !== 'paid' && inv.status !== 'draft' && <button onClick={() => updateStatus(inv.id, 'paid')} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded hover:bg-green-100">Mark Paid</button>}
                      {inv.status === 'sent' && <button onClick={() => updateStatus(inv.id, 'overdue')} className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded hover:bg-red-100">Overdue</button>}
                      <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" className="text-xs bg-linen text-primary px-2 py-1 rounded hover:bg-greige">PDF</a>
                    </div>
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
