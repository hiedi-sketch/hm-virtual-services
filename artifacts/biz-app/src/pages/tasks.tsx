import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Filter, Plus, Play, Pause, Square, Loader2, Pencil,
  ChevronRight, ChevronDown, Check, X, Trash2, ClipboardList,
  ArrowUpDown, ArrowUp, ArrowDown, Download, ExternalLink, RefreshCw,
  Pin, PinOff, ListOrdered, GripVertical,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTimer } from "@/contexts/TimerContext";
import { TaskCommentPanel } from "@/components/TaskCommentPanel";

// ── Types ──────────────────────────────────────────────────────────────────

interface ApiTask {
  id: number;
  title: string;
  description: string | null;
  client_id: number | null;
  client_name: string | null;
  assigned_to: string | null;
  status: string;
  due_date: string | null;
  completed_date: string | null;
  recurrence: string | null;
  last_generated_at: string | null;
  service_type: string | null;
  asana_gid: string | null;
  clickup_task_id: string | null;
  tags: string | null;
  incomplete_subtask_count: number;
  is_pinned: boolean;
  queue_position: number | null;
  missive_conversation_id: string | null;
}

interface ApiTeamMember {
  id: number;
  name: string;
  role: string;
}

interface ApiSubtask {
  id: number;
  task_id: number;
  title: string;
  done: boolean;
}

