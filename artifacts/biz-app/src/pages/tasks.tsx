import React, { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Filter,
  RefreshCw,
  ExternalLink,
  Sheet,
  Play,
  Pause,
  Square,
  Check,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTimer } from "@/contexts/TimerContext";

// ── Types ──────────────────────────────────────────────────────────────────

interface SheetTask {
  id: number;
  task_name: string;
  client: string;
  service_type: string | null;
  frequency: string | null;
  day_spec: string | null;
  due_date: string | null;
  completed_date: string | null;
  status: string;
  sheet_row: number;
}

// ── Constants ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ["Not Started", "Pending", "In Progress", "Confirmed", "Completed"];
const SERVICE_OPTIONS = ["Bookkeeping", "Virtual Assistant"];
const FREQUENCY_OPTIONS = ["Daily", "Weekly", "Bi-Weekly", "Monthly", "Quarterly", "Annually", "One-Time"];

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Inline cell components ───────────────────────────────────────────────────

function EditableText({
  value,
  onSave,
  saving,
  className,
  placeholder,
  strikethrough,
}: {
  value: string;
  onSave: (v: string) => void;
  saving: boolean;
  className?: string;
  placeholder?: string;
  strikethrough?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) onSave(draft.trim());
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
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
        "text-left w-full rounded px-1 py-0.5 -mx-1 hover:bg-slate-100 transition-colors group relative",
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
  value,
  onSave,
  saving,
  isOverdue,
}: {
  value: string | null;
  onSave: (v: string | null) => void;
  saving: boolean;
  isOverdue: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (newVal: string) => {
    setEditing(false);
    const v = newVal || null;
    if (v !== value) onSave(v);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
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
  value,
  options,
  onSave,
  saving,
  renderValue,
  placeholder,
}: {
  value: string | null;
  options: string[];
  onSave: (v: string | null) => void;
  saving: boolean;
  renderValue?: (v: string | null) => React.ReactNode;
  placeholder?: string;
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

// ── Main component ───────────────────────────────────────────────────────────

export default function Tasks() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { startForTask, pause, stop, state: timerState, elapsedMs } = useTimer();

  const [clientFilter, setClientFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState<Set<number>>(new Set());

  const today = new Date().toLocaleDateString("sv-SE");

  const { data: sheetTasks = [], isLoading, refetch } = useQuery<SheetTask[]>({
    queryKey: ["sheet-tasks"],
    queryFn: async () => {
      const res = await fetch("/sheets-tasks/api/tasks");
      if (!res.ok) throw new Error("Failed to fetch sheet tasks");
      return res.json();
    },
    refetchInterval: 3_600_000,
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/sheets-tasks/api/sync", { method: "POST" });
      await refetch();
      toast({ title: "Synced from Google Sheet" });
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const updateTask = useCallback(async (id: number, fields: Partial<SheetTask>) => {
    setSaving(prev => new Set(prev).add(id));
    try {
      // Optimistic update
      queryClient.setQueryData<SheetTask[]>(["sheet-tasks"], old =>
        (old ?? []).map(t => t.id === id ? { ...t, ...fields } : t)
      );
      const res = await fetch(`/sheets-tasks/api/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated: SheetTask = await res.json();
      // Reconcile with server response
      queryClient.setQueryData<SheetTask[]>(["sheet-tasks"], old =>
        (old ?? []).map(t => t.id === id ? updated : t)
      );
    } catch {
      toast({ title: "Failed to save — change reverted", variant: "destructive" });
      refetch(); // revert by re-fetching
    } finally {
      setSaving(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, [queryClient, toast, refetch]);

  const handleTimerClick = (task: SheetTask) => {
    const isThisTask = timerState.taskId === task.id;
    if (isThisTask) {
      if (timerState.status === "running") pause();
      else startForTask(task.id, task.task_name, null, task.client || null, (task.service_type as any) ?? null);
    } else {
      startForTask(task.id, task.task_name, null, task.client || null, (task.service_type as any) ?? null);
    }
  };

  const handleStopTimer = (e: React.MouseEvent, task: SheetTask) => {
    e.stopPropagation();
    if (timerState.taskId === task.id) stop();
  };

  const clients = useMemo(
    () => Array.from(new Set(sheetTasks.map(t => t.client).filter(Boolean))).sort(),
    [sheetTasks]
  );
  const serviceTypes = useMemo(
    () => Array.from(new Set(sheetTasks.map(t => t.service_type).filter(Boolean))).sort() as string[],
    [sheetTasks]
  );

  const displayed = useMemo(() => sheetTasks.filter(t => {
    if (clientFilter !== "all" && t.client !== clientFilter) return false;
    if (serviceFilter !== "all" && t.service_type !== serviceFilter) return false;
    if (statusFilter === "incomplete" && t.status === "Completed") return false;
    if (statusFilter !== "all" && statusFilter !== "incomplete" && t.status !== statusFilter) return false;
    return true;
  }), [sheetTasks, clientFilter, serviceFilter, statusFilter]);

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
            <Sheet className="w-4 h-4 text-emerald-700" />
          </div>
          <div>
            <p className="text-xs text-slate-400 leading-tight">
              {isLoading
                ? "Loading…"
                : `${sheetTasks.length} tasks · click any cell to edit · syncs to Google Sheet`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/sheets-tasks/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#266b75] border border-slate-200 rounded-lg px-3 py-2 bg-white transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open full view
          </a>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#266b75] hover:bg-[#1f5560] rounded-lg px-3 py-2 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="text-slate-700 bg-transparent border-none outline-none cursor-pointer text-sm">
            <option value="all">All Clients</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select value={serviceFilter} onChange={e => setServiceFilter(e.target.value)} className="text-slate-700 bg-transparent border-none outline-none cursor-pointer text-sm">
            <option value="all">All Service Types</option>
            {serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-slate-700 bg-transparent border-none outline-none cursor-pointer text-sm">
            <option value="all">All Statuses</option>
            <option value="incomplete">Incomplete</option>
            <option value="Not Started">Not Started</option>
            <option value="Pending">Pending</option>
            <option value="In Progress">In Progress</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
        {displayed.length !== sheetTasks.length && (
          <span className="text-xs text-slate-400">Showing {displayed.length} of {sheetTasks.length}</span>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-16 text-center text-slate-400 text-sm">Loading tasks from Google Sheet…</div>
        ) : displayed.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">No tasks match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-3 py-3 w-14" />
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Service Type</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Frequency</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Day / Detail</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Task Description</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Due Date</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((task, i) => {
                  const isOverdue = task.status !== "Completed" && task.due_date && task.due_date < today;
                  const isThisTask = timerState.taskId === task.id;
                  const isRunning = isThisTask && timerState.status === "running";
                  const isPaused  = isThisTask && timerState.status === "paused";
                  const isSaving  = saving.has(task.id);

                  return (
                    <tr
                      key={task.id}
                      className={cn(
                        "border-b border-slate-50 transition-colors",
                        i === displayed.length - 1 && "border-b-0",
                        isThisTask ? "bg-[#266b75]/5" : "hover:bg-slate-50/30"
                      )}
                    >
                      {/* Play/pause + elapsed */}
                      <td className="px-3 py-2">
                        <div className="flex flex-col items-center gap-0.5">
                          <button
                            onClick={() => handleTimerClick(task)}
                            title={isRunning ? "Pause timer" : isPaused ? "Resume timer" : "Start timer"}
                            className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center transition-all",
                              isRunning ? "bg-[#266b75] text-white shadow-sm"
                                : isPaused ? "bg-amber-500 text-white shadow-sm"
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
                              <button onClick={e => handleStopTimer(e, task)} title="Stop timer" className="w-3.5 h-3.5 rounded flex items-center justify-center text-red-400 hover:text-red-600">
                                <Square className="w-2.5 h-2.5 fill-current" />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status — inline select dropdown */}
                      <td className="px-4 py-3">
                        <EditableSelect
                          value={task.status}
                          options={STATUS_OPTIONS}
                          saving={isSaving}
                          onSave={v => updateTask(task.id, { status: v ?? "Not Started" })}
                          renderValue={v => (
                            <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", statusBadgeCls(v ?? ""))}>
                              {v}
                            </span>
                          )}
                        />
                      </td>

                      {/* Client */}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        <EditableText
                          value={task.client || ""}
                          saving={isSaving}
                          placeholder="Client name"
                          onSave={v => updateTask(task.id, { client: v })}
                        />
                      </td>

                      {/* Service type — inline select */}
                      <td className="px-4 py-3">
                        <EditableSelect
                          value={task.service_type}
                          options={SERVICE_OPTIONS}
                          saving={isSaving}
                          placeholder="None"
                          onSave={v => updateTask(task.id, { service_type: v })}
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
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        <EditableSelect
                          value={task.frequency}
                          options={FREQUENCY_OPTIONS}
                          saving={isSaving}
                          placeholder="—"
                          onSave={v => updateTask(task.id, { frequency: v })}
                          renderValue={v => v
                            ? <span className="text-slate-600">{v}</span>
                            : <span className="text-slate-300 italic text-xs">—</span>}
                        />
                      </td>

                      {/* Day / Detail */}
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        <EditableText
                          value={task.day_spec || ""}
                          saving={isSaving}
                          placeholder="e.g. Tuesday"
                          onSave={v => updateTask(task.id, { day_spec: v || null as any })}
                        />
                      </td>

                      {/* Task description */}
                      <td className="px-4 py-3">
                        <EditableText
                          value={task.task_name}
                          saving={isSaving}
                          placeholder="Task description"
                          strikethrough={task.status === "Completed"}
                          className="font-medium text-slate-800"
                          onSave={v => updateTask(task.id, { task_name: v })}
                        />
                      </td>

                      {/* Due date */}
                      <td className="px-4 py-3">
                        <EditableDate
                          value={task.due_date}
                          saving={isSaving}
                          isOverdue={!!isOverdue}
                          onSave={v => updateTask(task.id, { due_date: v })}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Edit hint ──────────────────────────────────────────────────── */}
      {!isLoading && sheetTasks.length > 0 && (
        <p className="text-xs text-slate-400 text-center">
          Click any cell to edit · changes save automatically and sync to Google Sheets
        </p>
      )}
    </div>
  );
}
