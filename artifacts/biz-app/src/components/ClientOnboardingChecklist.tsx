import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Trash2, Loader2, CheckCircle2, X, Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChecklistStatus =
  | "Not Started"
  | "In Progress"
  | "Waiting on Client"
  | "Waiting on Hiedi"
  | "Complete"
  | "Not Applicable";

type ChecklistWho = "Hiedi" | "Client";

interface ChecklistItem {
  id: number;
  client_id: number;
  stage: string;
  task: string;
  who: string;
  status: ChecklistStatus;
  notes: string | null;
  due_date: string | null;
  sort_order: number;
  is_custom: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGES = [
  "New Client Setup",
  "Onboarding Form",
  "Proposal/Estimate",
  "Contract",
  "Invoice/Payment",
  "Client Dashboard",
  "Access Collection",
  "Document Collection",
  "Internal Setup",
  "Initial Review",
  "Kickoff",
  "Active Client Setup",
];

const STATUSES: ChecklistStatus[] = [
  "Not Started",
  "In Progress",
  "Waiting on Client",
  "Waiting on Hiedi",
  "Complete",
  "Not Applicable",
];

const WHO_OPTIONS: ChecklistWho[] = ["Hiedi", "Client"];

// ─── Style helpers ────────────────────────────────────────────────────────────

function statusStyle(status: string) {
  switch (status) {
    case "Complete":            return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "In Progress":         return "bg-blue-100 text-blue-800 border-blue-200";
    case "Waiting on Client":   return "bg-amber-100 text-amber-800 border-amber-200";
    case "Waiting on Hiedi":    return "bg-violet-100 text-violet-800 border-violet-200";
    case "Not Applicable":      return "bg-slate-100 text-slate-400 border-slate-200";
    default:                    return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

function whoStyle(who: string) {
  return who === "Client"
    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
    : "bg-[#266b75]/10 text-[#266b75] border-[#266b75]/20";
}

// ─── Row component ────────────────────────────────────────────────────────────

interface RowProps {
  item: ChecklistItem;
  onUpdate: (id: number, fields: Partial<ChecklistItem>) => void;
  onDelete: (id: number) => void;
}

function ChecklistRow({ item, onUpdate, onDelete }: RowProps) {
  const [editingTask, setEditingTask] = useState(false);
  const [taskVal, setTaskVal] = useState(item.task);
  const [notesVal, setNotesVal] = useState(item.notes ?? "");
  const taskInputRef = useRef<HTMLInputElement>(null);

  // Keep local task/notes in sync if item changes from outside
  useEffect(() => { setTaskVal(item.task); }, [item.task]);
  useEffect(() => { setNotesVal(item.notes ?? ""); }, [item.notes]);

  function commitTask() {
    setEditingTask(false);
    const trimmed = taskVal.trim();
    if (trimmed && trimmed !== item.task) {
      onUpdate(item.id, { task: trimmed });
    } else {
      setTaskVal(item.task);
    }
  }

  function commitNotes(val: string) {
    if (val !== (item.notes ?? "")) {
      onUpdate(item.id, { notes: val || null });
    }
  }

  const isNA = item.status === "Not Applicable";

  return (
    <tr className={`group border-b border-slate-100 transition-colors hover:bg-slate-50/60 ${isNA ? "opacity-50" : ""}`}>
      {/* Stage */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className="text-xs font-medium text-slate-500 leading-tight">{item.stage}</span>
      </td>

      {/* Task */}
      <td className="px-3 py-2.5 min-w-[200px]">
        {editingTask ? (
          <input
            ref={taskInputRef}
            type="text"
            value={taskVal}
            onChange={e => setTaskVal(e.target.value)}
            onBlur={commitTask}
            onKeyDown={e => { if (e.key === "Enter") commitTask(); if (e.key === "Escape") { setTaskVal(item.task); setEditingTask(false); } }}
            className="w-full text-sm border border-[#266b75] rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30"
            autoFocus
          />
        ) : (
          <span
            className={`text-sm cursor-pointer hover:text-[#266b75] transition-colors ${isNA ? "line-through text-slate-400" : "text-slate-800"}`}
            onClick={() => { setEditingTask(true); setTimeout(() => taskInputRef.current?.select(), 10); }}
            title="Click to edit"
          >
            {item.task}
          </span>
        )}
        {item.is_custom && (
          <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 border border-slate-200 rounded px-1 py-0.5">custom</span>
        )}
      </td>

      {/* Who */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <select
          value={item.who}
          onChange={e => onUpdate(item.id, { who: e.target.value })}
          className={`text-xs font-semibold border rounded-full px-2 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#266b75]/40 appearance-none ${whoStyle(item.who)}`}
        >
          {WHO_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      </td>

      {/* Status */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <select
          value={item.status}
          onChange={e => onUpdate(item.id, { status: e.target.value as ChecklistStatus })}
          className={`text-xs font-semibold border rounded-md px-2 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#266b75]/40 appearance-none ${statusStyle(item.status)}`}
        >
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>

      {/* Notes */}
      <td className="px-3 py-2.5 min-w-[160px]">
        <input
          type="text"
          value={notesVal}
          onChange={e => setNotesVal(e.target.value)}
          onBlur={e => commitNotes(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }}
          placeholder="Add note…"
          className="w-full text-xs bg-transparent border-b border-transparent hover:border-slate-200 focus:border-[#266b75] focus:outline-none focus:bg-white focus:px-1.5 focus:rounded-sm px-0 py-0.5 text-slate-600 placeholder:text-slate-300 transition-all"
        />
      </td>

      {/* Due Date */}
      <td className="px-3 py-2.5 whitespace-nowrap">
        <input
          type="date"
          value={item.due_date ?? ""}
          onChange={e => onUpdate(item.id, { due_date: e.target.value || null })}
          className="text-xs text-slate-600 border border-transparent hover:border-slate-200 focus:border-[#266b75] focus:outline-none rounded-md px-1.5 py-0.5 cursor-pointer bg-transparent focus:bg-white transition-all"
        />
      </td>

      {/* Delete */}
      <td className="px-2 py-2.5 w-8">
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all p-0.5 rounded"
          title="Delete item"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}

// ─── Add Item Form ─────────────────────────────────────────────────────────────

interface AddItemFormProps {
  onAdd: (item: Omit<ChecklistItem, "id" | "client_id" | "sort_order" | "is_custom">) => Promise<void>;
  onCancel: () => void;
}

function AddItemForm({ onAdd, onCancel }: AddItemFormProps) {
  const [stage, setStage] = useState(STAGES[0]!);
  const [task, setTask] = useState("");
  const [who, setWho] = useState<ChecklistWho>("Hiedi");
  const [status, setStatus] = useState<ChecklistStatus>("Not Started");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task.trim()) return;
    setSaving(true);
    try {
      await onAdd({ stage, task: task.trim(), who, status, notes: notes || null, due_date: dueDate || null });
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr className="bg-[#266b75]/5 border-b border-[#266b75]/20">
      <td className="px-3 py-2">
        <select
          value={stage}
          onChange={e => setStage(e.target.value)}
          className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] bg-white"
        >
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={task}
          onChange={e => setTask(e.target.value)}
          placeholder="Task description…"
          autoFocus
          className="w-full text-sm border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] bg-white"
          onKeyDown={e => { if (e.key === "Escape") onCancel(); }}
        />
      </td>
      <td className="px-3 py-2">
        <select
          value={who}
          onChange={e => setWho(e.target.value as ChecklistWho)}
          className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 bg-white"
        >
          {WHO_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <select
          value={status}
          onChange={e => setStatus(e.target.value as ChecklistStatus)}
          className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 bg-white"
        >
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Notes…"
          className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 bg-white"
        />
      </td>
      <td className="px-3 py-2">
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 bg-white"
        />
      </td>
      <td className="px-2 py-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={handleSubmit as any}
            disabled={!task.trim() || saving}
            className="text-white bg-[#266b75] hover:bg-[#1d5159] rounded-md p-1 disabled:opacity-40 transition-colors"
            title="Save"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-700 rounded-md p-1 transition-colors"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  clientId: number;
  clientName: string;
  serviceType?: string | null;
}

export function ClientOnboardingChecklist({ clientId }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Filters
  const [filterStage, setFilterStage] = useState("All");
  const [filterWho, setFilterWho] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");

  // Debounce timers per item
  const saveTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const pendingUpdatesRef = useRef<Record<number, Partial<ChecklistItem>>>({});

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetch(`/api/clients/${clientId}/checklist-items`, { credentials: "include" })
      .then(r => r.json())
      .then((data: ChecklistItem[]) => setItems(data))
      .catch(() => toast({ title: "Failed to load checklist", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [clientId]);

  // ── Update (debounced PATCH) ───────────────────────────────────────────────
  const handleUpdate = useCallback((id: number, fields: Partial<ChecklistItem>) => {
    // Optimistic update
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...fields } : item));

    // Accumulate pending changes
    pendingUpdatesRef.current[id] = { ...(pendingUpdatesRef.current[id] ?? {}), ...fields };

    // Debounce save
    if (saveTimersRef.current[id]) clearTimeout(saveTimersRef.current[id]);
    saveTimersRef.current[id] = setTimeout(async () => {
      const payload = pendingUpdatesRef.current[id];
      if (!payload) return;
      delete pendingUpdatesRef.current[id];
      setSaving(true);
      try {
        const res = await fetch(`/api/clients/${clientId}/checklist-items/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("Save failed");
      } catch {
        toast({ title: "Failed to save", variant: "destructive" });
      } finally {
        setSaving(false);
      }
    }, 600);
  }, [clientId, toast]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id: number) => {
    setItems(prev => prev.filter(item => item.id !== id));
    try {
      await fetch(`/api/clients/${clientId}/checklist-items/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      toast({ title: "Failed to delete item", variant: "destructive" });
    }
  }, [clientId, toast]);

  // ── Add ───────────────────────────────────────────────────────────────────
  const handleAdd = useCallback(async (newItem: Omit<ChecklistItem, "id" | "client_id" | "sort_order" | "is_custom">) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/checklist-items`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newItem),
      });
      if (!res.ok) throw new Error("Failed to add");
      const created: ChecklistItem = await res.json();
      setItems(prev => [...prev, created]);
      setShowAddForm(false);
    } catch {
      toast({ title: "Failed to add item", variant: "destructive" });
    }
  }, [clientId, toast]);

  // ── Progress stats ────────────────────────────────────────────────────────
  const total = items.length;
  const complete = items.filter(i => i.status === "Complete").length;
  const inProgress = items.filter(i => i.status === "In Progress").length;
  const waitClient = items.filter(i => i.status === "Waiting on Client").length;
  const waitHiedi = items.filter(i => i.status === "Waiting on Hiedi").length;
  const notApplicable = items.filter(i => i.status === "Not Applicable").length;
  const denominator = total - notApplicable;
  const pct = denominator > 0 ? Math.round((complete / denominator) * 100) : 0;

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filtered = items.filter(item => {
    if (filterStage !== "All" && item.stage !== filterStage) return false;
    if (filterWho !== "All" && item.who !== filterWho) return false;
    if (filterStatus !== "All" && item.status !== filterStatus) return false;
    return true;
  });

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading checklist…
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Progress Summary ── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {saving && (
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
              </span>
            )}
            {!saving && pct === 100 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> Onboarding complete!
              </span>
            )}
          </div>
          <span className="text-3xl font-bold text-[#266b75]">{pct}%</span>
        </div>

        {/* Progress bar */}
        <div className="bg-slate-100 rounded-full h-2.5 mb-4">
          <div
            className="h-2.5 rounded-full bg-[#266b75] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Stat grid */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: "Total", value: total, cls: "text-slate-700" },
            { label: "Complete", value: complete, cls: "text-emerald-700" },
            { label: "In Progress", value: inProgress, cls: "text-blue-700" },
            { label: "Waiting Client", value: waitClient, cls: "text-amber-700" },
            { label: "Waiting Hiedi", value: waitHiedi, cls: "text-violet-700" },
            { label: "N/A", value: notApplicable, cls: "text-slate-400" },
          ].map(stat => (
            <div key={stat.label} className="text-center">
              <div className={`text-xl font-bold ${stat.cls}`}>{stat.value}</div>
              <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Filters + Add button ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={filterStage}
          onChange={e => setFilterStage(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] bg-white"
        >
          <option value="All">All Stages</option>
          {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={filterWho}
          onChange={e => setFilterWho(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] bg-white"
        >
          <option value="All">All: Who</option>
          {WHO_OPTIONS.map(w => <option key={w} value={w}>{w}</option>)}
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#266b75]/30 focus:border-[#266b75] bg-white"
        >
          <option value="All">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {(filterStage !== "All" || filterWho !== "All" || filterStatus !== "All") && (
          <button
            type="button"
            onClick={() => { setFilterStage("All"); setFilterWho("All"); setFilterStatus("All"); }}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 transition-colors"
          >
            <X className="w-3 h-3" /> Clear filters
          </button>
        )}

        <div className="ml-auto">
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 text-sm font-medium text-white bg-[#266b75] hover:bg-[#1d5159] px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Item
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[780px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 w-[130px]">Stage</th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Task</th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 w-[90px]">Who</th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 w-[155px]">Status</th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 w-[180px]">Notes</th>
                <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 w-[130px]">Due Date</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && !showAddForm && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                    {items.length === 0 ? "No checklist items yet." : "No items match the current filters."}
                  </td>
                </tr>
              )}
              {filtered.map(item => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                />
              ))}
              {showAddForm && (
                <AddItemForm
                  onAdd={handleAdd}
                  onCancel={() => setShowAddForm(false)}
                />
              )}
            </tbody>
          </table>
        </div>

        {/* Footer: filtered count */}
        <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {filtered.length} of {total} item{total !== 1 ? "s" : ""}
            {(filterStage !== "All" || filterWho !== "All" || filterStatus !== "All") ? " (filtered)" : ""}
          </span>
          {!showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="text-xs text-[#266b75] hover:text-[#1d5159] flex items-center gap-1 transition-colors font-medium"
            >
              <Plus className="w-3 h-3" /> Add item
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
