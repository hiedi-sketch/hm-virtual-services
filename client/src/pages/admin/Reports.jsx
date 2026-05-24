import { useState, useEffect } from 'react';
import api from '../../api/axios';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = n => `$${Number(n || 0).toFixed(0)}`;

function BarChart({ data, maxVal }) {
  return (
    <div className="flex items-end gap-2 h-32">
      {data.map((item, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
            <div className="bg-primary/20 rounded-t-sm w-full" style={{ height: `${maxVal ? (item.invoiced / maxVal) * 100 : 0}%`, minHeight: item.invoiced ? 2 : 0 }} title={`Invoiced: ${fmt(item.invoiced)}`} />
          </div>
          <span className="text-xs text-silver">{MONTHS[parseInt(item.month) - 1] || item.month}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminReports() {
  const [tab, setTab] = useState('revenue');
  const [revenue, setRevenue] = useState([]);
  const [profitability, setProfitability] = useState([]);
  const [addons, setAddons] = useState([]);
  const [aging, setAging] = useState({});
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [hourlyRate, setHourlyRate] = useState(75);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/reports/revenue', { params: { year } }),
      api.get('/reports/profitability'),
      api.get('/reports/addons'),
      api.get('/reports/aging'),
    ]).then(([r, p, a, ag]) => {
      setRevenue(r.data.data);
      setProfitability(p.data.data);
      setHourlyRate(p.data.hourly_rate);
      setAddons(a.data.data);
      setAging(ag.data.data);
    }).finally(() => setLoading(false));
  }, [year]);

  const maxRevenue = Math.max(...revenue.map(r => r.invoiced || 0), 1);

  const TABS = [
    { key: 'revenue', label: 'Revenue' },
    { key: 'profitability', label: 'Profitability' },
    { key: 'addons', label: 'Add-on Revenue' },
    { key: 'aging', label: 'Aging Report' },
  ];

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-primary">Reports</h1>
        <select className="input w-28" value={year} onChange={e => setYear(Number(e.target.value))}>
          {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-linen mb-6">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`pb-2 px-1 text-sm font-semibold border-b-2 transition-colors ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-silver hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-silver text-sm">Loading…</div>}

      {tab === 'revenue' && !loading && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="font-bold text-gray-800 mb-4">Revenue by Month — {year}</h2>
            <BarChart data={revenue} maxVal={maxRevenue} />
            <table className="w-full text-sm mt-6">
              <thead><tr className="border-b border-linen">
                <th className="pb-2 text-left label">Month</th>
                <th className="pb-2 text-right label">Invoiced</th>
                <th className="pb-2 text-right label">Collected</th>
                <th className="pb-2 text-right label">Outstanding</th>
              </tr></thead>
              <tbody className="divide-y divide-linen">
                {revenue.map(r => (
                  <tr key={r.month}>
                    <td className="py-2 text-gray-700">{MONTHS[parseInt(r.month) - 1]}</td>
                    <td className="py-2 text-right">{fmt(r.invoiced)}</td>
                    <td className="py-2 text-right text-green-600">{fmt(r.collected)}</td>
                    <td className="py-2 text-right text-red-500">{fmt(r.outstanding)}</td>
                  </tr>
                ))}
                {revenue.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-silver">No data for {year}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'profitability' && !loading && (
        <div className="card">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-bold text-gray-800">Client Profitability</h2>
            <span className="text-xs text-silver">(internal hourly rate: ${hourlyRate}/hr)</span>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-linen">
              <th className="pb-2 text-left label">Client</th>
              <th className="pb-2 text-left label">Package</th>
              <th className="pb-2 text-right label">Hrs Logged</th>
              <th className="pb-2 text-right label">Est. Cost</th>
              <th className="pb-2 text-right label">Revenue</th>
              <th className="pb-2 text-right label">Profit</th>
              <th className="pb-2 text-right label">Margin</th>
            </tr></thead>
            <tbody className="divide-y divide-linen">
              {profitability.map(c => (
                <tr key={c.id}>
                  <td className="py-2 font-medium">{c.business_name}</td>
                  <td className="py-2 capitalize text-gray-600">{c.package_tier}</td>
                  <td className="py-2 text-right">{c.hours_logged}h</td>
                  <td className="py-2 text-right">{fmt(c.estimated_cost)}</td>
                  <td className="py-2 text-right">{fmt(c.revenue)}</td>
                  <td className={`py-2 text-right font-semibold ${c.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{fmt(c.profit)}</td>
                  <td className={`py-2 text-right font-semibold ${c.margin >= 0 ? 'text-green-600' : 'text-red-500'}`}>{c.margin}%</td>
                </tr>
              ))}
              {profitability.length === 0 && <tr><td colSpan={7} className="py-4 text-center text-silver">No clients.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'addons' && !loading && (
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-4">Add-on Revenue Breakdown</h2>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-linen">
              <th className="pb-2 text-left label">Service</th>
              <th className="pb-2 text-right label">Invoices</th>
              <th className="pb-2 text-right label">Revenue</th>
            </tr></thead>
            <tbody className="divide-y divide-linen">
              {addons.map((a, i) => (
                <tr key={i}>
                  <td className="py-2 text-gray-700">{a.description}</td>
                  <td className="py-2 text-right text-gray-600">{a.count}</td>
                  <td className="py-2 text-right font-semibold text-primary">{fmt(a.revenue)}</td>
                </tr>
              ))}
              {addons.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-silver">No invoiced items yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'aging' && !loading && (
        <div className="space-y-4">
          {Object.entries(aging).map(([bucket, invoices]) => (
            <div key={bucket} className="card">
              <h2 className="font-bold text-gray-800 mb-3">{bucket} days overdue <span className="text-silver font-normal">({invoices.length} invoices)</span></h2>
              {invoices.length === 0 ? <p className="text-silver text-sm">None.</p> : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-linen">
                    <th className="pb-2 text-left label">Invoice</th>
                    <th className="pb-2 text-left label">Client</th>
                    <th className="pb-2 text-left label">Due Date</th>
                    <th className="pb-2 text-right label">Amount</th>
                    <th className="pb-2 text-right label">Days Overdue</th>
                  </tr></thead>
                  <tbody className="divide-y divide-linen">
                    {invoices.map(inv => (
                      <tr key={inv.id}>
                        <td className="py-2 text-primary font-medium">{inv.invoice_number}</td>
                        <td className="py-2 text-gray-700">{inv.client_name}</td>
                        <td className="py-2 text-gray-600">{inv.due_date}</td>
                        <td className="py-2 text-right font-semibold">{fmt(inv.total)}</td>
                        <td className="py-2 text-right text-red-500">{Math.floor(inv.days_overdue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
