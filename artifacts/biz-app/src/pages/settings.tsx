import { useState, useEffect, type ElementType } from "react";
import { createPortal } from "react-dom";
import {
  Settings,
  User,
  Link2,
  Zap,
  Package,
  BarChart2,
  KeyRound,
  HardDriveDownload,
  Lock,
  Check,
  Loader2,
  X,
  Download,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import Services from "@/pages/services";
import Reports from "@/pages/reports";
import ApiKeys from "@/pages/api-keys";
import Backup from "@/pages/backup";
import AsanaPage from "@/pages/asana";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ApiClient {
  id: number;
  name: string;
  contact_name: string | null;
}

interface AsanaPreviewTask {
  gid: string;
  name: string;
  completed: boolean;
  due_on: string | null;
  assignee_name: string | null;
}

interface CUTeam { id: string; name: string }
interface CUSpace { id: string; name: string }
interface CUList { id: string; name: string; folder?: { name: string } }

// ── Tab definitions ────────────────────────────────────────────────────────────

type TabId = "account" | "asana" | "clickup" | "services" | "reports" | "api-keys" | "backup";

const TABS: { id: TabId; label: string; icon: ElementType }[] = [
  { id: "account",   label: "Account",   icon: User },
  { id: "asana",     label: "Asana Sync", icon: Link2 },
  { id: "clickup",   label: "ClickUp",   icon: Zap },
  { id: "services",  label: "Services",  icon: Package },
  { id: "reports",   label: "Reports",   icon: BarChart2 },
  { id: "api-keys",  label: "API Keys",  icon: KeyRound },
  { id: "backup",    label: "Backup",    icon: HardDriveDownload },
];

// ── Account / Change Password ─────────────────────────────────────────────────

function AccountSection() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "New password and confirmation must match.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Must be at least 8 characters.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/users/me", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change password");
      toast({ title: "Password updated", description: "Your password has been changed successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Change Password</h2>
        <p className="text-sm text-slate-500 mt-0.5">Update your account password.</p>
      </div>
      <form onSubmit={handleChangePassword} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Current Password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            required
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#266b75] transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            New Password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            minLength={8}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#266b75] transition-colors"
          />
          <p className="text-xs text-slate-400 mt-1">Must be at least 8 characters.</p>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Confirm New Password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#266b75] transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !currentPassword || !newPassword || !confirmPassword}
          className="flex items-center gap-2 text-sm font-medium text-white bg-[#266b75] hover:bg-[#1f5560] rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
          {saving ? "Saving…" : "Update Password"}
        </button>
      </form>
    </div>
  );
}

// ── Asana Import Modal ─────────────────────────────────────────────────────────

const IMPORT_CLIENT_KEY = "hm_asana_last_import_client_id";

function AsanaImportModal({
  clients,
  onClose,
  onImported,
}: {
  clients: ApiClient[];
  onClose: () => void;
  onImported: () => void;
}) {
  const { toast } = useToast();
  const [clientId, setClientId] = useState(() => {
    const isabel = clients.find(c => c.name.toLowerCase().includes("isabel diaz"));
    if (isabel) return String(isabel.id);
    return localStorage.getItem(IMPORT_CLIENT_KEY) ?? "";
  });
  const [preview, setPreview] = useState<AsanaPreviewTask[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/asana/import/preview", { credentials: "include" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load Asana tasks");
        setPreview(data.tasks);
        setSelected(new Set(data.tasks.map((t: AsanaPreviewTask) => t.gid)));
      } catch (e: any) {
        setPreviewError(e.message ?? "Could not connect to Asana");
      } finally {
        setLoadingPreview(false);
      }
    })();
  }, []);

  const toggleTask = (gid: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(gid) ? next.delete(gid) : next.add(gid);
      return next;
    });
  };

  const handleImport = async () => {
    if (!clientId || !preview) return;
    const tasksToImport = preview.filter(t => selected.has(t.gid));
    if (tasksToImport.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch("/api/asana/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: Number(clientId), tasks: tasksToImport }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      localStorage.setItem(IMPORT_CLIENT_KEY, clientId);
      const msg = data.skipped > 0
        ? `${data.created} task${data.created !== 1 ? "s" : ""} imported · ${data.skipped} already existed`
        : `${data.created} task${data.created !== 1 ? "s" : ""} imported from Asana`;
      toast({ title: "Import complete", description: msg });
      onImported();
      onClose();
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const allSelected = preview ? preview.length > 0 && selected.size === preview.length : false;
  const toggleAll = () => {
    if (!preview) return;
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(preview.map(t => t.gid)));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#f06a35]/10 flex items-center justify-center">
              <Download className="w-4 h-4 text-[#f06a35]" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 text-sm">Import from Asana</h2>
              <p className="text-xs text-slate-400">Choose tasks to bring into Task Manager</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loadingPreview && (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading tasks from Asana…
            </div>
          )}
          {previewError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{previewError}</div>
          )}
          {!loadingPreview && !previewError && preview && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Assign to Client <span className="text-slate-400 font-normal normal-case">(defaults to Isabel Diaz)</span>
                </label>
                <select
                  value={clientId}
                  onChange={e => { setClientId(e.target.value); localStorage.setItem(IMPORT_CLIENT_KEY, e.target.value); }}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-[#266b75] transition-colors"
                >
                  <option value="">— Select a client —</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.contact_name?.trim() || c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Tasks ({selected.size} of {preview.length} selected)
                  </label>
                  <button onClick={toggleAll} className="text-xs text-[#266b75] hover:underline">
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                </div>
                {preview.length === 0 ? (
                  <p className="text-sm text-slate-400 italic text-center py-6">No tasks found in your Asana project.</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {preview.map(task => (
                      <label
                        key={task.gid}
                        className={cn(
                          "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                          selected.has(task.gid) ? "bg-[#266b75]/5" : "hover:bg-slate-50"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(task.gid)}
                          onChange={() => toggleTask(task.gid)}
                          className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 accent-[#266b75] shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className={cn("text-sm text-slate-700 truncate", task.completed && "line-through text-slate-400")}>
                              {task.name}
                            </p>
                            <a
                              href={`https://app.asana.com/0/0/${task.gid}/f`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              title="Open in Asana"
                              className="shrink-0 text-slate-300 hover:text-orange-400 transition-colors"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                            {task.due_on && <span>Due {task.due_on}</span>}
                            {task.assignee_name && <span>· {task.assignee_name}</span>}
                            {task.completed && <span className="text-emerald-500">· Completed</span>}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {!loadingPreview && !previewError && preview && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={importing || selected.size === 0}
              className="flex items-center gap-2 text-sm font-medium text-white bg-[#266b75] hover:bg-[#1f5560] rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
            >
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {importing ? "Importing…" : `Import ${selected.size} Task${selected.size !== 1 ? "s" : ""}`}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Asana Section (wraps AsanaPage + Import) ──────────────────────────────────

function AsanaSection() {
  const [clients, setClients] = useState<ApiClient[]>([]);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    fetch("/api/clients?limit=200", { credentials: "include" })
      .then(r => r.json())
      .then(d => setClients(Array.isArray(d) ? d : (d.clients ?? [])))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Asana Sync</h2>
          <p className="text-sm text-slate-500 mt-0.5">Configure your Asana connection and import tasks.</p>
        </div>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 text-sm font-medium text-[#266b75] border border-[#266b75]/40 bg-[#266b75]/5 hover:bg-[#266b75]/10 rounded-lg px-3 py-2 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Import from Asana
        </button>
      </div>
      <AsanaPage />
      {showImport && (
        <AsanaImportModal
          clients={clients}
          onClose={() => setShowImport(false)}
          onImported={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

// ── ClickUp Section ────────────────────────────────────────────────────────────

function ClickUpSection() {
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [teams, setTeams] = useState<CUTeam[]>([]);
  const [spaces, setSpaces] = useState<CUSpace[]>([]);
  const [lists, setLists] = useState<CUList[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set());
  const [listNamesMap, setListNamesMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"token" | "team" | "space" | "list" | "done">("token");
  const [savedListIds, setSavedListIds] = useState<Array<{ id: string; name: string }>>([]);
  const [settings, setSettings] = useState<{
    configured: boolean;
    token_masked: string | null;
    list_name: string | null;
    list_ids?: Array<{ id: string; name: string }>;
    clickup_user?: { username: string } | null;
  } | null>(null);
  const [registering, setRegistering] = useState(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookEndpoint, setWebhookEndpoint] = useState(`${window.location.origin}/api/clickup/webhook`);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/clickup/settings", { credentials: "include" });
        if (res.ok) { const d = await res.json(); setSettings(d); }
      } catch { /* ignore */ }
    })();
  }, []);

  const loadTeams = async (t: string) => {
    setLoading(true);
    try {
      await fetch("/api/clickup/settings", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });
      const res = await fetch("/api/clickup/workspaces", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load workspaces");
      setTeams(data.teams ?? []);
      setStep("team");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const loadSpaces = async (teamId: string) => {
    setSelectedTeam(teamId);
    setLoading(true);
    try {
      const res = await fetch(`/api/clickup/spaces/${teamId}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load spaces");
      setSpaces(data.spaces ?? []);
      setStep("space");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const loadLists = async (spaceId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clickup/lists/${spaceId}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load lists");
      const fetchedLists: CUList[] = data.lists ?? [];
      setLists(fetchedLists);
      const map: Record<string, string> = {};
      for (const l of fetchedLists) map[l.id] = l.name;
      setListNamesMap(map);
      setSelectedLists(new Set());
      setStep("list");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const toggleListSelection = (id: string) => {
    setSelectedLists(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const saveListSelections = async () => {
    if (selectedLists.size === 0) return;
    const chosenIds = Array.from(selectedLists).map(id => ({ id, name: listNamesMap[id] ?? id }));
    setSaving(true);
    try {
      const res = await fetch("/api/clickup/settings", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "__keep__", team_id: selectedTeam, list_ids: chosenIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save settings");
      setSavedListIds(chosenIds);
      toast({ title: "ClickUp connected!", description: `Syncing with ${chosenIds.length} list${chosenIds.length !== 1 ? "s" : ""}` });
      setStep("done");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const registerWebhook = async () => {
    setRegistering(true);
    setWebhookError(null);
    try {
      const res = await fetch("/api/clickup/webhook/register", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: webhookEndpoint }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to register webhook");
      toast({ title: "Webhook registered", description: `ClickUp will push changes to: ${data.endpoint ?? webhookEndpoint}` });
    } catch (e: any) {
      setWebhookError(e.message);
    } finally { setRegistering(false); }
  };

  return (
    <div className="max-w-md space-y-6">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
          <span className="text-purple-600 font-bold text-xs">CU</span>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">ClickUp Integration</h2>
          <p className="text-sm text-slate-500">Connect your ClickUp workspace to sync tasks.</p>
        </div>
      </div>

      <div className="space-y-4">
        {settings?.configured && step === "token" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-2">
            <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-emerald-800">Connected as {settings.clickup_user?.username}</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                Active list{settings.list_ids && settings.list_ids.length > 1 ? "s" : ""}: {
                  settings.list_ids && settings.list_ids.length > 0
                    ? settings.list_ids.map(l => l.name).join(", ")
                    : (settings.list_name ?? "—")
                }
              </p>
            </div>
          </div>
        )}

        {step === "token" && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                ClickUp API Token
              </label>
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-purple-400 transition-colors"
              />
              <p className="text-xs text-slate-400 mt-1">Find your token in ClickUp → Settings → Apps → API Token</p>
            </div>
            <button
              onClick={() => token.trim() && loadTeams(token.trim())}
              disabled={!token.trim() || loading}
              className="w-full flex items-center justify-center gap-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg px-4 py-2 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              {settings?.configured ? "Reconnect / Change List" : "Connect to ClickUp"}
            </button>
          </div>
        )}

        {step === "team" && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select Workspace</p>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {teams.map(t => (
                  <button key={t.id} onClick={() => loadSpaces(t.id)}
                    className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition-colors">
                    {t.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "space" && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select Space</p>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {spaces.map(s => (
                  <button key={s.id} onClick={() => loadLists(s.id)}
                    className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-purple-50 hover:text-purple-700 transition-colors">
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "list" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Select Lists to Sync</p>
              {selectedLists.size > 0 && (
                <span className="text-xs font-medium text-purple-600">{selectedLists.size} selected</span>
              )}
            </div>
            <p className="text-xs text-slate-400">You can sync multiple lists at once.</p>
            {loading ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
            ) : (
              <>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {lists.map(l => (
                    <label key={l.id}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-purple-50 transition-colors ${selectedLists.has(l.id) ? "bg-purple-50" : ""}`}>
                      <input
                        type="checkbox"
                        checked={selectedLists.has(l.id)}
                        onChange={() => toggleListSelection(l.id)}
                        className="rounded border-slate-300 text-purple-600 focus:ring-purple-400"
                      />
                      <div>
                        <p className="text-sm text-slate-700">{l.name}</p>
                        {l.folder && <p className="text-xs text-slate-400">In {l.folder.name}</p>}
                      </div>
                    </label>
                  ))}
                </div>
                <button
                  onClick={saveListSelections}
                  disabled={saving || selectedLists.size === 0}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg px-4 py-2 transition-colors disabled:opacity-50 mt-2"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  {selectedLists.size === 0
                    ? "Select at least one list"
                    : `Save ${selectedLists.size} List${selectedLists.size !== 1 ? "s" : ""}`}
                </button>
              </>
            )}
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-800">ClickUp connected!</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  {savedListIds.length > 0
                    ? `Syncing with: ${savedListIds.map(l => l.name).join(", ")}`
                    : settings?.list_ids && settings.list_ids.length > 0
                      ? `Syncing with: ${settings.list_ids.map(l => l.name).join(", ")}`
                      : `Syncing with: ${settings?.list_name ?? "your list"}`}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-2">
              <p className="text-xs font-semibold text-slate-600">Enable Real-Time Sync (Recommended)</p>
              <p className="text-xs text-slate-500">Register a webhook so ClickUp pushes changes instantly — status updates, due dates, comments, and tags.</p>
              <div>
                <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">Webhook Endpoint URL</label>
                <input
                  type="url"
                  value={webhookEndpoint}
                  onChange={e => setWebhookEndpoint(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 font-mono bg-white focus:outline-none focus:ring-1 focus:ring-purple-300"
                />
                <p className="text-[10px] text-slate-400 mt-1">This is the URL ClickUp will POST events to. It must be publicly reachable.</p>
              </div>
              {webhookError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <span className="font-semibold">Error: </span>{webhookError}
                </div>
              )}
              <button
                onClick={registerWebhook}
                disabled={registering || !webhookEndpoint}
                className="flex items-center gap-2 text-xs font-medium text-purple-700 border border-purple-200 bg-purple-50 hover:bg-purple-100 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
              >
                {registering ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                {registering ? "Registering…" : "Register Webhook"}
              </button>
            </div>

            <button
              onClick={() => setStep("token")}
              className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
              ← Back to connection settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Settings Page ─────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("account");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-[#266b75]/10 flex items-center justify-center shrink-0">
          <Settings className="w-4 h-4 text-[#266b75]" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500">Manage your account, integrations, and app configuration.</p>
        </div>
      </div>

      <div className="flex gap-5 min-h-0 items-start">
        <div className="w-44 shrink-0 space-y-0.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left",
                activeTab === id
                  ? "bg-[#266b75] text-white"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 p-6 overflow-auto">
          {activeTab === "account"  && <AccountSection />}
          {activeTab === "asana"    && <AsanaSection />}
          {activeTab === "clickup"  && <ClickUpSection />}
          {activeTab === "services" && <Services />}
          {activeTab === "reports"  && <Reports />}
          {activeTab === "api-keys" && <ApiKeys />}
          {activeTab === "backup"   && <Backup />}
        </div>
      </div>
    </div>
  );
}
