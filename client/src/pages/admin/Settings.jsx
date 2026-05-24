import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../../api/axios';
import toast from 'react-hot-toast';

// ── helpers ──────────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="card">
      <h2 className="font-bold text-gray-800 mb-4">{title}</h2>
      {children}
    </div>
  );
}

function StatusPill({ on, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${on ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-green-500' : 'bg-gray-400'}`} />
      {label}
    </span>
  );
}

function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Asana section ─────────────────────────────────────────────────────────────
function AsanaSection() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  function loadStatus() {
    api.get('/integrations/asana/status').then(r => {
      setStatus(r.data.data);
      setProjects(r.data.data.projects || []);
    });
  }

  useEffect(() => { loadStatus(); }, []);

  async function saveToken(e) {
    e.preventDefault();
    if (!token.trim()) return;
    setLoading(true);
    try {
      await api.post('/integrations/asana/token', { token });
      toast.success('Asana token saved');
      const ws = await api.get('/integrations/asana/workspaces');
      setWorkspaces(ws.data.data);
      loadStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid token');
    } finally {
      setLoading(false);
    }
  }

  async function selectWorkspace(e) {
    const gid = e.target.value;
    const name = e.target.options[e.target.selectedIndex].text;
    if (!gid) return;
    setLoading(true);
    try {
      const r = await api.post('/integrations/asana/workspace', { gid, name });
      setProjects(r.data.data.map(p => ({ gid: p.gid, name: p.name, enabled: false })));
      loadStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }

  function toggleProject(gid) {
    setProjects(prev => prev.map(p => p.gid === gid ? { ...p, enabled: !p.enabled } : p));
  }

  async function saveProjects() {
    await api.put('/integrations/asana/projects', { projects });
    toast.success('Projects saved');
  }

  async function sync() {
    setSyncing(true);
    try {
      const r = await api.post('/integrations/asana/sync');
      toast.success(r.data.message);
      loadStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect Asana? Synced tasks will remain locally.')) return;
    await api.delete('/integrations/asana/disconnect');
    toast.success('Asana disconnected');
    setStatus(null);
    setWorkspaces([]);
    setProjects([]);
    loadStatus();
  }

  const connected = status?.connected;

  return (
    <Section title="Asana">
      <div className="flex items-center gap-3 mb-4">
        <StatusPill on={connected} label={connected ? 'Connected' : 'Not connected'} />
        {connected && status?.lastSynced && (
          <span className="text-xs text-silver">Last synced: {fmtDate(status.lastSynced)}</span>
        )}
      </div>

      {!connected ? (
        <form onSubmit={saveToken} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="label">Personal Access Token</label>
            <input
              type="password"
              className="input"
              placeholder="Paste your Asana PAT…"
              value={token}
              onChange={e => setToken(e.target.value)}
              required
            />
            <p className="text-xs text-silver mt-1">
              Get it at <span className="text-primary">app.asana.com → Profile → Apps → Personal Access Tokens</span>
            </p>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          {/* Workspace */}
          <div>
            <label className="label">Workspace</label>
            {workspaces.length > 0 ? (
              <select className="input max-w-xs" onChange={selectWorkspace} defaultValue="">
                <option value="">Select workspace…</option>
                {workspaces.map(w => <option key={w.gid} value={w.gid}>{w.name}</option>)}
              </select>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">{status?.workspaceName || 'None selected'}</span>
                <button type="button" className="text-xs text-primary underline"
                  onClick={() => api.get('/integrations/asana/workspaces').then(r => setWorkspaces(r.data.data))}>
                  Change
                </button>
              </div>
            )}
          </div>

          {/* Projects */}
          {projects.length > 0 && (
            <div>
              <label className="label">Projects to sync</label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {projects.map(p => (
                  <label key={p.gid} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input type="checkbox" checked={!!p.enabled} onChange={() => toggleProject(p.gid)} className="accent-primary" />
                    {p.name}
                  </label>
                ))}
              </div>
              <button onClick={saveProjects} className="btn-secondary text-xs mt-2">Save project selection</button>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button onClick={sync} className="btn-primary text-sm" disabled={syncing}>
              {syncing ? 'Syncing…' : '↻ Sync Now'}
            </button>
            <button onClick={disconnect} className="btn-ghost text-sm text-red-500 hover:text-red-700">
              Disconnect
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── ClickUp section ───────────────────────────────────────────────────────────
function ClickUpSection() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState(null);
  const [teams, setTeams] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [lists, setLists] = useState([]);          // available lists in selected space
  const [checkedIds, setCheckedIds] = useState(new Set()); // selected list IDs
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedSpace, setSelectedSpace] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  function loadStatus() {
    api.get('/integrations/clickup/status').then(r => setStatus(r.data.data));
  }

  useEffect(() => { loadStatus(); }, []);

  // When available lists load, pre-check any already saved
  useEffect(() => {
    if (lists.length > 0 && status?.lists?.length > 0) {
      const saved = new Set(status.lists.map(l => l.id));
      setCheckedIds(new Set([...lists.map(l => l.id).filter(id => saved.has(id))]));
    }
  }, [lists]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleList(id) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function saveToken(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/integrations/clickup/token', { token });
      toast.success('ClickUp token saved');
      const r = await api.get('/integrations/clickup/teams');
      setTeams(r.data.data);
      loadStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid token');
    } finally {
      setLoading(false);
    }
  }

  async function onTeamChange(e) {
    const id = e.target.value;
    setSelectedTeam(id);
    setSpaces([]);
    setLists([]);
    setCheckedIds(new Set());
    if (!id) return;
    const r = await api.get(`/integrations/clickup/teams/${id}/spaces`);
    setSpaces(r.data.data);
  }

  async function onSpaceChange(e) {
    const id = e.target.value;
    setSelectedSpace(id);
    setLists([]);
    setCheckedIds(new Set());
    if (!id) return;
    const r = await api.get(`/integrations/clickup/spaces/${id}/lists`);
    setLists(r.data.data);
  }

  async function saveLists() {
    if (checkedIds.size === 0) {
      toast.error('Select at least one list');
      return;
    }
    setSaving(true);
    try {
      const selectedLists = lists
        .filter(l => checkedIds.has(l.id))
        .map(l => ({ id: l.id, name: l.name }));
      await api.post('/integrations/clickup/list', { teamId: selectedTeam, lists: selectedLists });
      toast.success(`${selectedLists.length} list(s) saved`);
      loadStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const r = await api.post('/integrations/clickup/sync');
      toast.success(r.data.message);
      loadStatus();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect ClickUp? Synced tasks will remain locally.')) return;
    await api.delete('/integrations/clickup/disconnect');
    toast.success('ClickUp disconnected');
    setTeams([]);
    setSpaces([]);
    setLists([]);
    setCheckedIds(new Set());
    loadStatus();
  }

  const connected = status?.connected;
  const savedLists = status?.lists || [];

  return (
    <Section title="ClickUp">
      <div className="flex items-center gap-3 mb-4">
        <StatusPill on={connected} label={connected ? 'Connected' : 'Not connected'} />
        {connected && status?.lastSynced && (
          <span className="text-xs text-silver">Last synced: {fmtDate(status.lastSynced)}</span>
        )}
      </div>

      {!connected ? (
        <form onSubmit={saveToken} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="label">API Token</label>
            <input
              type="password"
              className="input"
              placeholder="Paste your ClickUp API token…"
              value={token}
              onChange={e => setToken(e.target.value)}
              required
            />
            <p className="text-xs text-silver mt-1">
              Get it at <span className="text-primary">app.clickup.com → Settings → Apps</span>
            </p>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          {/* Currently syncing lists */}
          <div className="p-3 bg-linen rounded-lg text-sm">
            <p className="text-silver text-xs mb-1">Syncing from:</p>
            {savedLists.length === 0 ? (
              <span className="text-charcoal italic">No lists selected yet</span>
            ) : (
              <div className="flex flex-wrap gap-1 mt-1">
                {savedLists.map(l => (
                  <span key={l.id} className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-primary/20 text-primary text-xs font-medium">
                    {l.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Expand / change lists */}
          {teams.length === 0 && (
            <button className="text-xs text-primary underline"
              onClick={() => api.get('/integrations/clickup/teams').then(r => setTeams(r.data.data))}>
              {savedLists.length > 0 ? 'Change lists' : 'Select lists'}
            </button>
          )}

          {teams.length > 0 && (
            <div className="space-y-3">
              <div>
                <label className="label">Workspace</label>
                <select className="input max-w-xs" value={selectedTeam} onChange={onTeamChange}>
                  <option value="">Select workspace…</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              {spaces.length > 0 && (
                <div>
                  <label className="label">Space</label>
                  <select className="input max-w-xs" value={selectedSpace} onChange={onSpaceChange}>
                    <option value="">Select space…</option>
                    {spaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              )}

              {lists.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label mb-0">Lists</label>
                    <span className="text-xs text-silver">{checkedIds.size} selected</span>
                  </div>
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
                    {lists.map(l => (
                      <label key={l.id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-linen transition-colors">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-primary"
                          checked={checkedIds.has(l.id)}
                          onChange={() => toggleList(l.id)}
                        />
                        <span className="text-sm text-charcoal flex-1">
                          {l.folder && <span className="text-silver text-xs">{l.folder} / </span>}
                          {l.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={saveLists}
                    disabled={saving || checkedIds.size === 0}
                    className="btn-primary text-sm mt-2">
                    {saving ? 'Saving…' : `Save ${checkedIds.size > 0 ? `(${checkedIds.size})` : ''} Lists`}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={sync} className="btn-primary text-sm" disabled={syncing || savedLists.length === 0}>
              {syncing ? 'Syncing…' : '↻ Sync Now'}
            </button>
            <button onClick={disconnect} className="btn-ghost text-sm text-red-500 hover:text-red-700">
              Disconnect
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── QuickBooks section ────────────────────────────────────────────────────────
function QuickBooksSection() {
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [searchParams] = useSearchParams();

  function loadStatus() {
    api.get('/integrations/qbo/status').then(r => setStatus(r.data.data));
  }

  useEffect(() => {
    loadStatus();
    if (searchParams.get('qbo') === 'connected') toast.success('QuickBooks connected!');
    if (searchParams.get('qbo') === 'error') toast.error('QuickBooks connection failed. Check your credentials.');
  }, []);

  async function startOAuth() {
    try {
      const r = await api.get('/integrations/qbo/auth-url');
      window.location.href = r.data.data.url;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not start OAuth flow');
    }
  }

  async function syncInvoices() {
    setSyncing(true);
    try {
      const r = await api.post('/integrations/qbo/sync-invoices');
      toast.success(r.data.message);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect QuickBooks?')) return;
    await api.delete('/integrations/qbo/disconnect');
    toast.success('QuickBooks disconnected');
    loadStatus();
  }

  const configured = status?.configured;
  const connected = status?.connected;

  return (
    <Section title="QuickBooks Online">
      <div className="flex items-center gap-3 mb-4">
        <StatusPill on={connected} label={connected ? 'Connected' : 'Not connected'} />
        {connected && status?.lastUpdated && (
          <span className="text-xs text-silver">Token refreshed: {fmtDate(status.lastUpdated)}</span>
        )}
      </div>

      {!configured && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800 mb-4">
          Add <code className="font-mono text-xs bg-yellow-100 px-1 rounded">QBO_CLIENT_ID</code> and{' '}
          <code className="font-mono text-xs bg-yellow-100 px-1 rounded">QBO_CLIENT_SECRET</code> to{' '}
          <code className="font-mono text-xs bg-yellow-100 px-1 rounded">server/.env</code> first.
          Get them at <span className="text-primary font-medium">developer.intuit.com</span>.
        </div>
      )}

      {!connected ? (
        <div>
          <button onClick={startOAuth} className="btn-primary" disabled={!configured}>
            Connect with QuickBooks
          </button>
          <p className="text-xs text-silver mt-2">
            You'll be redirected to Intuit to authorize read access to your QuickBooks account.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-3 bg-linen rounded-lg text-sm">
            <span className="text-silver">Realm ID: </span>
            <span className="font-mono text-xs">{status.realmId}</span>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-3">
              Sync reads paid invoices from QuickBooks and marks matching local invoices as paid. This app never writes to QuickBooks.
            </p>
            <div className="flex gap-2">
              <button onClick={syncInvoices} className="btn-primary text-sm" disabled={syncing}>
                {syncing ? 'Syncing…' : '↻ Sync Invoice Status'}
              </button>
              <button onClick={disconnect} className="btn-ghost text-sm text-red-500 hover:text-red-700">
                Disconnect
              </button>
            </div>
          </div>
          <div className="pt-2 border-t border-linen">
            <p className="text-xs text-silver">
              To link a client to a QuickBooks customer, open the client record and edit their QBO Customer ID.
            </p>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Main Settings page ────────────────────────────────────────────────────────
export default function AdminSettings() {
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [tab, setTab] = useState('business');

  useEffect(() => {
    api.get('/settings').then(r => setSettings(r.data.data)).finally(() => setLoading(false));
  }, []);

  function set(key) { return e => setSettings(s => ({ ...s, [key]: e.target.value })); }

  async function saveSettings(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/settings', settings);
      toast.success('Settings saved');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm) { toast.error('Passwords do not match'); return; }
    setSavingPw(true);
    try {
      await api.put('/settings/password', { current_password: pwForm.current_password, new_password: pwForm.new_password });
      toast.success('Password updated');
      setPwForm({ current_password: '', new_password: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update password');
    } finally { setSavingPw(false); }
  }

  const TABS = [
    { key: 'business', label: 'Business' },
    { key: 'asana', label: 'Asana' },
    { key: 'clickup', label: 'ClickUp' },
    { key: 'quickbooks', label: 'QuickBooks' },
  ];

  if (loading) return <div className="p-8 text-silver">Loading…</div>;

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-primary mb-6">Settings</h1>

      {/* Tab bar */}
      <div className="flex gap-4 border-b border-linen mb-6">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`pb-2 px-1 text-sm font-semibold border-b-2 transition-colors ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-silver hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Business tab */}
      {tab === 'business' && (
        <div className="space-y-6">
          <form onSubmit={saveSettings} className="space-y-6">
            <Section title="Business Profile">
              <div className="space-y-4">
                <div>
                  <label className="label">Business Name</label>
                  <input className="input" value={settings.business_name || ''} onChange={set('business_name')} />
                </div>
                <div>
                  <label className="label">Business Email</label>
                  <input type="email" className="input" value={settings.business_email || ''} onChange={set('business_email')} />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={settings.business_phone || ''} onChange={set('business_phone')} />
                </div>
                <div>
                  <label className="label">Address (shown on invoices)</label>
                  <textarea className="input min-h-16" value={settings.business_address || ''} onChange={set('business_address')} />
                </div>
              </div>
            </Section>

            <Section title="Billing Defaults">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Default Payment Terms</label>
                  <select className="input" value={settings.payment_terms || 'Net 15'} onChange={set('payment_terms')}>
                    <option>Net 7</option>
                    <option>Net 15</option>
                    <option>Net 30</option>
                    <option>Due on Receipt</option>
                  </select>
                </div>
                <div>
                  <label className="label">Internal Hourly Cost Rate ($)</label>
                  <input type="number" min={0} className="input" value={settings.hourly_cost_rate || ''} onChange={set('hourly_cost_rate')} />
                  <p className="text-xs text-silver mt-1">Used only in profitability reports</p>
                </div>
              </div>
            </Section>

            <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</button>
          </form>

          <form onSubmit={changePassword}>
            <Section title="Change Password">
              <div className="space-y-4 max-w-sm">
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
                <button type="submit" className="btn-secondary" disabled={savingPw}>{savingPw ? 'Updating…' : 'Update Password'}</button>
              </div>
            </Section>
          </form>
        </div>
      )}

      {tab === 'asana' && <AsanaSection />}
      {tab === 'clickup' && <ClickUpSection />}
      {tab === 'quickbooks' && <QuickBooksSection />}
    </div>
  );
}
