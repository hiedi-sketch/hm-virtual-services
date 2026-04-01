import React, { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Filter, Plus, Play, Pause, Square, Loader2,
  ChevronRight, ChevronDown, Check, X, Trash2, ClipboardList,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTimer } from "@/contexts/TimerContext";

// ── Types ──────────────────────────────────────────────────────────────────

interface ApiTask {
  id: number;
  title: string;
  description: string | null;
  client_id: number;
  client_name: string | null;
  assigned_to: string | null;
  status: string;
  due_date: string | null;
  completed_date: string | null;
  recurrence: string | null;
  last_generated_at: string | null;
  service_type: string | null;
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
  company: string | null;
}

// ── Constants ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ["Not Started", "Pending", "In Progress", "Confirmed", "Completed"];
const SERVICE_OPTIONS = ["Bookkeeping", "Virtual Assistant"];
const FREQ_OPTIONS = ["Daily", "Weekdays", "Weekly", "Monthly", "Annually"];
const WEEKDAY_OPTIONS = [
  { value: "sun", label: "Sunday" },
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
];
const MONTHLY_DAY_OPTIONS = [
  ...Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Day ${i + 1}` })),
  { value: "last", label: "Last day" },
];

// ── Recurrence helpers ───────────────────────────────────────────────────────

function parseRecurrence(rec: string | null | undefined): { freq: string; day: string } {
  if (!rec) return { freq: "", day: "" };
  if (rec === "daily") return { freq: "Daily", day: "" };
  if (rec === "weekdays") return { freq: "Weekdays", day: "" };
  if (rec === "weekly") return { freq: "Weekly", day: "" };
  if (rec.startsWith("weekly_")) return { freq: "Weekly", day: rec.replace("weekly_", "") };
  if (rec === "monthly") return { freq: "Monthly", day: "" };
  if (rec.startsWith("monthly_")) return { freq: "Monthly", day: rec.replace("monthly_", "") };
  if (rec === "annually") return { freq: "Annually", day: "" };
  return { freq: "", day: "" };
}

function buildRecurrence(freq: string, day: string): string | null {
  if (!freq) return null;
  if (freq === "Daily") return "daily";
  if (freq === "Weekdays") return "weekdays";
  if (freq === "Weekly") return day ? `weekly_${day}` : "weekly";
  if (freq === "Monthly") return day ? `monthly_${day}` : "monthly";
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
  value, onSave, saving, className, placeholder, strikethrough,
}: {
  value: string; onSave: (v: string) => void; saving: boolean;
  className?: string; placeholder?: string; strikethrough?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

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
      {value || <span className="text-slate-300 italic text-xs">{placeholder ?? "Click to edit"}</span>}
      {saving && <Loader2 className="w-3 h-3 animate-spin inline ml-1 text-slate-400" />}
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
        isOverdue ? "text-red-600 font-medium" : "text-slate-600",
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
          : <span className="text-slate-300 italic text-xs">{placeholder ?? "—"}</span>
      )}
    </button>
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
      if (!res.ok) throw new Error("Failed to load subtasks");
      return res.json();
    },
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
      await fetch(`/api/subtasks/${id}`, { method: "DELETE", credentials: "include" });
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
    <tr className="bg-slate-50/60 border-b border-slate-100">
      <td colSpan={12} className="px-12 py-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading subtasks…
          </div>
        ) : (
          <div className="space-y-1.5">
            {subtasks.length === 0 && (
              <p className="text-xs text-slate-300 italic">No subtasks yet.</p>
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
            <div className="flex items-center gap-2 mt-2">
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addSubtask(); }}
                placeholder="Add subtask…"
                className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 bg-white outline-none focus:border-[#266b75] transition-colors"
              />
              <button
                onClick={addSubtask}
                disabled={adding || !newTitle.trim()}
                className="text-xs text-white bg-[#266b75] hover:bg-[#1f5560] rounded px-2 py-1 transition-colors disabled:opacity-50"
              >
                {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add"}
              </button>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

// ── New Task inline row ───────────────────────────────────────────────────────

function NewTaskRow({
  clients, onSave, onCancel, saving,
}: {
  clients: ApiClient[];
  onSave: (data: Partial<ApiTask>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({
    title: "", client_id: "", service_type: "",
    status: "Not Started", due_date: "", assigned_to: "",
    freq: "", day: "",
  });

  const set = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const dayOptions = form.freq === "Weekly"
    ? WEEKDAY_OPTIONS
    : form.freq === "Monthly"
    ? MONTHLY_DAY_OPTIONS
    : [];

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.client_id) return;
    await onSave({
      title: form.title.trim(),
      client_id: Number(form.client_id),
      service_type: form.service_type || null,
      status: form.status,
      due_date: form.due_date || null,
      assigned_to: form.assigned_to.trim() || null,
      recurrence: buildRecurrence(form.freq, form.day),
    });
  };

  return (
    <tr className="border-b border-[#266b75]/20 bg-[#266b75]/5">
      <td className="px-2 py-2" />
      <td className="px-3 py-2" />
      {/* Status */}
      <td className="px-4 py-2">
        <select value={form.status} onChange={e => set("status", e.target.value)}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-[#266b75]">
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      {/* Client */}
      <td className="px-4 py-2">
        <select value={form.client_id} onChange={e => set("client_id", e.target.value)} required
          className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-[#266b75] w-36">
          <option value="">— Client —</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.name}{c.company ? ` (${c.company})` : ""}</option>
          ))}
        </select>
      </td>
      {/* Service type */}
      <td className="px-4 py-2">
        <select value={form.service_type} onChange={e => set("service_type", e.target.value)}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-[#266b75]">
          <option value="">— None —</option>
          {SERVICE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      {/* Frequency */}
      <td className="px-4 py-2">
        <select value={form.freq} onChange={e => { set("freq", e.target.value); set("day", ""); }}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-[#266b75]">
          <option value="">One-Time</option>
          {FREQ_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </td>
      {/* Day */}
      <td className="px-4 py-2">
        {dayOptions.length > 0 ? (
          <select value={form.day} onChange={e => set("day", e.target.value)}
            className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-[#266b75]">
            <option value="">Any</option>
            {dayOptions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        ) : <span className="text-slate-300 text-xs">—</span>}
      </td>
      {/* Title */}
      <td className="px-4 py-2">
        <input
          autoFocus
          value={form.title}
          onChange={e => set("title", e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") onCancel(); }}
          placeholder="Task description…"
          className="w-full min-w-[160px] text-xs border border-[#266b75] rounded px-1.5 py-1 bg-white outline-none shadow-sm"
        />
      </td>
      {/* Due date */}
      <td className="px-4 py-2">
        <input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)}
          className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-[#266b75]" />
      </td>
      {/* Assigned */}
      <td className="px-4 py-2">
        <input value={form.assigned_to} onChange={e => set("assigned_to", e.target.value)}
          placeholder="Assignee"
          className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white outline-none focus:border-[#266b75] w-24" />
      </td>
      {/* Completed date placeholder */}
      <td className="px-4 py-2" />
      {/* Actions */}
      <td className="px-4 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={handleSubmit}
            disabled={saving || !form.title.trim() || !form.client_id}
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
  const { startForTask, pause, stop, state: timerState, elapsedMs } = useTimer();

  const [clientFilter, setClientFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showNewRow, setShowNewRow] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);

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

  // ── Mutations ─────────────────────────────────────────────────────────────

  const patchTask = useCallback(async (id: number, fields: Record<string, unknown>) => {
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
  }, [queryClient, toast, refetch]);

  const deleteTask = useCallback(async (id: number) => {
    if (!confirm("Delete this task?")) return;
    setSaving(prev => new Set(prev).add(id));
    try {
      queryClient.setQueryData<ApiTask[]>(["api-tasks"], old => (old ?? []).filter(t => t.id !== id));
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
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

  // ── Timer ─────────────────────────────────────────────────────────────────

  const handleTimerClick = (task: ApiTask) => {
    const isThisTask = timerState.taskId === task.id;
    if (isThisTask) {
      if (timerState.status === "running") pause();
      else startForTask(task.id, task.title, null, task.client_name ?? null, (task.service_type as any) ?? null);
    } else {
      startForTask(task.id, task.title, null, task.client_name ?? null, (task.service_type as any) ?? null);
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

  const displayed = useMemo(() => tasks.filter(t => {
    if (clientFilter !== "all" && t.client_name !== clientFilter) return false;
    if (serviceFilter !== "all" && t.service_type !== serviceFilter) return false;
    if (statusFilter === "incomplete" && t.status === "Completed") return false;
    if (statusFilter !== "all" && statusFilter !== "incomplete" && t.status !== statusFilter) return false;
    return true;
  }), [tasks, clientFilter, serviceFilter, statusFilter]);

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
        <button
          onClick={() => setShowNewRow(true)}
          disabled={showNewRow}
          className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#266b75] hover:bg-[#1f5560] rounded-lg px-3 py-2 transition-colors disabled:opacity-60 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          New Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          {
            value: clientFilter, onChange: setClientFilter,
            opts: clientNames, allLabel: "All Clients",
          },
          {
            value: serviceFilter, onChange: setServiceFilter,
            opts: SERVICE_OPTIONS, allLabel: "All Service Types",
          },
          {
            value: statusFilter, onChange: setStatusFilter,
            opts: [...STATUS_OPTIONS], allLabel: "All Statuses",
            extra: [{ value: "incomplete", label: "Incomplete" }],
          },
        ].map(({ value, onChange, opts, allLabel, extra }, fi) => (
          <div key={fi} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select value={value} onChange={e => onChange(e.target.value)}
              className="text-slate-700 bg-transparent border-none outline-none cursor-pointer text-sm">
              <option value="all">{allLabel}</option>
              {extra?.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              {opts.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}
        {displayed.length !== tasks.length && (
          <span className="text-xs text-slate-400">Showing {displayed.length} of {tasks.length}</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading tasks…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-2 py-3 w-8" />
                  <th className="px-3 py-3 w-14" />
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Service Type</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Frequency</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Day</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Task Description</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Due Date</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Assigned</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Completed</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {showNewRow && (
                  <NewTaskRow
                    clients={clients}
                    onSave={createTask}
                    onCancel={() => setShowNewRow(false)}
                    saving={creatingTask}
                  />
                )}
                {displayed.length === 0 && !showNewRow ? (
                  <tr>
                    <td colSpan={12} className="py-16 text-center text-slate-400 text-sm">
                      No tasks match your filters.
                    </td>
                  </tr>
                ) : displayed.map((task, i) => {
                  const isOverdue = task.status !== "Completed" && !!task.due_date && task.due_date < today;
                  const isThisTask = timerState.taskId === task.id;
                  const isRunning  = isThisTask && timerState.status === "running";
                  const isPaused   = isThisTask && timerState.status === "paused";
                  const isSaving   = saving.has(task.id);
                  const isExpanded = expanded.has(task.id);
                  const { freq, day } = parseRecurrence(task.recurrence);

                  return (
                    <React.Fragment key={task.id}>
                      <tr className={cn(
                        "border-b border-slate-50 transition-colors",
                        i === displayed.length - 1 && !isExpanded && "border-b-0",
                        isThisTask ? "bg-[#266b75]/5" : "hover:bg-slate-50/30"
                      )}>
                        {/* Expand toggle */}
                        <td className="px-2 py-2">
                          <button
                            onClick={() => setExpanded(prev => {
                              const n = new Set(prev);
                              n.has(task.id) ? n.delete(task.id) : n.add(task.id);
                              return n;
                            })}
                            className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-[#266b75] transition-colors rounded"
                            title={isExpanded ? "Collapse subtasks" : "Expand subtasks"}
                          >
                            {isExpanded
                              ? <ChevronDown className="w-3.5 h-3.5" />
                              : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
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
                        <td className="px-4 py-3">
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

                        {/* Client (read-only display) */}
                        <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                          {task.client_name ?? <span className="text-slate-300 italic">—</span>}
                        </td>

                        {/* Service type */}
                        <td className="px-4 py-3">
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
                            ) : <span className="text-slate-300 italic text-xs">None</span>}
                          />
                        </td>

                        {/* Frequency */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <EditableSelect
                            value={freq || null}
                            options={FREQ_OPTIONS}
                            saving={isSaving}
                            placeholder="One-Time"
                            onSave={v => patchTask(task.id, { recurrence: buildRecurrence(v ?? "", "") })}
                            renderValue={v => v
                              ? <span className="text-slate-600 text-xs">{v}</span>
                              : <span className="text-slate-300 italic text-xs">One-Time</span>}
                          />
                        </td>

                        {/* Day */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          {freq === "Weekly" ? (
                            <EditableSelect
                              value={day || null}
                              options={WEEKDAY_OPTIONS.map(d => d.value)}
                              saving={isSaving}
                              placeholder="Any"
                              onSave={v => patchTask(task.id, { recurrence: buildRecurrence("Weekly", v ?? "") })}
                              renderValue={v => v
                                ? <span className="text-slate-600 text-xs">{WEEKDAY_OPTIONS.find(d => d.value === v)?.label.slice(0, 3) ?? v}</span>
                                : <span className="text-slate-300 italic text-xs">Any</span>}
                            />
                          ) : freq === "Monthly" ? (
                            <EditableSelect
                              value={day || null}
                              options={MONTHLY_DAY_OPTIONS.map(d => d.value)}
                              saving={isSaving}
                              placeholder="Any"
                              onSave={v => patchTask(task.id, { recurrence: buildRecurrence("Monthly", v ?? "") })}
                              renderValue={v => v
                                ? <span className="text-slate-600 text-xs">{v === "last" ? "Last" : `Day ${v}`}</span>
                                : <span className="text-slate-300 italic text-xs">Any</span>}
                            />
                          ) : (
                            <span className="text-slate-300 italic text-xs">—</span>
                          )}
                        </td>

                        {/* Task description */}
                        <td className="px-4 py-3 min-w-[180px]">
                          <EditableText
                            value={task.title}
                            saving={isSaving}
                            placeholder="Task description"
                            strikethrough={task.status === "Completed"}
                            onSave={v => patchTask(task.id, { title: v })}
                          />
                        </td>

                        {/* Due date */}
                        <td className="px-4 py-3">
                          <EditableDate
                            value={task.due_date}
                            saving={isSaving}
                            isOverdue={isOverdue}
                            onSave={v => patchTask(task.id, { due_date: v })}
                          />
                        </td>

                        {/* Assigned to */}
                        <td className="px-4 py-3">
                          <EditableText
                            value={task.assigned_to ?? ""}
                            saving={isSaving}
                            placeholder="Unassigned"
                            onSave={v => patchTask(task.id, { assigned_to: v || null })}
                            className="text-xs text-slate-600"
                          />
                        </td>

                        {/* Completed date */}
                        <td className="px-4 py-3">
                          <EditableDate
                            value={task.completed_date}
                            saving={isSaving}
                            isOverdue={false}
                            onSave={v => patchTask(task.id, { completed_date: v })}
                          />
                        </td>

                        {/* Delete */}
                        <td className="px-4 py-3">
                          <button
                            onClick={() => deleteTask(task.id)}
                            disabled={isSaving}
                            className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Delete task"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>

                      {/* Subtask panel */}
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
