import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../../api/axios';
import Badge from '../../components/common/Badge';
import { PageLoader } from '../../components/common/LoadingSkeleton';
import toast from 'react-hot-toast';

const ADDON_LABELS = { cleanup: 'Clean Up/Catch-Up', payroll: 'Full Service Payroll', w2: 'End of Year W-2', '1099': 'End of Year 1099', state_tax: 'State Tax Filing', priority: 'Priority Services' };
const TIER_PRICES = { essentials: 250, growth: 350, scale: 500, full_service: 800 };
const VA_TIER_PRICES = { time_saver: 400, time_multiplier: 700, time_freedom: 1200, agency: 0 };
const VA_TIER_HOURS = { time_saver: 10, time_multiplier: 20, time_freedom: 40, agency: 0 };
const VA_TIER_LABELS = { time_saver: 'Time Saver', time_multiplier: 'Time Multiplier', time_freedom: 'Time Freedom', agency: 'Agency' };

const BK_PACKAGES = [
  { value: 'none',         label: 'No BK Package',  price: 0 },
  { value: 'essentials',   label: 'Essentials',      price: 250 },
  { value: 'growth',       label: 'Growth',          price: 350 },
  { value: 'scale',        label: 'Scale',           price: 500 },
  { value: 'full_service', label: 'Full Service',    price: 800 },
];
const VA_PACKAGES = [
  { value: '',                label: 'No VA Package',                 price: 0,    hours: 0 },
  { value: 'time_saver',      label: 'Time Saver — 10 hrs',          price: 400,  hours: 10 },
  { value: 'time_multiplier', label: 'Time Multiplier — 20 hrs',     price: 700,  hours: 20 },
  { value: 'time_freedom',    label: 'Time Freedom — 40 hrs',        price: 1200, hours: 40 },
  { value: 'agency',          label: 'Agency (invoiced separately)',  price: 0,    hours: 0 },
];
const PREPAY_OPTIONS = [
  { value: 0, label: 'No prepay' },
  { value: 3, label: '3 months (5% off)' },
  { value: 6, label: '6 months (10% off)' },
  { value: 12, label: 'Annual / 12 months (20% off)' },
];

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function getVaPeriod(resetDay) {
  const today = new Date();
  const d = today.getDate();
  const y = today.getFullYear();
  const mo = today.getMonth();
  let startDate, endDate;
  if (d >= resetDay) {
    startDate = new Date(y, mo, resetDay);
    endDate = new Date(y, mo + 1, resetDay - 1);
  } else {
    startDate = new Date(y, mo - 1, resetDay);
    endDate = new Date(y, mo, resetDay - 1);
  }
  const fmt = dt => dt.toISOString().split('T')[0];
  const lbl = dt => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return { start: fmt(startDate), end: fmt(endDate), label: `${lbl(startDate)} – ${lbl(endDate)}` };
}

function Tab({ label, active, onClick }) {
  return (
    <button onClick={onClick}
      className={`pb-2 px-1 text-sm font-semibold border-b-2 transition-colors ${active ? 'border-primary text-primary' : 'border-transparent text-silver hover:text-gray-700'}`}>
      {label}
    </button>
  );
}

