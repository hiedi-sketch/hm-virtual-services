import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';

const PACKAGES = [
  { value: 'none',         label: 'No BK Package',           price: 0 },
  { value: 'essentials',   label: 'Essentials',               price: 250 },
  { value: 'growth',       label: 'Growth',                   price: 350 },
  { value: 'scale',        label: 'Scale',                    price: 500 },
  { value: 'full_service', label: 'Full Service',             price: 800 },
];

const VA_PACKAGES = [
  { value: '',                label: 'No VA Package',                   price: 0,    hours: 0 },
  { value: 'time_saver',      label: 'Time Saver — 10 hrs',            price: 400,  hours: 10 },
  { value: 'time_multiplier', label: 'Time Multiplier — 20 hrs',       price: 700,  hours: 20 },
  { value: 'time_freedom',    label: 'Time Freedom — 40 hrs',          price: 1200, hours: 40 },
  { value: 'agency',          label: 'Agency (invoiced separately)',    price: 0,    hours: 0 },
];

const ADDON_OPTIONS = [
  { type: 'cleanup',   label: 'Clean Up/Catch-Up (+$149/mo)' },
  { type: 'payroll',   label: 'Full Service Payroll (+$75/mo + $5/employee)' },
  { type: 'priority',  label: 'Priority Services (+$100/mo)' },
  { type: 'state_tax', label: 'Additional State Tax Filing (+$50/state/qtr)' },
  { type: 'w2',        label: 'End of Year W-2 ($250 + $2/piece)' },
  { type: '1099',      label: 'End of Year 1099 ($250 + $2/piece)' },
];

const PREPAY = [
  { value: 0,  label: 'No prepay' },
  { value: 3,  label: '3 months (5% off)' },
  { value: 6,  label: '6 months (10% off)' },
  { value: 12, label: 'Annual / 12 months (20% off)' },
];

