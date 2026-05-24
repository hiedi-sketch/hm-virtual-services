import { useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/common/Badge';
import toast from 'react-hot-toast';

const TIER_LABELS = { essentials: 'Essentials', growth: 'Growth', scale: 'Scale', full_service: 'Full Service' };
const ADDON_LABELS = { cleanup: 'Clean Up/Catch-Up', payroll: 'Full Service Payroll', w2: 'End of Year W-2', '1099': 'End of Year 1099', state_tax: 'State Tax Filing', priority: 'Priority Services' };

export default function ClientProfile() {
  const { user, clientData } = useAuth();
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  async function changePassword(e) {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    if (pwForm.new_password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSaving(true);
    try {
      await api.put('/auth/me/password', { current_password: pwForm.current_password, new_password: pwForm.new_password });
      toast.success('Password updated');
      setPwForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update password');
    } finally { setSaving(false); }
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-primary mb-6">My Profile</h1>

      {/* Contact info */}
      <div className="card mb-6">
        <h2 className="font-bold text-gray-800 mb-4">Contact Information</h2>
        {clientData ? (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div><dt className="label">Business Name</dt><dd className="font-medium text-gray-800">{clientData.business_name}</dd></div>
            <div><dt className="label">Contact Name</dt><dd className="font-medium text-gray-800">{clientData.contact_name}</dd></div>
            <div><dt className="label">Email</dt><dd className="text-gray-600">{clientData.email}</dd></div>
            <div><dt className="label">Phone</dt><dd className="text-gray-600">{clientData.phone || '—'}</dd></div>
            {clientData.website && <div><dt className="label">Website</dt><dd className="text-gray-600">{clientData.website}</dd></div>}
          </dl>
        ) : <p className="text-silver text-sm">Loading…</p>}
        <p className="text-xs text-silver mt-4">To update contact info, please message your bookkeeper.</p>
      </div>

      {/* Service package */}
      {clientData && (
        <div className="card mb-6">
          <h2 className="font-bold text-gray-800 mb-4">Your Service Package</h2>
          <div className="flex items-center gap-3 mb-3">
            <Badge status={clientData.package_tier} />
            <span className="font-semibold text-primary">{TIER_LABELS[clientData.package_tier]}</span>
          </div>
          {clientData.billing_cycle_start && (
            <p className="text-sm text-gray-600">Billing cycle start: {clientData.billing_cycle_start}</p>
          )}
          {clientData.prepay_months > 0 && (
            <p className="text-sm text-gray-600">Prepay: {clientData.prepay_months} months</p>
          )}
        </div>
      )}

      {/* Change password */}
      <form onSubmit={changePassword} className="card">
        <h2 className="font-bold text-gray-800 mb-4">Change Password</h2>
        <div className="space-y-4">
          <div>
            <label className="label">Current Password</label>
            <input type="password" className="input" value={pwForm.current_password} onChange={e => setPwForm(f => ({ ...f, current_password: e.target.value }))} required />
          </div>
          <div>
            <label className="label">New Password</label>
            <input type="password" className="input" value={pwForm.new_password} onChange={e => setPwForm(f => ({ ...f, new_password: e.target.value }))} required minLength={8} />
          </div>
          <div>
            <label className="label">Confirm New Password</label>
            <input type="password" className="input" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} required />
          </div>
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Updating…' : 'Update Password'}</button>
        </div>
      </form>
    </div>
  );
}