export default function AdminClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [vaUsedMins, setVaUsedMins] = useState(0);
  const [vaPeriod, setVaPeriod] = useState({ label: '' });

  // Inline edit state
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingPackage, setEditingPackage] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [packageDraft, setPackageDraft] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get(`/clients/${id}`),
      api.get('/invoices', { params: { client_id: id } }),
      api.get('/tasks', { params: { client_id: id } }),
    ]).then(([c, inv, t]) => {
      const clientData = c.data.data;
      setClient(clientData);
      setInvoices(inv.data.data);
      setTasks(t.data.data);
      const period = getVaPeriod(clientData.va_hours_reset_day || 1);
      setVaPeriod(period);
      return api.get('/time-entries', {
        params: { client_id: id, task_type: 'va', start_date: period.start, end_date: period.end },
      });
    }).then(va => {
      setVaUsedMins(va.data.data.reduce((sum, e) => {
        const secs = e.duration_seconds != null ? e.duration_seconds : (e.duration_minutes || 0) * 60;
        return sum + secs / 60;
      }, 0));
    }).finally(() => setLoading(false));
  }, [id]);

  async function toggle() {
    await api.patch(`/clients/${id}/archive`);
    toast.success('Client status updated');
    api.get(`/clients/${id}`).then(r => setClient(r.data.data));
  }

  function startEditNotes() {
    setNotesDraft(client.notes || '');
    setEditingNotes(true);
  }

  async function saveNotes() {
    setSaving(true);
    try {
      await api.put(`/clients/${id}`, { notes: notesDraft });
      setClient(c => ({ ...c, notes: notesDraft }));
      setEditingNotes(false);
      toast.success('Notes saved');
    } catch {
      toast.error('Failed to save notes');
    } finally {
      setSaving(false);
    }
  }

  function startEditPackage() {
    setPackageDraft({
      package_tier: client.no_bk_package ? 'none' : client.package_tier,
      package_price: client.package_price ?? 0,
      no_bk_package: !!client.no_bk_package,
      va_package_tier: client.va_package_tier || '',
      va_package_price: client.va_package_price ?? 0,
      expected_hours_per_month: client.expected_hours_per_month || 0,
      prepay_months: client.prepay_months || 0,
      billing_cycle_start: client.billing_cycle_start || '',
      employee_count: client.employee_count || 0,
      va_hours_reset_day: client.va_hours_reset_day || 1,
    });
    setEditingPackage(true);
  }

  async function savePackage() {
    setSaving(true);
    try {
      await api.put(`/clients/${id}`, packageDraft);
      const r = await api.get(`/clients/${id}`);
      setClient(r.data.data);
      setEditingPackage(false);
      toast.success('Package updated');
    } catch {
      toast.error('Failed to save package');
    } finally {
      setSaving(false);
    }
  }

  function handlePackageBkTier(e) {
    const tier = e.target.value;
    const pkg = BK_PACKAGES.find(p => p.value === tier);
    setPackageDraft(d => ({
      ...d,
      package_tier: tier,
      package_price: pkg?.price ?? d.package_price,
      no_bk_package: tier === 'none',
    }));
  }

  function handlePackageVaTier(e) {
    const tier = e.target.value;
    const pkg = VA_PACKAGES.find(p => p.value === tier);
    setPackageDraft(d => ({
      ...d,
      va_package_tier: tier,
      va_package_price: pkg?.price ?? d.va_package_price,
      expected_hours_per_month: pkg?.hours ?? d.expected_hours_per_month,
    }));
  }

  if (loading) return <PageLoader />;
  if (!client) return <div className="p-8 text-silver">Client not found.</div>;

  const bkPrice = client.no_bk_package ? 0 : (client.package_price ?? TIER_PRICES[client.package_tier] ?? 0);
  const vaPrice = client.va_package_price != null ? client.va_package_price : (VA_TIER_PRICES[client.va_package_tier] || 0);
  const monthlyTotal = bkPrice + vaPrice +
    (client.addons || []).reduce((sum, a) => {
      if (a.addon_type === 'cleanup') return sum + 149;
      if (a.addon_type === 'payroll') return sum + 75 + (a.employee_count * 5);
      if (a.addon_type === 'priority') return sum + 100;
      return sum;
    }, 0);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => navigate(-1)} className="text-black text-sm mb-2 hover:text-primary">← Clients</button>
          <h1 className="text-2xl font-bold text-primary">{client.business_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge status={client.status} />
            <Badge status={client.package_tier} />
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/admin/clients/${id}/edit`} className="btn-secondary">Edit</Link>
          <button onClick={toggle} className="btn-ghost text-sm">
            {client.status === 'active' ? 'Archive' : 'Reactivate'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-6 border-b border-linen mb-6">
        {['overview', 'invoices', 'tasks', 'documents', 'messages'].map(t => (
          <Tab key={t} label={t.charAt(0).toUpperCase() + t.slice(1)} active={tab === t} onClick={() => setTab(t)} />
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">

            {/* Contact Info — read only */}
            <div className="card">
              <h2 className="font-bold text-gray-800 mb-3">Contact Information</h2>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="label">Contact Name</dt><dd>{client.contact_name}</dd></div>
                <div><dt className="label">Email</dt><dd>{client.email}</dd></div>
                <div><dt className="label">Phone</dt><dd>{client.phone || '—'}</dd></div>
                <div><dt className="label">Website</dt><dd>{client.website || '—'}</dd></div>
              </dl>
            </div>

            {/* Package Details — inline editable */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-gray-800">Package Details</h2>
                {!editingPackage && (
                  <button onClick={startEditPackage} className="btn-ghost text-xs">Edit</button>
                )}
              </div>

              {editingPackage ? (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">BK Package</label>
                      <select className="input" value={packageDraft.package_tier} onChange={handlePackageBkTier}>
                        {BK_PACKAGES.map(p => (
                          <option key={p.value} value={p.value}>{p.label} — ${p.price}/mo</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">BK Price / Month ($)</label>
                      <input type="number" min={0} className="input"
                        value={packageDraft.package_price ?? 0}
                        disabled={packageDraft.package_tier === 'none'}
                        onChange={e => setPackageDraft(d => ({ ...d, package_price: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label className="label">VA Package</label>
                      <select className="input" value={packageDraft.va_package_tier} onChange={handlePackageVaTier}>
                        {VA_PACKAGES.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">VA Price / Month ($)</label>
                      <input type="number" min={0} className="input"
                        value={packageDraft.va_package_price ?? 0}
                        disabled={!packageDraft.va_package_tier}
                        onChange={e => setPackageDraft(d => ({ ...d, va_package_price: Number(e.target.value) }))} />
                    </div>
                    <div>
                      <label className="label">VA Hours Budget/Month</label>
                      <input type="number" min={0} className="input"
                        value={packageDraft.expected_hours_per_month}
                        onChange={e => setPackageDraft(d => ({ ...d, expected_hours_per_month: Number(e.target.value) }))} />
                      <p className="text-xs text-silver mt-1">Auto-filled by VA package. Override if needed.</p>
                    </div>
                    <div>
                      <label className="label">VA Hours Reset Day</label>
                      <input type="number" min={1} max={28} className="input"
                        value={packageDraft.va_hours_reset_day || 1}
                        onChange={e => setPackageDraft(d => ({ ...d, va_hours_reset_day: Number(e.target.value) }))} />
                      <p className="text-xs text-silver mt-1">Day of month hours reset (1–28).</p>
                    </div>
                    <div>
                      <label className="label">Prepay</label>
                      <select className="input" value={packageDraft.prepay_months}
                        onChange={e => setPackageDraft(d => ({ ...d, prepay_months: Number(e.target.value) }))}>
                        {PREPAY_OPTIONS.map(p => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Billing Start</label>
                      <input type="date" className="input" value={packageDraft.billing_cycle_start}
                        onChange={e => setPackageDraft(d => ({ ...d, billing_cycle_start: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">Employees</label>
                      <input type="number" min={0} className="input" value={packageDraft.employee_count}
                        onChange={e => setPackageDraft(d => ({ ...d, employee_count: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={savePackage} disabled={saving} className="btn-primary text-sm">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingPackage(false)} className="btn-secondary text-sm">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="label">BK Package</dt><dd><Badge status={client.no_bk_package ? 'no_bk' : client.package_tier} /></dd></div>
                    <div><dt className="label">BK Price</dt><dd>${bkPrice}/mo</dd></div>
                    <div><dt className="label">VA Package</dt><dd>{client.va_package_tier ? <Badge status={client.va_package_tier} /> : '—'}</dd></div>
                    <div><dt className="label">VA Price</dt><dd>{client.va_package_tier ? `$${vaPrice}/mo` : '—'}</dd></div>
                    <div><dt className="label">VA Hours Budget</dt><dd>{client.expected_hours_per_month} hrs/mo{client.va_package_tier && client.expected_hours_per_month !== VA_TIER_HOURS[client.va_package_tier] ? ' (custom)' : ''}</dd></div>
                    <div><dt className="label">VA Hours Reset</dt><dd>{ordinal(client.va_hours_reset_day || 1)} of each month</dd></div>
                    <div><dt className="label">Prepay</dt><dd>{client.prepay_months ? `${client.prepay_months} months` : 'None'}</dd></div>
                    <div><dt className="label">Billing Start</dt><dd>{client.billing_cycle_start || '—'}</dd></div>
                    <div><dt className="label">Employees</dt><dd>{client.employee_count}</dd></div>
                    <div><dt className="label">Monthly Total</dt><dd className="font-bold text-primary">${monthlyTotal}/mo</dd></div>
                  </dl>
                  {client.addons?.length > 0 && (
                    <div className="mt-4">
                      <dt className="label">Active Add-ons</dt>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {client.addons.map(a => (
                          <span key={a.id} className="text-xs bg-accent/10 text-primary px-2 py-1 rounded-full">
                            {ADDON_LABELS[a.addon_type]}
                            {a.addon_type === 'payroll' && ` (${a.employee_count} emp)`}
                            {a.addon_type === 'state_tax' && ` (${a.quantity} states)`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Internal Notes — inline editable, always visible */}
            <div className="card border-l-4 border-yellow-400">
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-bold text-gray-800">Internal Notes</h2>
                {!editingNotes && (
                  <button onClick={startEditNotes} className="btn-ghost text-xs">Edit</button>
                )}
              </div>
              {editingNotes ? (
                <div className="space-y-3">
                  <textarea
                    className="input min-h-24 w-full"
                    value={notesDraft}
                    onChange={e => setNotesDraft(e.target.value)}
                    placeholder="Add internal notes…"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={saveNotes} disabled={saving} className="btn-primary text-sm">
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingNotes(false)} className="btn-secondary text-sm">Cancel</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                  {client.notes || <span className="text-silver italic">No notes yet. Click Edit to add some.</span>}
                </p>
              )}
            </div>

          </div>

          {/* Sidebar stats */}
          <div className="space-y-4">
            <div className="card text-center">
              <p className="label">Invoices</p>
              <p className="text-3xl font-bold text-primary">{invoices.length}</p>
              <Link to={`/admin/invoices/new`} className="btn-primary mt-3 w-full block text-center">New Invoice</Link>
            </div>
            <div className="card text-center">
              <p className="label">Open Tasks</p>
              <p className="text-3xl font-bold text-primary">{tasks.filter(t => t.status !== 'done').length}</p>
            </div>
            <div className="card">
              <p className="label mb-2 text-black">VA Hours — {vaPeriod.label || '…'}</p>
              {(() => {
                const budget = client.expected_hours_per_month || 0;
                const used = vaUsedMins / 60;
                const pct = budget > 0 ? Math.min((used / budget) * 100, 100) : 0;
                const over = used > budget;
                const barColor = over ? 'bg-red-400' : pct >= 80 ? 'bg-yellow-400' : 'bg-primary';
                return (
                  <>
                    <p className="text-2xl font-bold text-primary">
                      {used.toFixed(1)}
                      <span className="text-sm font-normal text-black"> / {budget} hrs</span>
                    </p>
                    <div className="w-full bg-linen rounded-full h-2 mt-2">
                      <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className={`text-xs mt-1 ${over ? 'text-red-500 font-semibold' : 'text-black'}`}>
                      {budget === 0
                        ? 'No budget set'
                        : over
                          ? `${(used - budget).toFixed(1)} hrs over budget`
                          : `${(budget - used).toFixed(1)} hrs remaining`}
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {tab === 'invoices' && (
        <div className="card">
          <div className="flex justify-between mb-4">
            <h2 className="font-bold text-gray-800">Invoices</h2>
            <Link to="/admin/invoices/new" className="btn-primary text-xs">+ Create Invoice</Link>
          </div>
          {invoices.length === 0 ? <p className="text-black text-sm">No invoices yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-linen">
                <th className="pb-2 text-left label">Invoice #</th>
                <th className="pb-2 text-left label">Status</th>
                <th className="pb-2 text-left label">Due</th>
                <th className="pb-2 text-right label">Total</th>
              </tr></thead>
              <tbody className="divide-y divide-linen">
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="py-2"><Link to={`/admin/invoices/${inv.id}`} className="text-primary hover:underline">{inv.invoice_number}</Link></td>
                    <td className="py-2"><Badge status={inv.status} /></td>
                    <td className="py-2 text-gray-600">{inv.due_date || '—'}</td>
                    <td className="py-2 text-right font-semibold">${Number(inv.total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="card">
          {tasks.length === 0 ? <p className="text-black text-sm">No tasks for this client.</p> : (
            <div className="space-y-3">
              {tasks.map(t => (
                <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg bg-linen/50">
                  <Badge status={t.status} />
                  <span className="font-medium text-sm flex-1">{t.title}</span>
                  <Badge status={t.priority} />
                  <span className="text-xs text-black">{t.due_date || ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {(tab === 'documents' || tab === 'messages') && (
        <div className="card text-center py-12">
          <p className="text-silver">
            {tab === 'documents' ? (
              <Link to="/admin/documents" className="btn-primary">Go to Documents</Link>
            ) : (
              <Link to={`/admin/messages?client=${id}`} className="btn-primary">Open Messages</Link>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
