import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import Badge from '../../components/common/Badge';
import { TableSkeleton } from '../../components/common/LoadingSkeleton';
import toast from 'react-hot-toast';

const TIER_LABELS = { essentials: 'Essentials', growth: 'Growth', scale: 'Scale', full_service: 'Full Service' };
const TIER_PRICES = { essentials: 250, growth: 350, scale: 500, full_service: 800 };
const VA_TIER_LABELS = { time_saver: 'Time Saver', time_multiplier: 'Time Multiplier', time_freedom: 'Time Freedom', agency: 'Agency' };
const VA_TIER_PRICES = { time_saver: 400, time_multiplier: 700, time_freedom: 1200, agency: 0 };

export default function AdminClients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [vaUsedMins, setVaUsedMins] = useState(0);

  function load() {
    setLoading(true);
    api.get('/clients', { params: { status: statusFilter || undefined, search: search || undefined } })
      .then(r => setClients(r.data.data))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [statusFilter]);

  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const start = `${y}-${m}-01`;
    const end = new Date(y, now.getMonth() + 1, 0).toISOString().split('T')[0];
    api.get('/time-entries', { params: { task_type: 'va', start_date: start, end_date: end } })
      .then(r => setVaUsedMins(r.data.data.reduce((sum, e) => {
        // Support both new (duration_seconds) and legacy (duration_minutes) entries
        const secs = e.duration_seconds != null ? e.duration_seconds : (e.duration_minutes || 0) * 60;
        return sum + secs / 60;
      }, 0)));
  }, []);

  function StatCard({ label, value, icon }) {
  return (
    <div className="card border-t-4 border-primary h-30 w-full">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-xl">{icon}</span>}
        <p className="text-sm text-black text-left font-medium">{label}</p>
      </div>
      <p className="text-3xl font-bold text-primary text-center mt-1">{value ?? '—'}</p>
    </div>
  );
}

  function handleSearch(e) {
    e.preventDefault();
    load();
  }

  async function toggleArchive(client) {
    await api.patch(`/clients/${client.id}/archive`);
    toast.success(`Client ${client.status === 'active' ? 'archived' : 'reactivated'}`);
    load();
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-primary">Clients</h1>
        <Link to="/admin/clients/new" className="btn-primary">+ Add Client</Link>
      </div>

      {/* Search & Filter */}
      <div className="card mb-6">
        <div className="flex flex-wrap gap-3 items-center">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-64">
            <input
              className="input flex-1"
              placeholder="Search by name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button type="submit" className="btn-secondary px-3">Search</button>
          </form>
          <select className="input w-36" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="flex justify-center mb-6">
        <div className="grid md:grid-cols-4 gap-6 w-full">
          <StatCard
            icon="👥"
            label="Total Active Clients"
            value={clients.filter(c => c.status === 'active').length}
          />
          <StatCard
            icon="💰"
            label="Monthly Recurring Revenue"
            value={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
              clients.filter(c => c.status === 'active').reduce((sum, c) => {
                // Use stored package_price (supports custom pricing & no_bk_package=$0)
                const bkPrice = c.no_bk_package ? 0 : (c.package_price ?? TIER_PRICES[c.package_tier] ?? 0);
                // Use stored va_package_price if set, else fall back to tier default
                const vaPrice = c.va_package_price != null ? c.va_package_price : (VA_TIER_PRICES[c.va_package_tier] || 0);
                const addonsTotal = (c.addons || []).reduce((aSum, a) => {
                  if (a.addon_type === 'cleanup')  return aSum + 149;
                  if (a.addon_type === 'payroll')  return aSum + 75 + (a.employee_count * 5);
                  if (a.addon_type === 'priority') return aSum + 100;
                  return aSum;
                }, 0);
                return sum + bkPrice + vaPrice + addonsTotal;
              }, 0)
            )}
          />
          <StatCard
            icon="📦"
            label="Monthly Budgeted VA Hours"
            value={`${clients.filter(c => c.status === 'active').reduce((sum, c) => sum + (c.expected_hours_per_month || 0), 0)} hrs`}
          />
          <StatCard
            icon="⏱️"
            label="VA Hours Used This Month"
            value={`${(vaUsedMins / 60).toFixed(1)} hrs`}
          />
        </div>
      </div>

      

      {/* Clients Table */}
      <div className="card">
        {loading ? <TableSkeleton rows={4} /> : clients.length === 0 ? (
          <p className="text-silver text-sm text-center py-8">No clients found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-linen text-left">
                <th className="pb-3 font-semibold text-black uppercase text-xs tracking-wide">Contact</th>
                <th className="pb-3 font-semibold text-black uppercase text-xs tracking-wide">Business</th>
                <th className="pb-3 font-semibold text-black uppercase text-xs tracking-wide">BK Package</th>
                <th className="pb-3 font-semibold text-black uppercase text-xs tracking-wide">VA Package</th>
                <th className="pb-3 font-semibold text-black uppercase text-xs tracking-wide">Budgeted Hours</th>
                <th className="pb-3 font-semibold text-black uppercase text-xs tracking-wide">Add-ons</th>
                <th className="pb-3 font-semibold text-black uppercase text-xs tracking-wide text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-linen">
              {clients.map(c => (
                <tr key={c.id} className="hover:bg-linen/40">
                  <td className="py-3">
                    <Link to={`/admin/clients/${c.id}`} className="font-semibold text-primary hover:underline">
                      {c.contact_name || c.business_name}
                    </Link>
                    <p className="text-xs text-black">{c.email}</p>
                  </td>
                  <td className="py-3 text-gray-700">{c.business_name}</td>
                  <td className="py-3">
                    <Badge status={c.no_bk_package ? 'no_bk' : c.package_tier} />
                    <span className="block text-xs text-black mt-0.5">${c.no_bk_package ? 0 : (c.package_price ?? TIER_PRICES[c.package_tier] ?? 0)}/mo</span>
                  </td>
                  <td className="py-3">
                    {c.va_package_tier ? <Badge status={c.va_package_tier} /> : <span className="text-xs text-silver">None</span>}
                    <span className="block text-xs text-black mt-0.5">
                      {c.va_package_tier ? `$${c.va_package_price != null ? c.va_package_price : (VA_TIER_PRICES[c.va_package_tier] ?? 0)}/mo` : ''}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-1">
                      {c.expected_hours_per_month} hrs/mo
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.addons || []).map(a => (
                        <span key={a.id} className="text-xs bg-accent/10 text-primary px-2 py-0.5 rounded-full capitalize">{a.addon_type}</span>
                      ))}
                      {(!c.addons || c.addons.length === 0) && <span className="text-xs text-silver">None</span>}
                    </div>
                  </td>
                  <td className="py-3 text-center">
                    <Link to={`/admin/clients/${c.id}/edit`} className="btn-ghost text-xs py-1 px-2 mr-1">Edit</Link>
                    <button onClick={() => toggleArchive(c)} className="text-xs text-red-800 hover:text-gray-700 py-1 px-2">
                      {c.status === 'active' ? 'Archive' : 'Reactivate'}
                    </button>
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