export default function ClientForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [form, setForm] = useState({
    business_name: '', contact_name: '', email: '', phone: '', website: '',
    notes: '', expected_hours_per_month: 0,
    package_tier: 'essentials',
    package_price: 250,
    no_bk_package: false,
    va_package_tier: '',
    va_package_price: 0,
    va_hours_reset_day: 1, prepay_months: 0, billing_cycle_start: '',
    employee_count: 0, password: '',
  });
  const [addons, setAddons] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isEdit) {
      api.get(`/clients/${id}`).then(r => {
        const c = r.data.data;
        setForm({
          business_name: c.business_name,
          contact_name: c.contact_name,
          email: c.email,
          phone: c.phone || '',
          website: c.website || '',
          notes: c.notes || '',
          expected_hours_per_month: c.expected_hours_per_month,
          package_tier: c.no_bk_package ? 'none' : c.package_tier,
          package_price: c.package_price ?? 0,
          no_bk_package: !!c.no_bk_package,
          va_package_tier: c.va_package_tier || '',
          va_package_price: c.va_package_price ?? 0,
          va_hours_reset_day: c.va_hours_reset_day || 1,
          prepay_months: c.prepay_months,
          billing_cycle_start: c.billing_cycle_start || '',
          employee_count: c.employee_count,
          password: '',
        });
        setAddons((c.addons || []).map(a => ({ type: a.addon_type, quantity: a.quantity, employee_count: a.employee_count })));
      });
    }
  }, [id]);

  function set(field) { return e => setForm(f => ({ ...f, [field]: e.target.value })); }

  function handleBkTierChange(e) {
    const tier = e.target.value;
    const pkg = PACKAGES.find(p => p.value === tier);
    setForm(f => ({
      ...f,
      package_tier: tier,
      package_price: pkg?.price ?? f.package_price,
      no_bk_package: tier === 'none',
    }));
  }

  function handleVaTierChange(e) {
    const tier = e.target.value;
    const pkg = VA_PACKAGES.find(p => p.value === tier);
    setForm(f => ({
      ...f,
      va_package_tier: tier,
      va_package_price: pkg?.price ?? f.va_package_price,
      expected_hours_per_month: pkg?.hours ?? f.expected_hours_per_month,
    }));
  }

  function toggleAddon(type) {
    setAddons(prev => {
      const exists = prev.find(a => a.type === type);
      if (exists) return prev.filter(a => a.type !== type);
      return [...prev, { type, quantity: 1, employee_count: 0 }];
    });
  }

  function setAddonField(type, field, val) {
    setAddons(prev => prev.map(a => a.type === type ? { ...a, [field]: val } : a));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        addons,
        prepay_months: Number(form.prepay_months),
        employee_count: Number(form.employee_count),
        package_price: Number(form.package_price),
        va_package_price: Number(form.va_package_price),
        no_bk_package: form.package_tier === 'none' ? 1 : 0,
      };
      if (isEdit) {
        if (!form.password) delete payload.password;
        await api.put(`/clients/${id}`, payload);
        toast.success('Client updated');
      } else {
        await api.post('/clients', payload);
        toast.success('Client created');
      }
      navigate('/admin/clients');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save client');
    } finally {
      setLoading(false);
    }
  }

  const bkPkg = PACKAGES.find(p => p.value === form.package_tier);
  const vaPkg = VA_PACKAGES.find(p => p.value === form.va_package_tier);

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-primary mb-6">{isEdit ? 'Edit Client' : 'Add New Client'}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Contact Info */}
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-4">Contact Information</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Business Name *</label>
              <input className="input" value={form.business_name} onChange={set('business_name')} required />
            </div>
            <div>
              <label className="label">Contact Name *</label>
              <input className="input" value={form.contact_name} onChange={set('contact_name')} required />
            </div>
            <div>
              <label className="label">Email *</label>
              <input type="email" className="input" value={form.email} onChange={set('email')} required />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone} onChange={set('phone')} />
            </div>
            <div className="col-span-2">
              <label className="label">Website</label>
              <input className="input" value={form.website} onChange={set('website')} />
            </div>
            <div className="col-span-2">
              <label className="label">Internal Notes (admin only)</label>
              <textarea className="input min-h-20" value={form.notes} onChange={set('notes')} />
            </div>
          </div>
        </div>

        {/* Package */}
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-4">Service Package</h2>
          <div className="grid grid-cols-2 gap-4">

            {/* BK Package */}
            <div>
              <label className="label">Bookkeeping Package *</label>
              <select className="input" value={form.package_tier} onChange={handleBkTierChange} required>
                {PACKAGES.map(p => (
                  <option key={p.value} value={p.value}>{p.label} — ${p.price}/mo</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">BK Price / Month ($)</label>
              <input
                type="number" min={0} className="input"
                value={form.package_price}
                disabled={form.package_tier === 'none'}
                onChange={e => setForm(f => ({ ...f, package_price: e.target.value }))}
              />
              {form.package_tier !== 'none' && bkPkg && Number(form.package_price) !== bkPkg.price && (
                <p className="text-xs text-amber-600 mt-1">Default is ${bkPkg.price}/mo</p>
              )}
              {form.package_tier === 'none' && (
                <p className="text-xs text-silver mt-1">No BK package — $0</p>
              )}
            </div>

            {/* VA Package */}
            <div>
              <label className="label">VA Package</label>
              <select className="input" value={form.va_package_tier} onChange={handleVaTierChange}>
                {VA_PACKAGES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">VA Price / Month ($)</label>
              <input
                type="number" min={0} className="input"
                value={form.va_package_price}
                disabled={!form.va_package_tier}
                onChange={e => setForm(f => ({ ...f, va_package_price: e.target.value }))}
              />
              {form.va_package_tier && vaPkg && Number(form.va_package_price) !== vaPkg.price && (
                <p className="text-xs text-amber-600 mt-1">Default is ${vaPkg.price}/mo</p>
              )}
              {form.va_package_tier === 'agency' && (
                <p className="text-xs text-silver mt-1">Agency — invoiced separately to agency</p>
              )}
            </div>

            <div>
              <label className="label">Prepay Discount</label>
              <select className="input" value={form.prepay_months} onChange={set('prepay_months')}>
                {PREPAY.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Billing Cycle Start</label>
              <input type="date" className="input" value={form.billing_cycle_start} onChange={set('billing_cycle_start')} />
            </div>
            <div>
              <label className="label">VA Hours Budget/Month</label>
              <input type="number" className="input" value={form.expected_hours_per_month} onChange={set('expected_hours_per_month')} min={0} />
              <p className="text-xs text-silver mt-1">Auto-filled by VA package. Override if needed.</p>
            </div>
            <div>
              <label className="label">VA Hours Reset Day</label>
              <input type="number" className="input" min={1} max={28} value={form.va_hours_reset_day} onChange={set('va_hours_reset_day')} />
              <p className="text-xs text-silver mt-1">Day of month hours reset (e.g. 3 = 3rd). Max 28.</p>
            </div>
            <div>
              <label className="label">Number of Employees (for payroll)</label>
              <input type="number" className="input" value={form.employee_count} onChange={set('employee_count')} min={0} />
            </div>
          </div>

          <div className="mt-4">
            <label className="label">Add-ons</label>
            <div className="space-y-2">
              {ADDON_OPTIONS.map(opt => {
                const active = addons.find(a => a.type === opt.type);
                return (
                  <div key={opt.type}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!active} onChange={() => toggleAddon(opt.type)}
                        className="accent-primary w-4 h-4" />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                    {active && (opt.type === 'payroll' || opt.type === 'state_tax') && (
                      <div className="ml-6 mt-1">
                        <input
                          type="number" min={1}
                          className="input w-36 text-sm"
                          placeholder={opt.type === 'payroll' ? '# employees' : '# states'}
                          value={opt.type === 'payroll' ? active.employee_count : active.quantity}
                          onChange={e => setAddonField(opt.type, opt.type === 'payroll' ? 'employee_count' : 'quantity', Number(e.target.value))}
                        />
                      </div>
                    )}
                    {active && (opt.type === 'w2' || opt.type === '1099') && (
                      <div className="ml-6 mt-1">
                        <input type="number" min={1} className="input w-36 text-sm" placeholder="# of pieces"
                          value={active.quantity}
                          onChange={e => setAddonField(opt.type, 'quantity', Number(e.target.value))} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Password */}
        <div className="card">
          <h2 className="font-bold text-gray-800 mb-4">{isEdit ? 'Change Password (leave blank to keep)' : 'Client Portal Password *'}</h2>
          <input
            type="password"
            className="input"
            value={form.password}
            onChange={set('password')}
            required={!isEdit}
            placeholder={isEdit ? 'Leave blank to keep current' : 'Set initial password'}
          />
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Client'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
