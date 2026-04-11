import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  CheckSquare,
  Square,
  Plus,
  RefreshCw,
  Settings,
  Eye,
  EyeOff,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Calendar,
  User,
  Loader2,
  X,
  ChevronDown,
  Filter,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AsanaTask {
  gid: string;
  name: string;
  completed: boolean;
  due_on: string | null;
  assignee: { gid: string; name: string } | null;
}

interface AsanaSettings {
  configured: boolean;
  pat_masked: string | null;
  project_ids: string[];
  asana_user: { name: string; email: string } | null;
}

type FilterTab = "all" | "active" | "completed";

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  let body: Record<string, unknown>;
  try {
    body = await res.json() as Record<string, unknown>;
  } catch {
    throw new Error(`Server error (HTTP ${res.status})`);
  }
  if (!res.ok) throw new Error((body["error"] as string) ?? `HTTP ${res.status}`);
  return body as T;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="w-3 h-3" /> Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
      <AlertCircle className="w-3 h-3" /> Not configured
    </span>
  );
}

function TaskRow({
  task,
  onToggle,
  toggling,
}: {
  task: AsanaTask;
  onToggle: (gid: string, completed: boolean) => void;
  toggling: boolean;
}) {
  const isOverdue =
    task.due_on && !task.completed && task.due_on < new Date().toISOString().slice(0, 10);

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 hover:bg-slate-50/70 transition-colors group",
        task.completed && "opacity-60"
      )}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(task.gid, !task.completed)}
        disabled={toggling}
        className="mt-0.5 shrink-0 text-slate-300 hover:text-[#266b75] transition-colors disabled:opacity-50"
        title={task.completed ? "Mark incomplete" : "Mark complete"}
      >
        {toggling ? (
          <Loader2 className="w-5 h-5 animate-spin text-[#266b75]" />
        ) : task.completed ? (
          <CheckSquare className="w-5 h-5 text-emerald-500" />
        ) : (
          <Square className="w-5 h-5" />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium text-slate-900 leading-snug",
            task.completed && "line-through text-slate-400"
          )}
        >
          {task.name}
        </p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {task.due_on && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[11px] font-medium",
                isOverdue ? "text-red-500" : "text-slate-400"
              )}
            >
              <Calendar className="w-3 h-3" />
              {new Date(task.due_on + "T00:00:00").toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              {isOverdue && " · Overdue"}
            </span>
          )}
          {task.assignee && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <User className="w-3 h-3" />
              {task.assignee.name}
            </span>
          )}
        </div>
      </div>

      {/* Asana link */}
      <a
        href={`https://app.asana.com/0/0/${task.gid}`}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-300 hover:text-[#266b75]"
        title="Open in Asana"
      >
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

// ─── Settings panel ───────────────────────────────────────────────────────────

interface AsanaProject {
  gid: string;
  name: string;
}

function SettingsPanel({
  settings,
  onSaved,
}: {
  settings: AsanaSettings | null;
  onSaved: () => void;
}) {
  const [pat, setPat] = useState("");
  const [showPat, setShowPat] = useState(false);
  const [patSaving, setPatSaving] = useState(false);
  const [patError, setPatError] = useState("");

  const [projects, setProjects] = useState<AsanaProject[] | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [browseError, setBrowseError] = useState("");
  const [addingGid, setAddingGid] = useState<string | null>(null);
  const [removingGid, setRemovingGid] = useState<string | null>(null);
  const { toast } = useToast();

  const configuredIds = settings?.project_ids ?? [];

  // ── Save / verify PAT ─────────────────────────────────────────────────────
  const handleSavePat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pat && !settings?.configured) {
      setPatError("Please enter your Asana PAT.");
      return;
    }
    if (!pat) return; // nothing to save
    setPatError("");
    setPatSaving(true);
    try {
      await apiFetch("/api/asana/settings", {
        method: "POST",
        body: JSON.stringify({ pat }),
      });
      toast({ title: "PAT saved", description: "Connection verified successfully." });
      setPat("");
      onSaved();
    } catch (err: any) {
      setPatError(err.message ?? "Failed to save PAT");
    } finally {
      setPatSaving(false);
    }
  };

  // ── Browse available projects ─────────────────────────────────────────────
  const handleBrowse = async () => {
    setBrowseError("");
    setBrowsing(true);
    try {
      if (pat) {
        // Save PAT first so browse uses it
        await apiFetch("/api/asana/settings", { method: "POST", body: JSON.stringify({ pat }) });
        setPat("");
        onSaved();
      }
      const data = await apiFetch<{ projects: AsanaProject[] }>("/api/asana/projects");
      if (data.projects.length === 0) {
        setBrowseError("No projects found. Make sure your PAT has access to at least one project.");
      } else {
        setProjects(data.projects);
      }
    } catch (err: any) {
      setBrowseError(err.message ?? "Failed to load projects");
    } finally {
      setBrowsing(false);
    }
  };

  // ── Add a project ─────────────────────────────────────────────────────────
  const handleAddProject = async (gid: string) => {
    setAddingGid(gid);
    try {
      await apiFetch("/api/asana/settings", {
        method: "POST",
        body: JSON.stringify({ pat: "__keep__", project_id: gid }),
      });
      toast({ title: "Project added" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Failed to add project", description: err.message, variant: "destructive" });
    } finally {
      setAddingGid(null);
    }
  };

  // ── Remove a project ──────────────────────────────────────────────────────
  const handleRemoveProject = async (gid: string) => {
    if (!confirm("Remove this project from the list?")) return;
    setRemovingGid(gid);
    try {
      await apiFetch(`/api/asana/projects/${gid}`, { method: "DELETE" });
      toast({ title: "Project removed" });
      onSaved();
    } catch (err: any) {
      toast({ title: "Failed to remove project", description: err.message, variant: "destructive" });
    } finally {
      setRemovingGid(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* How to get a PAT */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600 space-y-2">
        <p className="font-semibold text-slate-700">How to get your Asana Personal Access Token</p>
        <ol className="list-decimal list-inside space-y-1 text-[13px]">
          <li>Go to <a href="https://app.asana.com/0/my-apps" target="_blank" rel="noopener noreferrer" className="text-[#266b75] hover:underline font-medium">app.asana.com/0/my-apps</a></li>
          <li>Click <strong>+ New access token</strong></li>
          <li>Give it a name (e.g. "HM Business Suite") and click <strong>Create token</strong></li>
          <li>Copy the token — it is only shown once</li>
        </ol>
      </div>

      {/* PAT Section */}
      <form onSubmit={handleSavePat} className="space-y-3">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
          Personal Access Token (PAT)
        </label>
        {settings?.configured && !pat && (
          <p className="text-xs text-slate-400">
            Current: <code className="bg-slate-100 px-1.5 py-0.5 rounded">{settings.pat_masked}</code>
            {" · "}Enter a new token below to replace it.
          </p>
        )}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showPat ? "text" : "password"}
              value={pat}
              onChange={e => { setPat(e.target.value); }}
              placeholder={settings?.configured ? "Enter new token to replace current" : "Paste your PAT here"}
              className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 pr-10 bg-white focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] outline-none font-mono"
            />
            <button type="button" onClick={() => setShowPat(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              {showPat ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button type="submit" disabled={patSaving || !pat}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#266b75] text-white text-sm font-semibold disabled:opacity-40 hover:bg-[#266b75]/90 transition-colors whitespace-nowrap">
            {patSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            {patSaving ? "Verifying…" : "Save PAT"}
          </button>
        </div>
        {patError && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />{patError}
          </div>
        )}
      </form>

      {/* Projects Section — only shown once PAT is configured */}
      {(settings?.configured || pat === "") && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Asana Projects ({configuredIds.length})
            </label>
            {(settings?.configured || pat) && (
              <button type="button" onClick={handleBrowse} disabled={browsing}
                className="flex items-center gap-1 text-xs font-medium text-[#266b75] hover:text-[#1f5560] disabled:opacity-50 transition-colors">
                {browsing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                {browsing ? "Loading…" : "Browse & Add Project"}
              </button>
            )}
          </div>

          {/* Currently configured projects */}
          {configuredIds.length > 0 ? (
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
              {configuredIds.map(gid => (
                <div key={gid} className="flex items-center justify-between px-4 py-2.5 bg-white">
                  <code className="text-xs text-slate-600 font-mono">{gid}</code>
                  <button
                    onClick={() => handleRemoveProject(gid)}
                    disabled={removingGid === gid}
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
                    title="Remove project"
                  >
                    {removingGid === gid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 italic">No projects configured yet. Use "Browse &amp; Add Project" above.</p>
          )}

          {/* Browse results with + buttons */}
          {projects && projects.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500">{projects.length} project{projects.length !== 1 ? "s" : ""} found — click <strong>+</strong> to add:</p>
              <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
                {projects.map(p => {
                  const isAdded = configuredIds.includes(p.gid);
                  return (
                    <div key={p.gid} className="flex items-center justify-between px-4 py-2.5 bg-white hover:bg-slate-50/60">
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm text-slate-700 font-medium truncate">{p.name}</span>
                        <span className="text-[10px] font-mono text-slate-400">{p.gid}</span>
                      </div>
                      {isAdded ? (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium shrink-0 ml-2">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Added
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAddProject(p.gid)}
                          disabled={addingGid === p.gid}
                          className="flex items-center gap-1 text-[11px] font-semibold text-[#266b75] hover:text-[#1f5560] disabled:opacity-40 transition-colors shrink-0 ml-2"
                        >
                          {addingGid === p.gid ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={() => setProjects(null)}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                Hide list
              </button>
            </div>
          )}

          {browseError && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />{browseError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AsanaPage() {
  const { toast } = useToast();

  const [settings, setSettings] = useState<AsanaSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const [tasks, setTasks] = useState<AsanaTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState("");

  const [filter, setFilter] = useState<FilterTab>("all");
  const [togglingGids, setTogglingGids] = useState<Set<string>>(new Set());

  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [creating, setCreating] = useState(false);

  // Auto-refresh interval ref
  const refreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── load settings ──────────────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const data = await apiFetch<AsanaSettings>("/api/asana/settings");
      setSettings(data);
      if (!data.configured) setShowSettings(true);
    } catch {
      setSettings(null);
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  // ── load tasks ────────────────────────────────────────────────────────────
  const loadTasks = useCallback(async (silent = false) => {
    if (!silent) setTasksLoading(true);
    setTasksError("");
    try {
      const data = await apiFetch<{ tasks: AsanaTask[] }>("/api/asana/tasks");
      setTasks(data.tasks);
    } catch (err: any) {
      const msg = err.message ?? "Failed to load tasks";
      if (!silent) setTasksError(msg);
    } finally {
      if (!silent) setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (settings?.configured) {
      loadTasks();
      // Auto-refresh every 5 minutes
      refreshIntervalRef.current = setInterval(() => loadTasks(true), 5 * 60 * 1000);
    }
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [settings?.configured, loadTasks]);

  // ── toggle task ───────────────────────────────────────────────────────────
  const handleToggle = async (gid: string, completed: boolean) => {
    setTogglingGids(prev => new Set(prev).add(gid));
    // Optimistic update
    setTasks(prev => prev.map(t => t.gid === gid ? { ...t, completed } : t));
    try {
      await apiFetch(`/api/asana/tasks/${gid}`, {
        method: "PUT",
        body: JSON.stringify({ completed }),
      });
      toast({ title: completed ? "Task marked complete" : "Task marked incomplete" });
    } catch (err: any) {
      // Revert on failure
      setTasks(prev => prev.map(t => t.gid === gid ? { ...t, completed: !completed } : t));
      toast({ title: "Failed to update task", description: err.message, variant: "destructive" });
    } finally {
      setTogglingGids(prev => { const s = new Set(prev); s.delete(gid); return s; });
    }
  };

  // ── create task ───────────────────────────────────────────────────────────
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    setCreating(true);
    try {
      const data = await apiFetch<{ task: AsanaTask }>("/api/asana/tasks", {
        method: "POST",
        body: JSON.stringify({ name: newTaskName.trim(), due_on: newTaskDue || null }),
      });
      setTasks(prev => [data.task, ...prev]);
      setNewTaskName("");
      setNewTaskDue("");
      toast({ title: "Task created in Asana" });
    } catch (err: any) {
      toast({ title: "Failed to create task", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // ── filtered tasks ────────────────────────────────────────────────────────
  const filteredTasks = tasks.filter(t => {
    if (filter === "active") return !t.completed;
    if (filter === "completed") return t.completed;
    return true;
  });

  const activeCount = tasks.filter(t => !t.completed).length;
  const completedCount = tasks.filter(t => t.completed).length;

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 flex items-center gap-3">
            <img
              src="https://www.vectorlogo.zone/logos/asana/asana-icon.svg"
              alt="Asana"
              className="w-8 h-8"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
            Asana Tasks
          </h1>
          <p className="text-slate-500 mt-1">
            View, create, and update tasks synced with your Asana project.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!settingsLoading && settings && <StatusBadge configured={settings.configured} />}
          <button
            onClick={() => setShowSettings(v => !v)}
            className={cn(
              "flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl border transition-colors",
              showSettings
                ? "bg-slate-800 text-white border-slate-800"
                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
            )}
          >
            <Settings className="w-4 h-4" />
            Settings
          </button>
          {settings?.configured && (
            <button
              onClick={() => loadTasks()}
              disabled={tasksLoading}
              className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-600 transition-colors disabled:opacity-50"
              title="Sync tasks from Asana"
            >
              <RefreshCw className={cn("w-4 h-4", tasksLoading && "animate-spin")} />
              Sync
            </button>
          )}
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Settings className="w-4 h-4 text-slate-500" />
              Asana Connection Settings
            </h2>
            {settings?.configured && (
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {settings?.configured && settings.asana_user && (
            <div className="px-6 pt-4 pb-0 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50/50">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              Connected as <strong>{settings.asana_user.name}</strong> ({settings.asana_user.email})
            </div>
          )}
          <div className="p-6">
            <SettingsPanel
              settings={settings}
              onSaved={() => {
                setShowSettings(false);
                loadSettings().then(() => loadTasks());
              }}
            />
          </div>
        </div>
      )}

      {/* Main task panel — only shown when configured */}
      {settings?.configured && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Add task form */}
          <div className="px-6 py-4 border-b border-slate-100">
            <form onSubmit={handleCreate} className="flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={newTaskName}
                  onChange={e => setNewTaskName(e.target.value)}
                  placeholder="New task name…"
                  className="w-full text-sm border border-slate-200 rounded-xl px-4 py-2.5 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] outline-none"
                />
              </div>
              <input
                type="date"
                value={newTaskDue}
                onChange={e => setNewTaskDue(e.target.value)}
                className="text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] outline-none"
                title="Optional due date"
              />
              <button
                type="submit"
                disabled={creating || !newTaskName.trim()}
                className="flex items-center gap-1.5 bg-[#266b75] hover:bg-[#266b75]/90 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 shrink-0"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {creating ? "Adding…" : "Add Task"}
              </button>
            </form>
          </div>

          {/* Filter tabs + count */}
          <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1">
              {(["all", "active", "completed"] as FilterTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={cn(
                    "text-xs font-medium px-3 py-1.5 rounded-lg capitalize transition-colors",
                    filter === tab
                      ? "bg-[#266b75] text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  )}
                >
                  {tab}
                  {tab === "active" && activeCount > 0 && (
                    <span className="ml-1.5 bg-white/20 px-1.5 py-0.5 rounded-full text-[10px]">
                      {activeCount}
                    </span>
                  )}
                  {tab === "completed" && completedCount > 0 && (
                    <span className="ml-1.5 bg-white/20 px-1.5 py-0.5 rounded-full text-[10px]">
                      {completedCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-400">
              {filteredTasks.length} task{filteredTasks.length !== 1 ? "s" : ""}
              {tasks.length > 0 && filter !== "all" && ` of ${tasks.length}`}
            </span>
          </div>

          {/* Task list */}
          <div className="divide-y divide-slate-100">
            {tasksLoading ? (
              <div className="p-12 text-center">
                <Loader2 className="w-8 h-8 text-slate-300 animate-spin mx-auto mb-3" />
                <p className="text-slate-400 text-sm">Loading tasks from Asana…</p>
              </div>
            ) : tasksError ? (
              <div className="p-8 text-center">
                <AlertCircle className="w-10 h-10 text-red-300 mx-auto mb-3" />
                <p className="text-slate-700 font-medium">Failed to load tasks</p>
                <p className="text-sm text-red-500 mt-1 max-w-sm mx-auto">{tasksError}</p>
                <button
                  onClick={() => loadTasks()}
                  className="mt-4 text-sm font-medium text-[#266b75] hover:underline"
                >
                  Try again
                </button>
              </div>
            ) : filteredTasks.length === 0 ? (
              <div className="p-12 text-center">
                <CheckCircle2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">
                  {filter === "completed"
                    ? "No completed tasks yet."
                    : filter === "active"
                    ? "No active tasks — all done!"
                    : "No tasks in this project yet."}
                </p>
                {filter !== "all" && (
                  <button
                    onClick={() => setFilter("all")}
                    className="mt-2 text-sm text-[#266b75] hover:underline"
                  >
                    Show all tasks
                  </button>
                )}
              </div>
            ) : (
              filteredTasks.map(task => (
                <TaskRow
                  key={task.gid}
                  task={task}
                  onToggle={handleToggle}
                  toggling={togglingGids.has(task.gid)}
                />
              ))
            )}
          </div>

          {/* Footer — auto-refresh note */}
          {settings.configured && tasks.length > 0 && (
            <div className="px-6 py-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3" />
              Auto-syncs every 5 minutes · Last sync on page load
            </div>
          )}
        </div>
      )}

      {/* Not configured empty state */}
      {!settingsLoading && !settings?.configured && !showSettings && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Settings className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-700 font-semibold text-lg">Asana not connected</p>
          <p className="text-sm text-slate-400 mt-2 max-w-sm mx-auto">
            Add your Personal Access Token and Project ID to start syncing tasks with Asana.
          </p>
          <button
            onClick={() => setShowSettings(true)}
            className="mt-5 inline-flex items-center gap-2 bg-[#266b75] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[#266b75]/90 transition-colors"
          >
            <Settings className="w-4 h-4" />
            Configure Asana
          </button>
        </div>
      )}
    </div>
  );
}
