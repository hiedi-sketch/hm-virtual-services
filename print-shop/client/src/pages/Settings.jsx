import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import printApi, { money } from '../api/print';
import { Field } from '../components/ui';
import { useAuth } from '../context/AuthContext';

const GROUPS = [
  {
    title: 'Shop',
    fields: [
      { key: 'shop_name', label: 'Shop name', type: 'text' },
      { key: 'sku_prefix', label: 'SKU prefix', type: 'text', hint: 'New SKUs look like PREFIX-PRD-0001.' },
    ],
  },
  {
    title: 'What a print costs you',
    fields: [
      { key: 'machine_rate_per_hour', label: 'Machine rate per hour', type: 'number', step: '0.01', hint: 'Power, wear and depreciation per printer hour.' },
      { key: 'labor_rate_per_hour', label: 'Your hourly rate', type: 'number', step: '0.01' },
      { key: 'default_labor_minutes', label: 'Default finishing minutes', type: 'number', step: '1', hint: 'Used when an item does not set its own.' },
      { key: 'failure_rate_percent', label: 'Failed print allowance %', type: 'number', step: '0.5' },
      { key: 'overhead_percent', label: 'Overhead %', type: 'number', step: '0.5', hint: 'Software, storage, the rest of running the shop.' },
      { key: 'packaging_cost', label: 'Packaging per product', type: 'number', step: '0.01' },
    ],
  },
  {
    title: 'How prices are suggested',
    fields: [
      { key: 'wholesale_markup_percent', label: 'Wholesale markup %', type: 'number', step: '1', hint: '100% means wholesale is twice your cost.' },
      { key: 'retail_multiplier', label: 'Retail multiplier', type: 'number', step: '0.1', hint: 'Retail = wholesale × this. 2 is keystone.' },
      { key: 'price_rounding', label: 'Round prices up to', type: 'number', step: '0.05', hint: '0.25 rounds to the next quarter. Use 0 for none.' },
    ],
  },
  {
    title: 'Production planning',
    fields: [
      { key: 'turnaround_min_days', label: 'Turnaround — fastest (days)', type: 'number', step: '1' },
      { key: 'turnaround_max_days', label: 'Turnaround — promised by (days)', type: 'number', step: '1', hint: 'Orders projected past this are flagged at risk.' },
      { key: 'print_hours_per_day', label: 'Print hours per day, per printer', type: 'number', step: '0.5' },
      { key: 'printer_count', label: 'Printers running', type: 'number', step: '1' },
      { key: 'finishing_days', label: 'Days for finishing & packing', type: 'number', step: '1' },
    ],
  },
];

function BackupCard() {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const name = await printApi.downloadBackup();
      toast.success(`Saved ${name}`);
    } catch {
      toast.error('Could not build the backup');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card !p-4">
      <p className="font-bold text-primary text-sm mb-1">Backup</p>
      <p className="text-xs text-gray-500 mb-3">
        Downloads the whole shop — catalog, filament, materials, orders and queue — as a single
        SQLite file. Worth doing before a big change, and every so often regardless.
      </p>
      <button onClick={download} className="btn-secondary" disabled={busy}>
        {busy ? 'Preparing…' : 'Download a backup'}
      </button>
    </div>
  );
}

function AccountCard() {
  const { user, logout } = useAuth();
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  async function changePassword(e) {
    e.preventDefault();
    if (passwords.new_password !== passwords.confirm) {
      toast.error('The two new passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await printApi.changePassword({
        current_password: passwords.current_password,
        new_password: passwords.new_password,
      });
      setPasswords({ current_password: '', new_password: '', confirm: '' });
      // The server drops every refresh token, so this device signs in again too.
      toast.success('Password changed — signing you back in');
      setTimeout(logout, 1200);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not change the password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card !p-4">
      <p className="font-bold text-primary text-sm mb-1">Account</p>
      <p className="text-xs text-gray-500 mb-3">
        Signed in as {user?.email}. Changing the password signs out every other device.
      </p>
      <form onSubmit={changePassword} className="grid sm:grid-cols-3 gap-3 items-start">
        <Field label="Current password">
          <input
            type="password"
            className="input"
            autoComplete="current-password"
            value={passwords.current_password}
            onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })}
          />
        </Field>
        <Field label="New password" hint="At least 8 characters.">
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            value={passwords.new_password}
            onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            className="input"
            autoComplete="new-password"
            value={passwords.confirm}
            onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
          />
        </Field>
        <div className="sm:col-span-3 flex justify-end">
          <button
            type="submit"
            className="btn-secondary"
            disabled={saving || !passwords.current_password || !passwords.new_password}
          >
            {saving ? 'Changing…' : 'Change password'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function PrintSettings() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    printApi.getSettings().then(setForm).catch(() => toast.error('Could not load settings'));
  }, []);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      setForm(await printApi.saveSettings(form));
      toast.success('Settings saved — every price recalculates from here');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  if (!form) return <div className="card text-center py-12 text-sm text-gray-500">Loading…</div>;

  const exampleCost = 10;
  const wholesale = exampleCost * (1 + (Number(form.wholesale_markup_percent) || 0) / 100);
  const retail = wholesale * (Number(form.retail_multiplier) || 1);

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-primary">Settings</h1>
        <p className="text-sm text-gray-500">These drive every cost, price and ship date in the shop.</p>
      </div>

      <form onSubmit={save} className="space-y-4">
        {GROUPS.map((group) => (
          <div key={group.title} className="card !p-4">
            <p className="font-bold text-primary text-sm mb-3">{group.title}</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {group.fields.map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <input
                    type={f.type}
                    step={f.step}
                    className="input"
                    value={form[f.key] ?? ''}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                </Field>
              ))}
            </div>
          </div>
        ))}

        <div className="card !p-4 bg-linen">
          <p className="text-sm">
            With these numbers, an item that costs <strong>{money(exampleCost)}</strong> to make would be suggested at{' '}
            <strong>{money(wholesale)}</strong> wholesale and <strong>{money(retail)}</strong> retail.
          </p>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      </form>

      <AccountCard />
      <BackupCard />
    </div>
  );
}