interface ApiClient {
  id: number;
  name: string;
  contact_name: string | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ["Not Started", "Pending", "In Progress", "Confirmed", "Completed"];
const SERVICE_OPTIONS = ["Bookkeeping", "Virtual Assistant"];
const FREQ_OPTIONS = ["Daily", "Weekdays", "Weekly", "Monthly", "Annually"];
const WEEKDAY_OPTIONS = [
  { value: "sun", label: "Sunday",  short: "Sun" },
  { value: "mon", label: "Monday",  short: "Mon" },
  { value: "tue", label: "Tuesday", short: "Tue" },
  { value: "wed", label: "Wednesday", short: "Wed" },
  { value: "thu", label: "Thursday",  short: "Thu" },
  { value: "fri", label: "Friday",  short: "Fri" },
  { value: "sat", label: "Saturday", short: "Sat" },
];
const MONTHLY_DAY_OPTIONS = [
  ...Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Day ${i + 1}` })),
  { value: "last", label: "Last day" },
];

// ── Recurrence helpers ───────────────────────────────────────────────────────

function parseRecurrence(rec: string | null | undefined): { freq: string; days: string[]; monthDay: string } {
  if (!rec) return { freq: "", days: [], monthDay: "" };
  if (rec === "daily")    return { freq: "Daily",    days: [], monthDay: "" };
  if (rec === "weekdays") return { freq: "Weekdays", days: [], monthDay: "" };
  if (rec === "weekly")   return { freq: "Weekly",   days: [], monthDay: "" };
  if (rec.startsWith("weekly_")) {
    const part = rec.replace("weekly_", "");
    return { freq: "Weekly", days: part.split(",").filter(Boolean), monthDay: "" };
  }
  if (rec === "monthly") return { freq: "Monthly", days: [], monthDay: "" };
  if (rec.startsWith("monthly_")) {
    return { freq: "Monthly", days: [], monthDay: rec.replace("monthly_", "") };
  }
  if (rec === "annually") return { freq: "Annually", days: [], monthDay: "" };
  return { freq: "", days: [], monthDay: "" };
}

function buildRecurrence(freq: string, days: string[], monthDay: string): string | null {
  if (!freq) return null;
  if (freq === "Daily")    return "daily";
  if (freq === "Weekdays") return "weekdays";
  if (freq === "Weekly") {
    if (days.length === 0) return "weekly";
    return `weekly_${days.join(",")}`;
  }
  if (freq === "Monthly")  return monthDay ? `monthly_${monthDay}` : "monthly";
  if (freq === "Annually") return "annually";
  return null;
}

// ── UI helpers ───────────────────────────────────────────────────────────────

function statusBadgeCls(s: string) {
  if (s === "Completed")   return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  if (s === "In Progress") return "bg-[#266b75]/10 text-[#266b75] border border-[#266b75]/30";
  if (s === "Confirmed")   return "bg-blue-50 text-blue-700 border border-blue-200";
  if (s === "Pending")     return "bg-amber-50 text-amber-700 border border-amber-200";
  return "bg-slate-100 text-slate-500 border border-slate-200";
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtElapsed(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Inline cell editors ───────────────────────────────────────────────────────

function EditableText({
  value, onSave, saving, className, placeholder, strikethrough, forceEdit, onForceEditConsumed,
}: {
  value: string; onSave: (v: string) => void; saving: boolean;
  className?: string; placeholder?: string; strikethrough?: boolean;
  forceEdit?: boolean; onForceEditConsumed?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (forceEdit) {
      setDraft(value);
      setEditing(true);
      onForceEditConsumed?.();
    }
  }, [forceEdit]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) onSave(draft.trim());
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className="w-full min-w-[120px] px-1.5 py-0.5 text-sm border border-[#266b75] rounded outline-none bg-white shadow-sm"
        placeholder={placeholder}
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(value); setEditing(true); }}
      disabled={saving}
      className={cn(
        "text-left w-full rounded px-1 py-0.5 -mx-1 hover:bg-slate-100 transition-colors",
        strikethrough && "line-through text-slate-400",
        saving && "opacity-50 cursor-not-allowed",
        className,
      )}
      title="Click to edit"
    >
      {value || <span className="text-slate-600 italic text-xs">{placeholder ?? "Click to edit"}</span>}
      {saving && <Loader2 className="w-3 h-3 animate-spin inline ml-1 text-stone-600" />}
    </button>
  );
}

function EditableDate({
  value, onSave, saving, isOverdue,
}: {
  value: string | null; onSave: (v: string | null) => void; saving: boolean; isOverdue: boolean;
}) {
  const [editing, setEditing] = useState(false);

  const commit = (newVal: string) => {
    setEditing(false);
    const v = newVal || null;
    if (v !== value) onSave(v);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="date"
        defaultValue={value ?? ""}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") setEditing(false); }}
        className="text-sm border border-[#266b75] rounded px-1.5 py-0.5 outline-none bg-white shadow-sm"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      disabled={saving}
      className={cn(
        "text-left rounded px-1 py-0.5 -mx-1 hover:bg-slate-100 transition-colors whitespace-nowrap",
        isOverdue ? "text-red-600 font-medium" : "text-slate-700",
        saving && "opacity-50 cursor-not-allowed",
      )}
      title="Click to edit"
    >
      {fmtDate(value)}
      {isOverdue && (
        <span className="ml-1 text-[10px] text-red-400 font-medium uppercase tracking-wide">overdue</span>
      )}
    </button>
  );
}

function EditableSelect({
  value, options, onSave, saving, renderValue, placeholder,
}: {
  value: string | null; options: string[]; onSave: (v: string | null) => void; saving: boolean;
  renderValue?: (v: string | null) => React.ReactNode; placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);

  const commit = (newVal: string) => {
    setEditing(false);
    const v = newVal === "" ? null : newVal;
    if (v !== value) onSave(v);
  };

  if (editing) {
    return (
      <select
        autoFocus
        defaultValue={value ?? ""}
        onChange={e => commit(e.target.value)}
        onBlur={() => setEditing(false)}
        className="text-sm border border-[#266b75] rounded px-1.5 py-0.5 outline-none bg-white shadow-sm cursor-pointer"
      >
        <option value="">{placeholder ?? "—"}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      disabled={saving}
      className={cn(
        "text-left rounded hover:bg-slate-100 transition-colors",
        saving && "opacity-50 cursor-not-allowed",
      )}
      title="Click to edit"
    >
      {renderValue ? renderValue(value) : (
        value
          ? <span className="text-slate-700">{value}</span>
          : <span className="text-slate-500 italic text-xs">{placeholder ?? "—"}</span>
      )}
    </button>
  );
}

// ── Weekday multi-select ────────────────────────────────────────────────────

function WeekdayMultiSelect({
  selectedDays,
  onSave,
  saving,
}: {
  selectedDays: string[];
  onSave: (days: string[]) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selectedDays);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync draft when selectedDays changes externally (only when closed)
  useEffect(() => {
    if (!open) setDraft(selectedDays);
  }, [selectedDays, open]);

  // Close on outside click and save
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        const changed = JSON.stringify([...draft].sort()) !== JSON.stringify([...selectedDays].sort());
        if (changed) onSave(draft);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, draft, selectedDays, onSave]);

  const handleOpen = () => {
    setDraft(selectedDays);
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(v => !v);
  };

  const toggle = (day: string) => {
    setDraft(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const saveAndClose = () => {
    setOpen(false);
    const changed = JSON.stringify([...draft].sort()) !== JSON.stringify([...selectedDays].sort());
    if (changed) onSave(draft);
  };

  const displayLabel = selectedDays.length === 0
    ? <span className="text-slate-500 italic text-xs">Any day</span>
    : <span className="text-slate-600 text-xs">
        {selectedDays
          .map(d => WEEKDAY_OPTIONS.find(w => w.value === d)?.short ?? d)
          .join(", ")}
      </span>;

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        disabled={saving}
        className={cn(
          "text-left rounded px-1 py-0.5 hover:bg-slate-100 transition-colors whitespace-nowrap",
          saving && "opacity-50 cursor-not-allowed",
        )}
        title="Click to select weekdays"
      >
        {displayLabel}
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
          className="bg-white border border-slate-200 rounded-lg shadow-xl p-2 min-w-[160px]"
        >
          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-medium mb-1.5 px-1">Select days</p>
          {WEEKDAY_OPTIONS.map(day => (
            <label
              key={day.value}
              className="flex items-center gap-2 py-1 px-1.5 hover:bg-slate-50 rounded cursor-pointer"
            >
              <input
                type="checkbox"
                checked={draft.includes(day.value)}
                onChange={() => toggle(day.value)}
                className="w-3.5 h-3.5 rounded border-slate-300 accent-[#266b75]"
              />
              <span className="text-xs text-slate-700">{day.label}</span>
            </label>
          ))}
          <button
            onClick={saveAndClose}
            className="mt-2 w-full text-xs text-white bg-[#266b75] hover:bg-[#1f5560] rounded px-2 py-1 transition-colors"
          >
            Done
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Subtask expand panel ─────────────────────────────────────────────────────

function SubtaskPanel({ taskId }: { taskId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<Set<number>>(new Set());

  const { data: subtasks = [], isLoading } = useQuery<ApiSubtask[]>({
    queryKey: ["subtasks", taskId],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/${taskId}/subtasks`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    retry: 1,
  });

  const toggleDone = async (sub: ApiSubtask) => {
    setBusy(prev => new Set(prev).add(sub.id));
    try {
      queryClient.setQueryData<ApiSubtask[]>(["subtasks", taskId], old =>
        (old ?? []).map(s => s.id === sub.id ? { ...s, done: !s.done } : s)
      );
      const res = await fetch(`/api/subtasks/${sub.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: !sub.done }),
      });
      if (!res.ok) throw new Error("Failed");
    } catch {
      toast({ title: "Failed to update subtask", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["subtasks", taskId] });
    } finally {
      setBusy(prev => { const s = new Set(prev); s.delete(sub.id); return s; });
    }
  };

  const deleteSubtask = async (id: number) => {
    setBusy(prev => new Set(prev).add(id));
    try {
      queryClient.setQueryData<ApiSubtask[]>(["subtasks", taskId], old =>
        (old ?? []).filter(s => s.id !== id)
      );
      const res = await fetch(`/api/subtasks/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    } catch {
      toast({ title: "Failed to delete subtask", variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["subtasks", taskId] });
    } finally {
      setBusy(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  };

  const addSubtask = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/subtasks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed");
      const created = await res.json();
      queryClient.setQueryData<ApiSubtask[]>(["subtasks", taskId], old => [...(old ?? []), created]);
      setNewTitle("");
    } catch {
      toast({ title: "Failed to add subtask", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <tr className="bg-[#266b75]/5 border-b border-[#266b75]/10">
      <td colSpan={12} className="px-4 py-3">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Subtasks ── */}
          <div>
            <p className="text-[10px] text-[#266b75] font-semibold uppercase tracking-wider mb-2">Subtasks</p>
            {isLoading ? (
              <div className="flex items-center gap-2 text-slate-400 text-xs">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="space-y-1.5">
                {subtasks.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No subtasks yet — add one below.</p>
                )}
                {subtasks.map(sub => (
                  <div key={sub.id} className="flex items-center gap-2 group">
                    <button
                      onClick={() => toggleDone(sub)}
                      disabled={busy.has(sub.id)}
                      className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all",
                        sub.done
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "border-slate-300 hover:border-[#266b75]",
                        busy.has(sub.id) && "opacity-50"
                      )}
                    >
                      {sub.done && <Check className="w-2.5 h-2.5" />}
                    </button>
                    <span className={cn("text-sm flex-1", sub.done && "line-through text-slate-400 text-xs")}>
                      {sub.title}
                    </span>
                    <button
                      onClick={() => deleteSubtask(sub.id)}
                      disabled={busy.has(sub.id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 mt-3">
                  <input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addSubtask(); }}
                    placeholder="Add a subtask…"
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white outline-none focus:border-[#266b75] transition-colors"
                  />
                  <button
                    onClick={addSubtask}
                    disabled={adding || !newTitle.trim()}
                    className="text-xs text-white bg-[#266b75] hover:bg-[#1f5560] rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Comments ── */}
          <TaskCommentPanel taskId={taskId} />

        </div>
      </td>
    </tr>
  );
}

// ── Import from Asana modal ───────────────────────────────────────────────────

interface AsanaPreviewTask {
  gid: string;
  name: string;
  completed: boolean;
  due_on: string | null;
  assignee_name: string | null;
}

const IMPORT_CLIENT_KEY = "hm_asana_last_import_client_id";

function ImportAsanaModal({
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
        {/* Header */}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loadingPreview && (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading tasks from Asana…
            </div>
          )}

          {previewError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {previewError}
            </div>
          )}

          {!loadingPreview && !previewError && preview && (
            <>
              {/* Client selector */}
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

              {/* Task list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Tasks ({selected.size} of {preview.length} selected)
                  </label>
                  <button
                    onClick={toggleAll}
                    className="text-xs text-[#266b75] hover:underline"
                  >
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                </div>
                {preview.length === 0 ? (
                  <p className="text-sm text-slate-400 italic text-center py-6">
                    No tasks found in your Asana project.
                  </p>
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
                            <p className={cn(
                              "text-sm text-slate-700 truncate",
                              task.completed && "line-through text-slate-400"
                            )}>
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

        {/* Footer */}
        {!loadingPreview && !previewError && preview && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors"
            >
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

// ── ClickUp Settings Modal ────────────────────────────────────────────────────

interface CUTeam { id: string; name: string }
interface CUSpace { id: string; name: string }
interface CUList { id: string; name: string; folder?: { name: string } }

function ClickUpSettingsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [teams, setTeams] = useState<CUTeam[]>([]);
  const [spaces, setSpaces] = useState<CUSpace[]>([]);
  const [lists, setLists] = useState<CUList[]>([]);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedSpace, setSelectedSpace] = useState("");
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set());
  const [listNamesMap, setListNamesMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"token" | "team" | "space" | "list" | "done">("token");
  const [savedListIds, setSavedListIds] = useState<Array<{ id: string; name: string }>>([]);
  const [settings, setSettings] = useState<{ configured: boolean; token_masked: string | null; list_name: string | null; list_ids?: Array<{ id: string; name: string }>; clickup_user?: { username: string } | null } | null>(null);
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
    setSelectedSpace(spaceId);
    setLoading(true);
    try {
      const res = await fetch(`/api/clickup/lists/${spaceId}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load lists");
      const fetchedLists: CUList[] = data.lists ?? [];
      setLists(fetchedLists);
      // Build a name map for quick lookup
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
      onSaved();
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <span className="text-purple-600 font-bold text-xs">CU</span>
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 text-sm">ClickUp Integration</h2>
              <p className="text-xs text-slate-400">Connect your ClickUp workspace</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {settings?.configured && step === "token" && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-800">Connected as {settings.clickup_user?.username}</p>
                <p className="text-xs text-emerald-600 mt-0.5">Active list: {settings.list_name ?? "—"}</p>
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
                <p className="text-xs text-slate-400 mt-1">
                  Find your token in ClickUp → Settings → Apps → API Token
                </p>
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
                    <span className="font-semibold">ClickUp error: </span>{webhookError}
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
              <button onClick={onClose}
                className="w-full text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 transition-colors">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Import from ClickUp modal ─────────────────────────────────────────────────

interface CUPreviewTask {
  id: string;
  name: string;
  status: string;
  due_date: string | null;
  assignee_name: string | null;
  tags: string;
}

const CU_IMPORT_CLIENT_KEY = "hm_clickup_last_import_client_id";

function ImportClickUpModal({
  clients,
  onClose,
  onImported,
  configuredListIds = [],
}: {
  clients: ApiClient[];
  onClose: () => void;
  onImported: () => void;
  configuredListIds?: Array<{ id: string; name: string }>;
}) {
  const { toast } = useToast();
  const [clientId, setClientId] = useState(() => localStorage.getItem(CU_IMPORT_CLIENT_KEY) ?? "");
  const [preview, setPreview] = useState<CUPreviewTask[] | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [selectedListId, setSelectedListId] = useState(() => configuredListIds[0]?.id ?? "");

  const fetchPreview = async (listId: string) => {
    setLoadingPreview(true);
    setPreview(null);
    setPreviewError(null);
    try {
      const url = listId ? `/api/clickup/import/preview?list_id=${listId}` : "/api/clickup/import/preview";
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load ClickUp tasks");
      setPreview(data.tasks);
      setSelected(new Set(data.tasks.map((t: CUPreviewTask) => t.id)));
    } catch (e: any) {
      setPreviewError(e.message ?? "Could not connect to ClickUp");
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    fetchPreview(selectedListId);
  }, [selectedListId]);

  const toggleTask = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (!preview) return;
    const tasksToImport = preview.filter(t => selected.has(t.id));
    if (tasksToImport.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch("/api/clickup/import", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId ? Number(clientId) : null, tasks: tasksToImport }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      localStorage.setItem(CU_IMPORT_CLIENT_KEY, clientId);
      const parts = [];
      if (data.created > 0) parts.push(`${data.created} imported`);
      if (data.skipped > 0) parts.push(`${data.skipped} already existed`);
      const msg = parts.length > 0 ? parts.join(" · ") : "No new tasks to import";
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
    else setSelected(new Set(preview.map(t => t.id)));
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <Download className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900 text-sm">Import from ClickUp</h2>
              <p className="text-xs text-slate-400">Choose tasks to bring into Task Manager</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {configuredListIds.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Import from List
              </label>
              <select
                value={selectedListId}
                onChange={e => setSelectedListId(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-purple-400 transition-colors"
              >
                {configuredListIds.map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          )}
          {loadingPreview && (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading tasks from ClickUp…
            </div>
          )}
          {previewError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {previewError}
            </div>
          )}
          {!loadingPreview && !previewError && preview && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Assign to Client <span className="text-slate-400 font-normal normal-case">(optional — auto-matched from tags)</span>
                </label>
                <select
                  value={clientId}
                  onChange={e => { setClientId(e.target.value); localStorage.setItem(CU_IMPORT_CLIENT_KEY, e.target.value); }}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:border-purple-400 transition-colors"
                >
                  <option value="">— Auto-match from tags —</option>
                  {clients.map(c => (<option key={c.id} value={c.id}>{c.contact_name?.trim() || c.name}</option>))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">If a task tag matches a client name exactly, it will be linked automatically. Leave blank to rely on tag matching.</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Tasks ({selected.size} of {preview.length} selected)
                  </label>
                  <button onClick={toggleAll} className="text-xs text-purple-600 hover:underline">
                    {allSelected ? "Deselect all" : "Select all"}
                  </button>
                </div>
                {preview.length === 0 ? (
                  <p className="text-sm text-slate-400 italic text-center py-6">No tasks found in your ClickUp list.</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {preview.map(task => (
                      <label key={task.id} className={cn(
                        "flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                        selected.has(task.id) ? "bg-purple-50/60" : "hover:bg-slate-50"
                      )}>
                        <input type="checkbox" checked={selected.has(task.id)} onChange={() => toggleTask(task.id)}
                          className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 accent-purple-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className={cn("text-sm text-slate-700 truncate",
                              task.status.toLowerCase().includes("complet") && "line-through text-slate-400")}>
                              {task.name}
                            </p>
                            <a href={`https://app.clickup.com/t/${task.id}`} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()} title="Open in ClickUp"
                              className="shrink-0 text-slate-300 hover:text-purple-500 transition-colors">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span className="capitalize">{task.status}</span>
                            {task.due_date && <span>· Due {task.due_date}</span>}
                            {task.assignee_name && <span>· {task.assignee_name}</span>}
                            {task.tags && <span className="text-purple-500">· {task.tags}</span>}
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
            <button onClick={handleImport} disabled={importing || selected.size === 0}
              className="flex items-center gap-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg px-4 py-2 transition-colors disabled:opacity-50">
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

// ── New Task inline row ───────────────────────────────────────────────────────

function NewTaskRow({
  clients, assigneeOptions, onSave, onCancel, saving,
}: {
  clients: ApiClient[];
  assigneeOptions: string[];
  onSave: (data: Partial<ApiTask>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [title, setTitle]         = useState("");
  const [clientId, setClientId]   = useState("");
  const [serviceType, setServiceType] = useState("");
  const [status, setStatus]       = useState("Not Started");
  const [dueDate, setDueDate]     = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [freq, setFreq]           = useState("");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [monthDay, setMonthDay]   = useState("");

  const recurrence = buildRecurrence(freq, selectedDays, monthDay);

  const handleSubmit = async () => {
    if (!title.trim() || !clientId) return;
    await onSave({
      title: title.trim(),
      client_id: Number(clientId),
      service_type: serviceType || null,
      status,
      due_date: dueDate || null,
      assigned_to: assignedTo.trim() || null,
      recurrence,
    });
  };

  const handleFreqChange = (v: string) => {
    setFreq(v);
    setSelectedDays([]);
    setMonthDay("");
  };

  return (
    <tr className="border-b border-[#266b75]/20 bg-[#266b75]/5">
      <td className="px-2 py-2" />
      <td className="px-2 py-2" />
      <td className="px-3 py-2" />
      {/* Status */}
      <td className="px-4 py-2">
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-[#266b75]">
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      {/* Client dropdown */}
      <td className="px-4 py-2">
        <select value={clientId} onChange={e => setClientId(e.target.value)} required
          className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-[#266b75] w-36">
          <option value="">— Client —</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.contact_name?.trim() || c.name}</option>
          ))}
        </select>
      </td>
      {/* Service type */}
      <td className="px-4 py-2">
        <select value={serviceType} onChange={e => setServiceType(e.target.value)}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-[#266b75]">
          <option value="">— None —</option>
          {SERVICE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      {/* Frequency */}
      <td className="px-4 py-2">
        <select value={freq} onChange={e => handleFreqChange(e.target.value)}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-[#266b75]">
          <option value="">One-Time</option>
          {FREQ_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </td>
      {/* Day — multi-select for weekly, single for monthly */}
      <td className="px-4 py-2">
        {freq === "Weekly" ? (
          <WeekdayMultiSelect
            selectedDays={selectedDays}
            onSave={setSelectedDays}
            saving={false}
          />
        ) : freq === "Monthly" ? (
          <select value={monthDay} onChange={e => setMonthDay(e.target.value)}
            className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-[#266b75]">
            <option value="">Any day</option>
            {MONTHLY_DAY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        ) : (
          <span className="text-slate-500 text-xs">—</span>
        )}
      </td>
      {/* Title */}
      <td className="px-4 py-2">
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") onCancel(); }}
          placeholder="Task description…"
          className="w-full min-w-[160px] text-xs border border-[#266b75] rounded px-1.5 py-1 bg-white outline-none shadow-sm"
        />
      </td>
      {/* Due date */}
      <td className="px-4 py-2">
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-[#266b75]" />
      </td>
      {/* Assigned */}
      <td className="px-4 py-2">
        <select
          value={assignedTo}
          onChange={e => setAssignedTo(e.target.value)}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-[#266b75] w-32"
        >
          <option value="">— Unassigned —</option>
          {assigneeOptions.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </td>
      {/* Completed date placeholder */}
      <td className="px-4 py-2" />
      {/* Pencil placeholder */}
      <td className="px-1 py-2" />
      {/* Actions */}
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={handleSubmit}
            disabled={saving || !title.trim() || !clientId}
            className="w-6 h-6 rounded flex items-center justify-center bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors"
            title="Save task"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={onCancel}
            className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Tasks() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { startForTask, pause, stop, saveAndStop, state: timerState, elapsedMs } = useTimer();

  const [searchQuery, setSearchQuery] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("incomplete");
  const [sortField, setSortField] = useState<"due_date" | "status" | "client_name" | null>("due_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [highlightedTaskId, setHighlightedTaskId] = useState<number | null>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());

  const scrollToTask = useCallback((task: ApiTask) => {
    setSearchQuery("");
    setClientFilter("all");
    setServiceFilter("all");
    if (task.status === "Completed") setStatusFilter("all");
    else setStatusFilter("incomplete");
    setHighlightedTaskId(task.id);
    setTimeout(() => {
      const el = rowRefs.current.get(task.id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setHighlightedTaskId(null), 2000);
    }, 80);
  }, []);

  function handleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showNewRow, setShowNewRow] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showClickUpSettings, setShowClickUpSettings] = useState(false);
  const [showClickUpImport, setShowClickUpImport] = useState(false);
  const [clickUpConfigured, setClickUpConfigured] = useState(false);
  const [cuListIds, setCuListIds] = useState<Array<{ id: string; name: string }>>([]);
  const [syncing, setSyncing] = useState(false);

  const refreshCuSettings = () => {
    fetch("/api/clickup/settings", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        setClickUpConfigured(!!d.configured);
        setCuListIds(d.list_ids ?? (d.list_id ? [{ id: d.list_id, name: d.list_name ?? d.list_id }] : []));
      })
      .catch(() => {});
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const [cuRes, asanaRes] = await Promise.allSettled([
        fetch("/api/clickup/sync", { method: "POST", credentials: "include" }).then(r => r.json()),
        fetch("/api/asana/push", { method: "POST", credentials: "include" }).then(r => r.json()),
      ]);
      const cuOk = cuRes.status === "fulfilled" && !cuRes.value?.error;
      const asanaOk = asanaRes.status === "fulfilled" && !asanaRes.value?.error;
      const parts = [];
      if (cuOk && cuRes.status === "fulfilled") {
        const v = cuRes.value;
        const cuParts = [];
        if ((v.pushed ?? 0) > 0) cuParts.push(`${v.pushed} pushed`);
        if ((v.updated ?? 0) > 0) cuParts.push(`${v.updated} updated`);
        if ((v.created ?? 0) > 0) cuParts.push(`${v.created} new`);
        const cuErrors = (v.push_errors ?? 0) + (v.pull_errors ?? 0);
        if (cuErrors > 0) cuParts.push(`${cuErrors} errors`);
        if (cuParts.length > 0) parts.push(`ClickUp: ${cuParts.join(", ")}`);
      }
      if (asanaOk && asanaRes.status === "fulfilled") parts.push(`Asana: ${asanaRes.value.pushed ?? 0} pushed`);
      if (parts.length > 0) {
        toast({ title: "Sync complete", description: parts.join(" · ") });
      } else {
        toast({ title: "Sync finished", description: "No linked tasks to sync, or integration not configured.", variant: "destructive" });
      }
      refetch();
    } catch {
      toast({ title: "Sync failed", description: "Could not reach one or both integrations.", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { refreshCuSettings(); }, []);

  // ── Inline edit trigger ────────────────────────────────────────────────────
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);

  // ── Bulk selection state ───────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkActing, setIsBulkActing] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("Not Started");
  const [bulkClientId, setBulkClientId] = useState("");

  const today = new Date().toLocaleDateString("sv-SE");

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: tasks = [], isLoading, refetch } = useQuery<ApiTask[]>({
    queryKey: ["api-tasks"],
    queryFn: async () => {
      const res = await fetch("/api/tasks", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const { data: clients = [] } = useQuery<ApiClient[]>({
    queryKey: ["clients"],
    queryFn: async () => {
      const res = await fetch("/api/clients", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json();
    },
  });

  const { data: teamMembers = [] } = useQuery<ApiTeamMember[]>({
    queryKey: ["team-members"],
    queryFn: async () => {
      const res = await fetch("/api/users/team-members", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch team members");
      return res.json();
    },
  });

  // Combined assignee options: team members first, then client contact names
  const assigneeOptions = useMemo(() => {
    const members = teamMembers.map(m => m.name).filter(Boolean);
    // Use contact_name when set, fall back to business name
    const clientContacts = clients.map(c => c.contact_name || c.name).filter(Boolean);
    return [...new Set([...members, ...clientContacts])].sort();
  }, [teamMembers, clients]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const patchTask = useCallback(async (id: number, fields: Record<string, unknown>) => {
    // Save & stop the timer BEFORE the optimistic update so the reactive useEffect
    // sees an idle timer (not running) when the task status flips to Completed.
    if (fields.status === "Completed" && timerState.taskId === id && timerState.status !== "idle") {
      try {
        await saveAndStop();
        toast({ title: "Timer saved", description: "Time entry recorded automatically." });
      } catch {
        toast({ title: "Could not save timer", description: "Time entry may not have been recorded.", variant: "destructive" });
        stop(); // at least stop the timer so it doesn't keep running
      }
    }
    setSaving(prev => new Set(prev).add(id));
    try {
      queryClient.setQueryData<ApiTask[]>(["api-tasks"], old =>
        (old ?? []).map(t => t.id === id ? { ...t, ...fields } : t)
      );
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated = await res.json();
      queryClient.setQueryData<ApiTask[]>(["api-tasks"], old =>
        (old ?? []).map(t => t.id === id ? { ...t, ...updated } : t)
      );
    } catch {
      toast({ title: "Failed to save — change reverted", variant: "destructive" });
      refetch();
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, [queryClient, toast, refetch, timerState, saveAndStop, stop]);

  const deleteTask = useCallback(async (id: number) => {
    if (!confirm("Delete this task?")) return;
    setSaving(prev => new Set(prev).add(id));
    try {
      queryClient.setQueryData<ApiTask[]>(["api-tasks"], old => (old ?? []).filter(t => t.id !== id));
      await fetch(`/api/tasks/${id}`, { method: "DELETE", credentials: "include" });
    } catch {
      toast({ title: "Failed to delete task", variant: "destructive" });
      refetch();
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, [queryClient, toast, refetch]);

  const createTask = useCallback(async (data: Partial<ApiTask>) => {
    setCreatingTask(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Create failed");
      const created = await res.json();
      queryClient.setQueryData<ApiTask[]>(["api-tasks"], old => [created, ...(old ?? [])]);
      setShowNewRow(false);
      toast({ title: "Task created" });
    } catch {
      toast({ title: "Failed to create task", variant: "destructive" });
    } finally {
      setCreatingTask(false);
    }
  }, [queryClient, toast]);

  // ── Bulk actions ─────────────────────────────────────────────────────────

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleBulkAddToQueue = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const alreadyQueued = new Set(
      tasks.filter(t => t.queue_position !== null && t.queue_position !== undefined).map(t => t.id)
    );
    const toAdd = Array.from(selectedIds).filter(id => !alreadyQueued.has(id));
    if (toAdd.length === 0) {
      toast({ title: "All selected tasks are already in the queue" });
      return;
    }
    const maxPos = Math.max(0, ...tasks
      .filter(t => t.queue_position !== null && t.queue_position !== undefined)
      .map(t => t.queue_position as number));
    setIsBulkActing(true);
    try {
      await Promise.all(toAdd.map((id, i) => patchTask(id, { queue_position: maxPos + i + 1 })));
      setSelectedIds(new Set());
      toast({ title: `${toAdd.length} task${toAdd.length !== 1 ? "s" : ""} added to queue` });
    } catch {
      toast({ title: "Failed to add to queue", variant: "destructive" });
    } finally {
      setIsBulkActing(false);
    }
  }, [selectedIds, tasks, patchTask, toast]);

  const handleBulkAction = useCallback(async (
    action: "delete" | "update_status" | "update_client",
  ) => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);

    if (action === "delete") {
      if (!confirm(`Permanently delete ${ids.length} task${ids.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    }

    setIsBulkActing(true);
    try {
      const body: Record<string, unknown> = { action, ids };
      if (action === "update_status") body.status = bulkStatus;
      if (action === "update_client") body.client_id = Number(bulkClientId);

      const res = await fetch("/api/tasks/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Bulk action failed");

      setSelectedIds(new Set());
      await refetch();
      toast({ title: `${ids.length} task${ids.length !== 1 ? "s" : ""} updated` });
    } catch {
      toast({ title: "Bulk action failed", variant: "destructive" });
    } finally {
      setIsBulkActing(false);
    }
  }, [selectedIds, bulkStatus, bulkClientId, refetch, toast]);

  // ── Timer ─────────────────────────────────────────────────────────────────

  // Save & stop the timer reactively whenever the active task becomes Completed
  // (handles external status changes, e.g. from the client detail page).
  // patchTask already calls saveAndStop() before its own optimistic update,
  // so by the time this effect fires for a local change the timer is already idle.
  useEffect(() => {
    if (timerState.taskId && timerState.status !== "idle") {
      const activeTask = tasks.find(t => t.id === timerState.taskId);
      if (activeTask?.status === "Completed") {
        saveAndStop().catch(() => stop());
      }
    }
  }, [tasks, timerState.taskId, timerState.status, saveAndStop, stop]);

  const handleTimerClick = (task: ApiTask) => {
    const isThisTask = timerState.taskId === task.id;
    const willStart = !isThisTask || timerState.status !== "running";

    if (isThisTask) {
      if (timerState.status === "running") {
        pause();
        return;
      }
      startForTask(task.id, task.title, task.client_id ?? null, task.client_name ?? null, (task.service_type as any) ?? null);
    } else {
      startForTask(task.id, task.title, task.client_id ?? null, task.client_name ?? null, (task.service_type as any) ?? null);
    }

    // Auto-set status to "In Progress" when timer starts (not when pausing, not if already In Progress or Completed)
    if (willStart && task.status !== "In Progress" && task.status !== "Completed") {
      patchTask(task.id, { status: "In Progress" });
    }
  };

  const handleStopTimer = (e: React.MouseEvent, task: ApiTask) => {
    e.stopPropagation();
    if (timerState.taskId === task.id) stop();
  };

  // ── Filters ───────────────────────────────────────────────────────────────

  const clientNames = useMemo(
    () => Array.from(new Set(tasks.map(t => t.client_name).filter(Boolean))).sort() as string[],
    [tasks]
  );

  const displayed = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = tasks.filter(t => {
      if (q && !t.title.toLowerCase().includes(q)) return false;
      if (clientFilter !== "all" && t.client_name !== clientFilter) return false;
      if (serviceFilter !== "all" && t.service_type !== serviceFilter) return false;
      if (statusFilter === "incomplete" && t.status === "Completed") return false;
      if (statusFilter !== "all" && statusFilter !== "incomplete" && t.status !== statusFilter) return false;
      return true;
    });

    if (!sortField) return filtered;

    const STATUS_ORDER: Record<string, number> = {
      "Not Started": 0, "Pending": 1, "In Progress": 2, "Completed": 3,
    };

    return [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === "due_date") {
        // Tasks without a due date always sort to the end
        const aVal = a.due_date ?? "";
        const bVal = b.due_date ?? "";
        if (!aVal && !bVal) cmp = 0;
        else if (!aVal) cmp = 1;
        else if (!bVal) cmp = -1;
        else cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else if (sortField === "status") {
        cmp = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
      } else if (sortField === "client_name") {
        cmp = (a.client_name ?? "").localeCompare(b.client_name ?? "");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [tasks, clientFilter, serviceFilter, statusFilter, sortField, sortDir]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#266b75]/10 flex items-center justify-center shrink-0">
            <ClipboardList className="w-4 h-4 text-[#266b75]" />
          </div>
          <p className="text-xs text-slate-400">
            {isLoading ? "Loading…" : `${tasks.length} tasks · click any cell to edit`}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-[#266b75] border border-[#266b75]/40 bg-[#266b75]/5 hover:bg-[#266b75]/10 rounded-lg px-3 py-2 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Import from Asana
          </button>
          <button
            onClick={() => clickUpConfigured ? setShowClickUpImport(true) : setShowClickUpSettings(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-purple-700 border border-purple-300 bg-purple-50 hover:bg-purple-100 rounded-lg px-3 py-2 transition-colors"
          >
            <span className="font-bold text-[10px] leading-none bg-purple-600 text-white rounded px-1 py-0.5">CU</span>
            {clickUpConfigured ? "Import from ClickUp" : "Connect ClickUp"}
          </button>
          {clickUpConfigured && (
            <button
              onClick={() => setShowClickUpSettings(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-500 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg px-3 py-2 transition-colors"
              title="ClickUp settings"
            >
              <span className="font-bold text-[10px] leading-none bg-purple-600 text-white rounded px-1 py-0.5">CU</span>
              Settings
            </button>
          )}
          <button
            onClick={handleSyncNow}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
            title="Push all linked tasks to ClickUp and Asana"
          >
            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
          <button
            onClick={() => setShowNewRow(true)}
            disabled={showNewRow}
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#266b75] hover:bg-[#1f5560] rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
          >
            <Plus className="w-3.5 h-3.5" />
            New Task
          </button>
        </div>
      </div>

      {showImportModal && (
        <ImportAsanaModal
          clients={clients}
          onClose={() => setShowImportModal(false)}
          onImported={() => refetch()}
        />
      )}
      {showClickUpSettings && (
        <ClickUpSettingsModal
          onClose={() => setShowClickUpSettings(false)}
          onSaved={() => { setClickUpConfigured(true); refreshCuSettings(); }}
        />
      )}
      {showClickUpImport && (
        <ImportClickUpModal
          clients={clients}
          onClose={() => setShowClickUpImport(false)}
          onImported={() => refetch()}
          configuredListIds={cuListIds}
        />
      )}

      {/* ── Pinned Daily Tasks ─────────────────────────────────────────── */}
      {(() => {
        const pinned = tasks.filter(t => t.is_pinned);
        if (pinned.length === 0) return null;
        return (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Pin className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-amber-800">Daily Tasks</h3>
              <span className="text-xs text-amber-600 bg-amber-100 rounded-full px-2 py-0.5">{pinned.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {pinned.map(task => {
                const isSaving = saving.has(task.id);
                const isRunning = timerState.taskId === task.id && timerState.status === "running";
                const isPaused  = timerState.taskId === task.id && timerState.status === "paused";
                const isThisTask = timerState.taskId === task.id;
                const statusColors: Record<string, string> = {
                  "Completed": "bg-emerald-100 text-emerald-700",
                  "In Progress": "bg-blue-100 text-blue-700",
                  "Pending": "bg-yellow-100 text-yellow-700",
                  "Confirmed": "bg-purple-100 text-purple-700",
                  "Not Started": "bg-slate-100 text-slate-600",
                };
                const done = task.status === "Completed";
                return (
                  <div key={task.id} className={cn("bg-white border rounded-lg px-3 py-2.5 flex items-start gap-2.5 shadow-sm transition-opacity", done && "opacity-60")}>
                    {/* Done toggle */}
                    <button
                      onClick={() => patchTask(task.id, { status: done ? "Not Started" : "Completed" })}
                      disabled={isSaving}
                      className={cn("mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                        done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 hover:border-emerald-400")}
                      title={done ? "Mark not started" : "Mark complete"}
                    >
                      {done && <Check className="w-3 h-3" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <button onClick={() => scrollToTask(task)} className="w-full text-left group">
                        <p className={cn("text-xs font-medium text-slate-800 truncate group-hover:text-[#266b75] group-hover:underline transition-colors", done && "line-through text-slate-400")}>{task.title}</p>
                        {task.client_name && <p className="text-[10px] text-slate-400 truncate">{task.client_name}</p>}
                      </button>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", statusColors[task.status] ?? "bg-slate-100 text-slate-600")}>
                          {task.status}
                        </span>
                        {isThisTask && timerState.status !== "idle" && (
                          <span className={cn("font-mono text-[10px] font-semibold tabular-nums", isRunning ? "text-[#266b75]" : "text-amber-600")}>
                            {String(Math.floor(elapsedMs / 3600000)).padStart(2,"0")}:{String(Math.floor((elapsedMs % 3600000) / 60000)).padStart(2,"0")}:{String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2,"0")}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Timer buttons */}
                    {isRunning ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => handleTimerClick(task)}
                          disabled={isSaving}
                          title="Pause timer"
                          className="w-7 h-7 rounded-full flex items-center justify-center bg-amber-500 text-white shadow-sm transition-all disabled:opacity-40 hover:bg-amber-600"
                        >
                          <Pause className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => saveAndStop()}
                          disabled={isSaving}
                          title="Stop & save timer"
                          className="w-7 h-7 rounded-full flex items-center justify-center bg-red-500 text-white shadow-sm transition-all disabled:opacity-40 hover:bg-red-600"
                        >
                          <Square className="w-3 h-3 fill-current" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleTimerClick(task)}
                        disabled={isSaving}
                        title={isPaused ? "Resume timer" : "Start timer"}
                        className={cn(
                          "shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-all disabled:opacity-40",
                          isPaused ? "bg-amber-500 text-white shadow-sm hover:bg-amber-600"
                            : "bg-slate-800 text-white hover:bg-slate-600"
                        )}
                      >
                        <Play className="w-3 h-3" />
                      </button>
                    )}
                    {/* Unpin */}
                    <button
                      onClick={() => patchTask(task.id, { is_pinned: false })}
                      disabled={isSaving}
                      className="shrink-0 w-5 h-5 flex items-center justify-center text-amber-400 hover:text-slate-400 transition-colors mt-1"
                      title="Unpin"
                    >
                      <PinOff className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Queue (Next Up) ─────────────────────────────────────────────── */}
      {(() => {
        const queued = tasks.filter(t => t.queue_position !== null && t.queue_position !== undefined)
          .sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
        if (queued.length === 0) return null;
        const moveInQueue = async (task: ApiTask, direction: "up" | "down") => {
          const sorted = [...queued];
          const idx = sorted.findIndex(t => t.id === task.id);
          const swapIdx = direction === "up" ? idx - 1 : idx + 1;
          if (swapIdx < 0 || swapIdx >= sorted.length) return;
          const other = sorted[swapIdx];
          await Promise.all([
            patchTask(task.id, { queue_position: other.queue_position }),
            patchTask(other.id, { queue_position: task.queue_position }),
          ]);
        };
        return (
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-semibold text-sky-800">Queue — Next Up</h3>
              <span className="text-xs text-sky-600 bg-sky-100 rounded-full px-2 py-0.5">{queued.length}</span>
              <button
                onClick={async () => {
                  if (!window.confirm("Remove all tasks from the queue?")) return;
                  await Promise.all(queued.map(t => patchTask(t.id, { queue_position: null })));
                  toast({ title: "Queue cleared" });
                }}
                className="ml-auto text-xs text-slate-400 hover:text-red-500 transition-colors"
                title="Clear queue"
              >
                Clear all
              </button>
            </div>
            <div className="space-y-1.5">
              {queued.map((task, idx) => {
                const isSaving = saving.has(task.id);
                const done = task.status === "Completed";
                const isThisTask = timerState.taskId === task.id;
                const isRunning  = isThisTask && timerState.status === "running";
                const isPaused   = isThisTask && timerState.status === "paused";
                return (
                  <div key={task.id} className={cn("bg-white border border-sky-100 rounded-lg px-3 py-2 flex items-center gap-2 shadow-sm transition-opacity", done && "opacity-60")}>
                    {/* Position badge */}
                    <span className="w-5 h-5 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>

                    {/* Done toggle */}
                    <button
                      onClick={() => patchTask(task.id, { status: done ? "Not Started" : "Completed" })}
                      disabled={isSaving}
                      className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                        done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 hover:border-emerald-400")}
                      title={done ? "Mark not started" : "Mark complete"}
                    >
                      {done && <Check className="w-3 h-3" />}
                    </button>

                    {/* Title + timer readout */}
                    <div className="flex-1 min-w-0">
                      <button onClick={() => scrollToTask(task)} className="w-full text-left group">
                        <p className={cn("text-xs font-medium text-slate-800 truncate group-hover:text-[#266b75] group-hover:underline transition-colors", done && "line-through text-slate-400")}>{task.title}</p>
                        {task.client_name && <p className="text-[10px] text-slate-400 truncate">{task.client_name}</p>}
                      </button>
                      {isThisTask && timerState.status !== "idle" && (
                        <span className={cn("font-mono text-[10px] font-semibold tabular-nums", isRunning ? "text-[#266b75]" : "text-amber-600")}>
                          {String(Math.floor(elapsedMs / 3600000)).padStart(2,"0")}:{String(Math.floor((elapsedMs % 3600000) / 60000)).padStart(2,"0")}:{String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2,"0")}
                        </span>
                      )}
                    </div>

                    {/* Timer buttons */}
                    {isRunning ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => handleTimerClick(task)} disabled={isSaving}
                          title="Pause timer"
                          className="w-6 h-6 rounded-full flex items-center justify-center bg-amber-500 text-white shadow-sm transition-all disabled:opacity-40 hover:bg-amber-600">
                          <Pause className="w-3 h-3" />
                        </button>
                        <button onClick={() => saveAndStop()} disabled={isSaving}
                          title="Stop & save timer"
                          className="w-6 h-6 rounded-full flex items-center justify-center bg-red-500 text-white shadow-sm transition-all disabled:opacity-40 hover:bg-red-600">
                          <Square className="w-3 h-3 fill-current" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => handleTimerClick(task)} disabled={isSaving || done}
                        title={isPaused ? "Resume timer" : "Start timer"}
                        className={cn("shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all disabled:opacity-40",
                          isPaused ? "bg-amber-500 text-white shadow-sm hover:bg-amber-600"
                            : "bg-slate-700 text-white hover:bg-slate-500")}>
                        <Play className="w-3 h-3" />
                      </button>
                    )}

                    {/* Reorder + remove */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => moveInQueue(task, "up")} disabled={idx === 0 || isSaving}
                        className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-sky-600 disabled:opacity-30 transition-colors" title="Move up">
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button onClick={() => moveInQueue(task, "down")} disabled={idx === queued.length - 1 || isSaving}
                        className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-sky-600 disabled:opacity-30 transition-colors" title="Move down">
                        <ArrowDown className="w-3 h-3" />
                      </button>
                      <button onClick={() => patchTask(task.id, { queue_position: null })} disabled={isSaving}
                        className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-red-500 disabled:opacity-30 transition-colors ml-1" title="Remove from queue">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm min-w-[180px]">
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search tasks…"
            className="bg-transparent border-none outline-none text-sm text-slate-700 placeholder-slate-400 w-full"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="text-slate-400 hover:text-slate-600 transition-colors shrink-0">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}
            className="text-slate-700 bg-transparent border-none outline-none cursor-pointer text-sm">
            <option value="all">All Clients</option>
            {clientNames.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)}
            className="text-slate-700 bg-transparent border-none outline-none cursor-pointer text-sm">
            <option value="all">All Service Types</option>
            {SERVICE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="text-slate-700 bg-transparent border-none outline-none cursor-pointer text-sm">
            <option value="all">All Statuses</option>
            <option value="incomplete">Incomplete</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {displayed.length !== tasks.length && (
          <span className="text-xs text-slate-400">Showing {displayed.length} of {tasks.length}</span>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (() => {
        const allSel = displayed.every(t => selectedIds.has(t.id));
        return (
          <div className="flex flex-wrap items-center gap-3 bg-[#266b75] text-white rounded-xl px-4 py-3 shadow-md">
            <div className="flex items-center gap-2 mr-2">
              <span className="font-semibold text-sm">{selectedIds.size} selected</span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-white/70 hover:text-white transition-colors text-xs underline"
              >
                Clear
              </button>
              {!allSel && (
                <button
                  onClick={() => setSelectedIds(new Set(displayed.map(t => t.id)))}
                  className="text-white/70 hover:text-white transition-colors text-xs underline"
                >
                  Select all {displayed.length}
                </button>
              )}
            </div>

            {/* Status update */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-white/70 font-medium">Status:</span>
              <select
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value)}
                className="text-xs text-slate-800 bg-white border-0 rounded px-2 py-1 outline-none"
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button
                onClick={() => handleBulkAction("update_status")}
                disabled={isBulkActing}
                className="text-xs font-medium bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
              >
                Apply
              </button>
            </div>

            {/* Client update */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-white/70 font-medium">Client:</span>
              <select
                value={bulkClientId}
                onChange={e => setBulkClientId(e.target.value)}
                className="text-xs text-slate-800 bg-white border-0 rounded px-2 py-1 outline-none"
              >
                <option value="">— pick —</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.contact_name?.trim() || c.name}</option>)}
              </select>
              <button
                onClick={() => { if (!bulkClientId) return; handleBulkAction("update_client"); }}
                disabled={isBulkActing || !bulkClientId}
                className="text-xs font-medium bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
              >
                Apply
              </button>
            </div>

            {/* Add to Queue */}
            <button
              onClick={handleBulkAddToQueue}
              disabled={isBulkActing}
              className="flex items-center gap-1.5 text-xs font-medium bg-sky-500/80 hover:bg-sky-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {isBulkActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ListOrdered className="w-3 h-3" />}
              Add to Queue
            </button>

            {/* Delete */}
            <button
              onClick={() => handleBulkAction("delete")}
              disabled={isBulkActing}
              className="ml-auto flex items-center gap-1.5 text-xs font-medium bg-red-500/80 hover:bg-red-500 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {isBulkActing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Delete {selectedIds.size}
            </button>
          </div>
        );
      })()}

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading tasks…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {/* Select-all checkbox */}
                  <th className="px-2 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={displayed.length > 0 && displayed.every(t => selectedIds.has(t.id))}
                      ref={el => { if (el) el.indeterminate = displayed.some(t => selectedIds.has(t.id)) && !displayed.every(t => selectedIds.has(t.id)); }}
                      onChange={e => setSelectedIds(e.target.checked ? new Set(displayed.map(t => t.id)) : new Set())}
                      className="w-3.5 h-3.5 rounded border-slate-300 accent-[#266b75] cursor-pointer"
                    />
                  </th>
                  <th className="px-1 py-2 w-8" />
                  <th className="px-2 py-2 w-12" />
                  {(["status", "client_name", null, null, null, null, "due_date", null, null] as const).map((field, i) => {
                    const labels = ["Status", "Client", "Service Type", "Frequency", "Day", "Task Description", "Due Date", "Assigned", "Completed"];
                    const label = labels[i]!;
                    if (!field) return (
                      <th key={label} className="text-left px-2 py-2 font-medium text-slate-500 text-xs">{label}</th>
                    );
                    const isActive = sortField === field;
                    const Icon = isActive ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                    return (
                      <th key={label} className="text-left px-2 py-2 font-medium text-slate-500 text-xs">
                        <button
                          onClick={() => handleSort(field)}
                          className={cn(
                            "inline-flex items-center gap-1 hover:text-[#266b75] transition-colors",
                            isActive && "text-[#266b75]",
                          )}
                        >
                          {label}
                          <Icon className="w-3 h-3" />
                        </button>
                      </th>
                    );
                  })}
                  <th className="px-1 py-2 w-8" />
                  <th className="px-2 py-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {showNewRow && (
                  <NewTaskRow
                    clients={clients}
                    assigneeOptions={assigneeOptions}
                    onSave={createTask}
                    onCancel={() => setShowNewRow(false)}
                    saving={creatingTask}
                  />
                )}
                {displayed.length === 0 && !showNewRow ? (
                  <tr>
                    <td colSpan={13} className="py-16 text-center text-slate-400 text-sm">
                      No tasks match your filters.
                    </td>
                  </tr>
                ) : displayed.map((task, i) => {
                  const isOverdue  = task.status !== "Completed" && !!task.due_date && task.due_date < today;
                  const isThisTask = timerState.taskId === task.id;
                  const isRunning  = isThisTask && timerState.status === "running";
                  const isPaused   = isThisTask && timerState.status === "paused";
                  const isSaving   = saving.has(task.id);
                  const isExpanded = expanded.has(task.id);
                  const { freq, days, monthDay } = parseRecurrence(task.recurrence);
                  const pendingSubtasks = task.incomplete_subtask_count ?? 0;

                  return (
                    <React.Fragment key={task.id}>
                      <tr
                        ref={el => { if (el) rowRefs.current.set(task.id, el); else rowRefs.current.delete(task.id); }}
                        className={cn(
                        "border-b border-slate-100 transition-colors",
                        highlightedTaskId === task.id ? "bg-amber-100 ring-2 ring-inset ring-amber-400"
                          : selectedIds.has(task.id) ? "bg-[#266b75]/5" : isThisTask ? "bg-[#266b75]/5" : "hover:bg-slate-50/50",
                        isExpanded && "border-b-0",
                      )}>
                        {/* Row checkbox */}
                        <td className="px-2 py-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(task.id)}
                            onChange={() => toggleSelect(task.id)}
                            className="w-3.5 h-3.5 rounded border-slate-300 accent-[#266b75] cursor-pointer"
                          />
                        </td>
                        {/* Expand toggle */}
                        <td className="px-2 py-2">
                          <div className="relative inline-flex">
                            <button
                              onClick={() => setExpanded(prev => {
                                const n = new Set(prev);
                                n.has(task.id) ? n.delete(task.id) : n.add(task.id);
                                return n;
                              })}
                              className={cn(
                                "w-6 h-6 flex items-center justify-center rounded transition-all",
                                isExpanded
                                  ? "bg-[#266b75] text-white"
                                  : "text-slate-500 hover:text-[#266b75] hover:bg-[#266b75]/10"
                              )}
                              title={isExpanded ? "Collapse subtasks" : `${pendingSubtasks} subtask${pendingSubtasks !== 1 ? "s" : ""} pending`}
                            >
                              {isExpanded
                                ? <ChevronDown className="w-3.5 h-3.5" />
                                : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                            {pendingSubtasks > 0 && !isExpanded && (
                              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center rounded-full bg-amber-400 text-white text-[9px] font-bold leading-none shadow-sm">
                                {pendingSubtasks > 9 ? "9+" : pendingSubtasks}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Timer */}
                        <td className="px-3 py-2">
                          <div className="flex flex-col items-center gap-0.5">
                            <button
                              onClick={() => handleTimerClick(task)}
                              title={isRunning ? "Pause timer" : isPaused ? "Resume timer" : "Start timer"}
                              className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center transition-all",
                                isRunning ? "bg-[#266b75] text-white shadow-sm"
                                  : isPaused  ? "bg-amber-500 text-white shadow-sm"
                                  : "bg-slate-900 text-white hover:bg-slate-700"
                              )}
                            >
                              {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            </button>
                            {isThisTask && timerState.status !== "idle" && (
                              <div className="flex items-center gap-0.5">
                                <span className={cn(
                                  "font-mono text-[10px] font-semibold tabular-nums leading-none",
                                  isRunning ? "text-[#266b75]" : "text-amber-600"
                                )}>
                                  {fmtElapsed(elapsedMs)}
                                </span>
                                <button
                                  onClick={e => handleStopTimer(e, task)}
                                  title="Stop timer"
                                  className="w-3.5 h-3.5 flex items-center justify-center text-red-400 hover:text-red-600"
                                >
                                  <Square className="w-2.5 h-2.5 fill-current" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-2 py-2">
                          <EditableSelect
                            value={task.status}
                            options={STATUS_OPTIONS}
                            saving={isSaving}
                            onSave={v => patchTask(task.id, { status: v ?? "Not Started" })}
                            renderValue={v => (
                              <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", statusBadgeCls(v ?? ""))}>
                                {v}
                              </span>
                            )}
                          />
                        </td>

                        {/* Client — editable dropdown */}
                        <td className="px-2 py-2 text-xs whitespace-nowrap">
                          <EditableSelect
                            value={task.client_name}
                            options={clients.map(c => c.contact_name?.trim() || c.name)}
                            saving={isSaving}
                            placeholder="— Client —"
                            onSave={v => {
                              const client = clients.find(c => (c.contact_name?.trim() || c.name) === v);
                              if (client) patchTask(task.id, { client_id: client.id, client_name: client.contact_name?.trim() || client.name });
                            }}
                            renderValue={v => v
                              ? <span className="text-slate-700 text-xs">{v}</span>
                              : <span className="text-slate-500 italic text-xs">—</span>}
                          />
                        </td>

                        {/* Service type */}
                        <td className="px-2 py-2">
                          <EditableSelect
                            value={task.service_type}
                            options={SERVICE_OPTIONS}
                            saving={isSaving}
                            placeholder="None"
                            onSave={v => patchTask(task.id, { service_type: v })}
                            renderValue={v => v ? (
                              <span className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                                v === "Bookkeeping"
                                  ? "bg-violet-50 text-violet-700 border border-violet-200"
                                  : "bg-sky-50 text-sky-700 border border-sky-200"
                              )}>
                                {v}
                              </span>
                            ) : <span className="text-slate-500 italic text-xs">None</span>}
                          />
                        </td>

                        {/* Frequency */}
                        <td className="px-2 py-2 whitespace-nowrap">
                          <EditableSelect
                            value={freq || null}
                            options={FREQ_OPTIONS}
                            saving={isSaving}
                            placeholder="One-Time"
                            onSave={v => patchTask(task.id, { recurrence: buildRecurrence(v ?? "", [], "") })}
                            renderValue={v => v
                              ? <span className="text-slate-600 text-xs">{v}</span>
                              : <span className="text-slate-500 italic text-xs">One-Time</span>}
                          />
                        </td>

                        {/* Day — multi for Weekly, single for Monthly */}
                        <td className="px-2 py-2 whitespace-nowrap">
                          {freq === "Weekly" ? (
                            <WeekdayMultiSelect
                              selectedDays={days}
                              saving={isSaving}
                              onSave={newDays => patchTask(task.id, { recurrence: buildRecurrence("Weekly", newDays, "") })}
                            />
                          ) : freq === "Monthly" ? (
                            <EditableSelect
                              value={monthDay || null}
                              options={MONTHLY_DAY_OPTIONS.map(d => d.value)}
                              saving={isSaving}
                              placeholder="Any"
                              onSave={v => patchTask(task.id, { recurrence: buildRecurrence("Monthly", [], v ?? "") })}
                              renderValue={v => v
                                ? <span className="text-slate-600 text-xs">{v === "last" ? "Last day" : `Day ${v}`}</span>
                                : <span className="text-slate-500 italic text-xs">Any</span>}
                            />
                          ) : (
                            <span className="text-slate-500 italic text-xs">—</span>
                          )}
                        </td>

                        {/* Task description */}
                        <td className="px-2 py-2 min-w-[180px]">
                          <div className="flex items-center gap-1.5">
                            <EditableText
                              value={task.title}
                              saving={isSaving}
                              placeholder="Task description"
                              strikethrough={task.status === "Completed"}
                              onSave={v => patchTask(task.id, { title: v })}
                              forceEdit={editingTaskId === task.id}
                              onForceEditConsumed={() => setEditingTaskId(null)}
                            />
                            {task.asana_gid && (
                              <a
                                href={`https://app.asana.com/0/0/${task.asana_gid}/f`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                title="Open in Asana"
                                className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-50 text-orange-500 border border-orange-200 leading-none hover:bg-orange-100 transition-colors"
                              >
                                Asana
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                            {task.clickup_task_id && (
                              <a
                                href={`https://app.clickup.com/t/${task.clickup_task_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                title="Open in ClickUp"
                                className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-600 border border-purple-200 leading-none hover:bg-purple-100 transition-colors"
                              >
                                CU
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                            {task.missive_conversation_id && (
                              <a
                                href={`https://mail.missiveapp.com/#conversations/${task.missive_conversation_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                title="Open in Missive"
                                className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-600 border border-sky-200 leading-none hover:bg-sky-100 transition-colors"
                              >
                                Missive
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Due date */}
                        <td className="px-2 py-2">
                          <EditableDate
                            value={task.due_date}
                            saving={isSaving}
                            isOverdue={isOverdue}
                            onSave={v => patchTask(task.id, { due_date: v })}
                          />
                        </td>

                        {/* Assigned to */}
                        <td className="px-2 py-2">
                          <EditableSelect
                            value={task.assigned_to}
                            options={assigneeOptions}
                            saving={isSaving}
                            placeholder="Unassigned"
                            onSave={v => patchTask(task.id, { assigned_to: v || null })}
                            renderValue={v => v
                              ? <span className="text-slate-700 text-xs">{v}</span>
                              : <span className="text-slate-500 italic text-xs">Unassigned</span>}
                          />
                        </td>

                        {/* Completed date */}
                        <td className="px-2 py-2">
                          <EditableDate
                            value={task.completed_date}
                            saving={isSaving}
                            isOverdue={false}
                            onSave={v => patchTask(task.id, { completed_date: v })}
                          />
                        </td>

                        {/* Pencil — edit task title inline */}
                        <td className="px-1 py-2">
                          <button
                            onClick={() => setEditingTaskId(task.id)}
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-[#266b75] hover:bg-[#266b75]/10 transition-colors"
                            title="Edit task"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>

                        {/* Pin */}
                        <td className="px-1 py-2">
                          <button
                            onClick={() => patchTask(task.id, { is_pinned: !task.is_pinned })}
                            disabled={isSaving}
                            className={cn("w-6 h-6 rounded flex items-center justify-center transition-colors disabled:opacity-40",
                              task.is_pinned
                                ? "text-amber-500 bg-amber-50 hover:bg-amber-100"
                                : "text-slate-400 hover:text-amber-500 hover:bg-amber-50")}
                            title={task.is_pinned ? "Unpin from daily tasks" : "Pin to daily tasks"}
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                        </td>

                        {/* Queue */}
                        <td className="px-1 py-2">
                          {task.queue_position !== null && task.queue_position !== undefined ? (
                            <button
                              onClick={() => patchTask(task.id, { queue_position: null })}
                              disabled={isSaving}
                              className="w-6 h-6 rounded flex items-center justify-center text-sky-500 bg-sky-50 hover:bg-sky-100 transition-colors disabled:opacity-40"
                              title="Remove from queue"
                            >
                              <ListOrdered className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                const maxPos = Math.max(0, ...tasks.filter(t => t.queue_position !== null && t.queue_position !== undefined).map(t => t.queue_position as number));
                                patchTask(task.id, { queue_position: maxPos + 1 });
                              }}
                              disabled={isSaving}
                              className="w-6 h-6 rounded flex items-center justify-center text-slate-400 hover:text-sky-500 hover:bg-sky-50 transition-colors disabled:opacity-40"
                              title="Add to queue"
                            >
                              <ListOrdered className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>

                        {/* Delete */}
                        <td className="px-2 py-2">
                          <button
                            onClick={() => deleteTask(task.id)}
                            disabled={isSaving}
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-500 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Delete task"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>

                      {/* Subtask expand panel */}
                      {isExpanded && <SubtaskPanel taskId={task.id} />}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
