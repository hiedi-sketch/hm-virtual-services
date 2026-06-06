import { useState, useRef, Fragment, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  useAppSprints, computeSprintStats, computeSchedule,
  Task, TaskStatus, Sprint, ScheduleEntry,
} from "@/hooks/useAppSprints";
import { useAppDocs, useAppNotes, fmtFileSize } from "@/hooks/useAppDocs";

// ── Constants ─────────────────────────────────────────────────────────────────
const BRAND       = "#266b75";
const BRAND_LIGHT = "#7dbdc6";
const BRAND_BG    = "rgba(38,107,117,0.08)";

// Updated colors: In Progress → yellow, Done → green (unchanged), Blocked → red
const STATUS_MAP: Record<TaskStatus, { label: string; bg: string; color: string }> = {
  "todo":              { label: "Not Started",       bg: "#f1f5f9", color: "#0f172a" },
  "in-progress":       { label: "In Progress",       bg: "#fffbeb", color: "#d97706" },
  "ready-for-testing": { label: "Ready for Testing", bg: "#eff6ff", color: "#2563eb" },
  "done":              { label: "Complete",           bg: "#f0fdf4", color: "#16a34a" },
  "blocked":           { label: "Blocked",            bg: "#fef2f2", color: "#dc2626" },
};

const CYCLE: Record<TaskStatus, TaskStatus> = {
  "todo": "in-progress", "in-progress": "ready-for-testing", "ready-for-testing": "done", "done": "todo", "blocked": "todo",
};

const LBL: React.CSSProperties = {
  display: "block", color: "#334155", fontSize: "11px", fontWeight: 600,
  letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "5px",
};
const INP: React.CSSProperties = {
  width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px",
  color: "#0f172a", padding: "8px 11px", fontSize: "13px",
  fontFamily: "'Inter',sans-serif", boxSizing: "border-box",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date
    ? d
    : new Date((d as string) + ((d as string).includes("T") ? "" : "T00:00:00"));
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysFromDate(d: Date | null): number | null {
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function getCurrentSprint(sprints: Sprint[]): Sprint | null {
  if (!sprints.length) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return (
    sprints.find(s => {
      const start = s.startDate ? new Date(s.startDate + "T00:00:00") : null;
      const end   = s.endDate   ? new Date(s.endDate   + "T23:59:59") : null;
      return start && today >= start && (!end || today <= end);
    }) ?? sprints[sprints.length - 1]
  );
}

// 3-tier severity: positive = ahead, -7..0 = warning, < -7 = danger
type DabTier = "ahead" | "warning" | "danger" | "unknown";
function getDabTier(dab: number | null): DabTier {
  if (dab === null) return "unknown";
  if (dab >= 0)  return "ahead";
  if (dab >= -7) return "warning";
  return "danger";
}
const TIER_PALETTE: Record<DabTier, { bg: string; border: string; iconBg: string; iconStroke: string; headColor: string; subColor: string }> = {
  ahead:   { bg: "#f0fdf4", border: "#bbf7d0", iconBg: "#dcfce7", iconStroke: "#16a34a", headColor: "#15803d", subColor: "#16a34a" },
  warning: { bg: "#fffbeb", border: "#fde68a", iconBg: "#fef9c3", iconStroke: "#d97706", headColor: "#92400e", subColor: "#d97706" },
  danger:  { bg: "#fef2f2", border: "#fecaca", iconBg: "#fee2e2", iconStroke: "#dc2626", headColor: "#dc2626", subColor: "#ef4444" },
  unknown: { bg: "#f8fafc", border: "#e2e8f0", iconBg: "#f1f5f9", iconStroke: "#94a3b8", headColor: "#64748b", subColor: "#94a3b8" },
};

// ── Pure helpers ──────────────────────────────────────────────────────────────
// Firestore rejects documents containing `undefined` values — strip them first.
function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as T;
}

// ── CSV helpers (module-level pure functions) ─────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/);

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let field = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { field += '"'; i++; }
        else { inQ = !inQ; }
      } else if (ch === ',' && !inQ) {
        result.push(field); field = "";
      } else {
        field += ch;
      }
    }
    result.push(field);
    return result;
  };

  // Find the first non-empty, non-comment line — that's the header
  const headerIdx = lines.findIndex(l => l.trim() && !l.trim().startsWith("#"));
  if (headerIdx === -1) return [];

  const headers = parseRow(lines[headerIdx]).map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  if (!headers.includes("sprint_name") && !headers.includes("task_title")) return [];

  return lines.slice(headerIdx + 1)
    .filter(l => l.trim() && !l.trim().startsWith("#"))
    .map(line => {
      const vals = parseRow(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = (vals[i] ?? "").trim(); });
      return row;
    })
    .filter(r => r.task_title?.trim() || r.sprint_name?.trim());
}

const CSV_HEADERS = [
  "sprint_name", "sprint_start_date", "sprint_end_date",
  "task_title", "status", "phase", "priority", "estimated_hours",
  "planned_start_date", "planned_due_date", "adjusted_due_date", "actual_date",
  "depends_on", "blocking", "claude_prompt_ref", "description", "notes",
];

function downloadTemplate() {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const row = (...vals: string[]) => vals.map(q).join(",");
  const lines = [
    CSV_HEADERS.join(","),
    "# HOW TO USE THIS TEMPLATE",
    "# status values: todo | in-progress | done | blocked",
    "# priority values: low | medium | high | critical",
    "# dates: YYYY-MM-DD format",
    "# depends_on: task_title or 6-char short ID of prerequisite task",
    "# adjusted_due_date and actual_date can be left blank (auto-calculated)",
    row("Sprint 1 — Foundation","2026-06-01","2026-06-14","Set up dev environment","todo","Setup","high","4","2026-06-01","2026-06-02","","","","","","One-time setup of the development environment",""),
    row("Sprint 1 — Foundation","2026-06-01","2026-06-14","Create database schema","todo","Backend","medium","8","2026-06-02","2026-06-04","","","Set up dev environment","","","Define all tables, relations and indexes",""),
    row("Sprint 2 — Auth","2026-06-15","2026-06-28","Implement authentication","todo","Auth","high","12","2026-06-15","2026-06-19","","","Create database schema","","","Google SSO + email/password login","Test on mobile and desktop"),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = "sprint_import_template.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ── StatCard ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  return (
    <div style={{
      background: accent ? BRAND : "#fff",
      border: `1px solid ${accent ? "transparent" : "#e2e8f0"}`,
      borderRadius: "14px", padding: "18px 20px", flex: 1, minWidth: 0,
      boxShadow: accent ? `0 4px 16px ${BRAND}44` : "0 1px 3px rgba(0,0,0,0.05)",
    }}>
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: accent ? "rgba(255,255,255,0.7)" : "#94a3b8", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans',sans-serif", color: accent ? "#fff" : "#0f172a", lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color: accent ? "rgba(255,255,255,0.6)" : "#94a3b8", marginTop: "4px" }}>{sub}</div>}
    </div>
  );
}

// ── DaysChip — reused for table Days+/- column ────────────────────────────────
function DaysChip({ days }: { days: number | null }) {
  if (days === null) return <span style={{ color: "#0f172a", fontSize: "12px" }}>—</span>;
  if (days > 0)  return <span style={{ color: "#16a34a", fontSize: "12px", fontWeight: 700 }}>+{days}d</span>;
  if (days === 0) return <span style={{ color: "#d97706", fontSize: "12px", fontWeight: 700 }}>Today</span>;
  return <span style={{ color: "#dc2626", fontSize: "12px", fontWeight: 700 }}>{days}d</span>;
}

// ── TaskTable ─────────────────────────────────────────────────────────────────
interface TaskTableProps {
  sprints: Sprint[];
  taskDates: Map<string, ScheduleEntry>;
  updateSprint: (id: string, updates: Partial<Omit<Sprint, "id">>) => Promise<void>;
  addSprint: (sprint: Omit<Sprint, "id" | "createdAt">) => Promise<void>;
}

function TaskTable({ sprints, taskDates, updateSprint, addSprint }: TaskTableProps) {
  const [activeFilter,    setActiveFilter]    = useState("all");
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(new Set());
  const [expandedTasks,   setExpandedTasks]   = useState<Set<string>>(new Set());
  const [taskDrafts,      setTaskDrafts]      = useState<Record<string, Partial<Task>>>({});
  const [savingTaskId,    setSavingTaskId]    = useState<string | null>(null);
  const [addingInSprint,  setAddingInSprint]  = useState<string | null>(null);
  const [newTaskDraft,    setNewTaskDraft]    = useState<Partial<Task>>({});
  const [showModal,       setShowModal]       = useState(false);
  const [sprintForm,      setSprintForm]      = useState({ name: "", startDate: "", endDate: "" });
  const [sprintSaving,    setSprintSaving]    = useState(false);
  const [saveError,       setSaveError]       = useState<string | null>(null);

  const filtered = activeFilter === "all" ? sprints : sprints.filter(s => s.id === activeFilter);

  const toggleSprint = (id: string) =>
    setCollapsedSprints(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleTask = (taskId: string, sprint: Sprint) => {
    setExpandedTasks(p => {
      const n = new Set(p);
      if (n.has(taskId)) { n.delete(taskId); }
      else {
        n.add(taskId);
        const t = sprint.tasks.find(t => t.id === taskId);
        if (t) setTaskDrafts(d => ({ ...d, [taskId]: { ...t } }));
      }
      return n;
    });
  };

  const setDraft = (taskId: string, field: keyof Task, value: unknown) =>
    setTaskDrafts(d => ({ ...d, [taskId]: { ...d[taskId], [field]: value } }));

  const saveTask = async (sprint: Sprint, taskId: string) => {
    setSavingTaskId(taskId);
    setSaveError(null);
    try {
      const draft = taskDrafts[taskId] ?? {};
      const merged = stripUndefined({ ...sprint.tasks.find(t => t.id === taskId)!, ...draft });
      const updatedTasks = sprint.tasks.map(t => t.id === taskId ? merged : t);
      console.log("[saveTask] Saving task:", taskId, "adjustedDueDate:", merged.adjustedDueDate ?? "(not set)", "Full merged:", merged);
      await updateSprint(sprint.id, { tasks: updatedTasks });
      console.log("[saveTask] Save succeeded for task:", taskId);
      setExpandedTasks(p => { const n = new Set(p); n.delete(taskId); return n; });
    } catch (err) {
      console.error("[saveTask] Save task failed:", err);
      setSaveError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingTaskId(null);
    }
  };

  const markTask = async (sprint: Sprint, taskId: string, status: TaskStatus) => {
    await updateSprint(sprint.id, { tasks: sprint.tasks.map(t => t.id === taskId ? { ...t, status } : t) });
    setTaskDrafts(d => d[taskId] ? { ...d, [taskId]: { ...d[taskId], status } } : d);
  };

  const handleAddTask = async (sprint: Sprint) => {
    if (!newTaskDraft.title?.trim()) return;
    const t: Task = { id: crypto.randomUUID(), title: newTaskDraft.title.trim(), status: "todo", ...newTaskDraft };
    await updateSprint(sprint.id, { tasks: [...(sprint.tasks ?? []), t] });
    setNewTaskDraft({}); setAddingInSprint(null);
  };

  const handleAddSprint = async () => {
    if (!sprintForm.name.trim()) return;
    setSprintSaving(true);
    await addSprint({ name: sprintForm.name.trim(), startDate: sprintForm.startDate, endDate: sprintForm.endDate, tasks: [] });
    setSprintForm({ name: "", startDate: "", endDate: "" }); setShowModal(false); setSprintSaving(false);
  };

  return (
    <div>
      {saveError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", color: "#dc2626", padding: "10px 16px", marginBottom: "14px", fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>⚠️ {saveError}</span>
          <button onClick={() => setSaveError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: "16px", lineHeight: 1 }}>✕</button>
        </div>
      )}
      {/* Filter tabs */}
      <div style={{ display: "flex", gap: "6px", marginBottom: "20px", flexWrap: "wrap" as const }}>
        {[{ id: "all", label: "All Sprints" }, ...sprints.map(s => ({ id: s.id, label: s.name }))].map(tab => {
          const active = activeFilter === tab.id;
          const count  = tab.id === "all"
            ? sprints.flatMap(s => s.tasks ?? []).length
            : sprints.find(s => s.id === tab.id)?.tasks?.length ?? 0;
          return (
            <button key={tab.id} onClick={() => setActiveFilter(tab.id)}
              style={{ background: active ? BRAND : "#fff", border: `1px solid ${active ? BRAND : "#e2e8f0"}`, borderRadius: "8px", color: active ? "#fff" : "#64748b", padding: "7px 14px", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
            >
              {tab.label}
              <span style={{ fontSize: "11px", opacity: 0.7, background: active ? "rgba(255,255,255,0.2)" : "#f1f5f9", borderRadius: "10px", padding: "1px 7px" }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Sprint sections */}
      {filtered.map(sprint => {
        const tasks = sprint.tasks ?? [];
        const done  = tasks.filter(t => t.status === "done").length;
        const pct   = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
        const isCollapsed = collapsedSprints.has(sprint.id);

        return (
          <div key={sprint.id} style={{ marginBottom: "16px", border: "1px solid #e2e8f0", borderRadius: "14px", overflow: "hidden", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            {/* Sprint header */}
            <div onClick={() => toggleSprint(sprint.id)}
              style={{ display: "flex", alignItems: "center", gap: "12px", padding: "13px 18px", cursor: "pointer", background: "#f8fafc", borderBottom: isCollapsed ? "none" : "1px solid #e2e8f0", userSelect: "none" as const }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ transform: isCollapsed ? "rotate(-90deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" as const }}>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>{sprint.name}</span>
                {(sprint.startDate || sprint.endDate) && (
                  <span style={{ fontSize: "11px", color: "#0f172a" }}>
                    {sprint.startDate}{sprint.startDate && sprint.endDate ? " → " : ""}{sprint.endDate}
                  </span>
                )}
              </div>
              <span style={{ fontSize: "11px", color: "#0f172a" }}>{done}/{tasks.length} done</span>
              <span style={{ fontSize: "11px", fontWeight: 700, color: pct === 100 ? "#16a34a" : BRAND, background: pct === 100 ? "#f0fdf4" : BRAND_BG, borderRadius: "20px", padding: "2px 10px" }}>{pct}%</span>
            </div>

            {!isCollapsed && (
              <div style={{ overflowX: "auto" as const }}>
                <table style={{ width: "100%", borderCollapse: "collapse" as const, minWidth: "820px" }}>
                  <thead>
                    <tr style={{ background: "#fcfcfd" }}>
                      {[
                        { label: "#",           width: "72px",  align: "center" as const },
                        { label: "Task Name",   width: "auto",  align: "left" as const   },
                        { label: "Est Hrs",     width: "76px",  align: "center" as const },
                        { label: "Planned Due", width: "116px", align: "left" as const   },
                        { label: "Adj Due",     width: "116px", align: "left" as const   },
                        { label: "Status",      width: "126px", align: "left" as const   },
                        { label: "Days +/-",    width: "84px",  align: "center" as const },
                      ].map(h => (
                        <th key={h.label} style={{ padding: "9px 14px", width: h.width, textAlign: h.align, fontSize: "10px", fontWeight: 700, color: "#0f172a", letterSpacing: "0.08em", textTransform: "uppercase" as const, borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" as const }}>
                          {h.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.length === 0 && addingInSprint !== sprint.id && (
                      <tr><td colSpan={7} style={{ padding: "22px", textAlign: "center" as const, color: "#0f172a", fontSize: "13px", fontStyle: "italic" }}>No tasks — click + Add Task below.</td></tr>
                    )}

                    {tasks.map(task => {
                      const isExpanded = expandedTasks.has(task.id);
                      const draft      = taskDrafts[task.id] ?? task;
                      const sty        = STATUS_MAP[task.status] ?? STATUS_MAP["todo"];
                      const computed   = taskDates.get(task.id);
                      const planDue    = computed?.plannedDue ?? null;
                      const adjDue     = computed?.adjustedDue ?? null;
                      const daysLeft   = daysFromDate(adjDue ?? planDue);
                      const shortId    = task.id.replace(/-/g, "").slice(0, 6).toUpperCase();
                      const isSaving   = savingTaskId === task.id;

                      return (
                        <Fragment key={task.id}>
                          <tr onClick={() => toggleTask(task.id, sprint)}
                            style={{ cursor: "pointer", background: isExpanded ? "#f0fdf9" : "transparent", borderBottom: "1px solid #f1f5f9", transition: "background 0.15s" }}
                          >
                            <td style={{ padding: "10px 14px", textAlign: "center" as const }}>
                              <span style={{ fontSize: "10px", fontFamily: "monospace", color: "#0f172a", background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px" }}>{shortId}</span>
                            </td>
                            <td style={{ padding: "10px 14px" }}>
                              <div style={{ fontSize: "13px", fontWeight: 500, color: task.status === "done" ? "#94a3b8" : "#0f172a", textDecoration: task.status === "done" ? "line-through" : "none" }}>{task.title}</div>
                              <div style={{ display: "flex", gap: "8px", marginTop: "2px", flexWrap: "wrap" as const }}>
                                {task.phase && <span style={{ fontSize: "10px", color: BRAND_LIGHT, fontWeight: 600 }}>{task.phase}</span>}
                                {task.priority && (
                                  <span style={{ fontSize: "10px", fontWeight: 700, color: task.priority === "critical" ? "#7c3aed" : task.priority === "high" ? "#dc2626" : task.priority === "medium" ? "#d97706" : "#64748b" }}>
                                    {task.priority.toUpperCase()}
                                  </span>
                                )}
                                {computed?.estimatedDays != null && (
                                  <span style={{ fontSize: "10px", color: "#0f172a" }}>≈{computed.estimatedDays.toFixed(1)}d</span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: "10px 14px", textAlign: "center" as const, fontSize: "12px", color: task.estimatedHours ? "#334155" : "#cbd5e1" }}>
                              {task.estimatedHours ? `${task.estimatedHours}h` : "—"}
                            </td>
                            {/* Planned Due — auto-calculated if possible */}
                            <td style={{ padding: "10px 14px", fontSize: "12px", whiteSpace: "nowrap" as const }}>
                              {planDue
                                ? <span style={{ color: "#334155" }}>{fmtDate(planDue)}</span>
                                : <span style={{ color: "#0f172a" }}>—</span>}
                            </td>
                            {/* Adj Due — dependency-resolved */}
                            <td style={{ padding: "10px 14px", fontSize: "12px", whiteSpace: "nowrap" as const }}>
                              {adjDue
                                ? <span style={{ color: task.status === "done" ? "#16a34a" : "#334155", fontWeight: adjDue !== planDue ? 600 : 400 }}>{fmtDate(adjDue)}</span>
                                : <span style={{ color: "#0f172a" }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 14px" }}>
                              <span style={{ background: sty.bg, color: sty.color, fontSize: "10px", fontWeight: 700, padding: "3px 10px", borderRadius: "20px", whiteSpace: "nowrap" as const }}>{sty.label}</span>
                            </td>
                            <td style={{ padding: "10px 14px", textAlign: "center" as const }}>
                              <DaysChip days={daysLeft} />
                            </td>
                          </tr>

                          {/* Expanded detail */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} style={{ padding: 0, background: "#f8fbfc", borderBottom: "2px solid #e2e8f0" }}>
                                <div style={{ padding: "20px 24px" }}>

                                  {/* Auto-calc info bar */}
                                  {computed && (
                                    <div style={{ display: "flex", gap: "16px", padding: "10px 14px", background: BRAND_BG, border: `1px solid ${BRAND}22`, borderRadius: "10px", marginBottom: "16px", flexWrap: "wrap" as const, fontSize: "12px", color: BRAND }}>
                                      {computed.estimatedDays != null && <span>⏱ <b>{computed.estimatedDays.toFixed(1)}</b> est days</span>}
                                      {computed.plannedDue    && <span>📅 Planned: <b>{fmtDate(computed.plannedDue)}</b></span>}
                                      {computed.adjustedDue   && <span>🔄 Adjusted: <b>{fmtDate(computed.adjustedDue)}</b></span>}
                                    </div>
                                  )}

                                  {/* Action buttons */}
                                  <div style={{ display: "flex", gap: "8px", marginBottom: "18px", flexWrap: "wrap" as const }}>
                                    {([
                                      { status: "in-progress"       as TaskStatus, label: "Mark In Progress",       onBg: "#d97706", offBg: "#fffbeb", offColor: "#d97706" },
                                      { status: "ready-for-testing" as TaskStatus, label: "Ready for Testing",      onBg: "#2563eb", offBg: "#eff6ff", offColor: "#2563eb" },
                                      { status: "done"              as TaskStatus, label: "Mark Complete",           onBg: "#16a34a", offBg: "#f0fdf4", offColor: "#16a34a" },
                                      { status: "blocked"           as TaskStatus, label: "Mark Blocked",            onBg: "#dc2626", offBg: "#fef2f2", offColor: "#dc2626" },
                                    ] as const).map(btn => {
                                      const active = draft.status === btn.status;
                                      return (
                                        <button key={btn.status}
                                          onClick={e => { e.stopPropagation(); markTask(sprint, task.id, btn.status); }}
                                          style={{ background: active ? btn.onBg : btn.offBg, border: `1px solid ${active ? btn.onBg : btn.offColor}55`, borderRadius: "8px", color: active ? "#fff" : btn.offColor, padding: "7px 16px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                                        >
                                          {active ? "✓ " : ""}{btn.label}
                                        </button>
                                      );
                                    })}
                                    <div style={{ flex: 1 }} />
                                    <button onClick={e => { e.stopPropagation(); setExpandedTasks(p => { const n = new Set(p); n.delete(task.id); return n; }); }}
                                      style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#0f172a", padding: "7px 12px", fontSize: "12px", cursor: "pointer" }}
                                    >✕ Collapse</button>
                                  </div>

                                  {/* Fields — 3-col grid */}
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
                                    <div style={{ gridColumn: "1 / -1" }}>
                                      <label style={LBL}>Task Name</label>
                                      <input style={INP} value={draft.title ?? ""} onClick={e => e.stopPropagation()} onChange={e => setDraft(task.id, "title", e.target.value)} />
                                    </div>
                                    <div style={{ gridColumn: "1 / -1" }}>
                                      <label style={LBL}>Description</label>
                                      <textarea rows={2} style={{ ...INP, resize: "vertical" as const }} value={draft.description ?? ""} onClick={e => e.stopPropagation()} onChange={e => setDraft(task.id, "description", e.target.value)} placeholder="What needs to be done?" />
                                    </div>
                                    <div>
                                      <label style={LBL}>Phase</label>
                                      <input style={INP} value={draft.phase ?? ""} onClick={e => e.stopPropagation()} onChange={e => setDraft(task.id, "phase", e.target.value)} placeholder="e.g. Discovery" />
                                    </div>
                                    <div>
                                      <label style={LBL}>Priority</label>
                                      <select style={INP} value={draft.priority ?? ""} onClick={e => e.stopPropagation()} onChange={e => setDraft(task.id, "priority", e.target.value as Task["priority"])}>
                                        <option value="">— Select —</option>
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                        <option value="critical">Critical</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label style={LBL}>Est Hours</label>
                                      <input type="number" min={0} style={INP} value={draft.estimatedHours ?? ""} onClick={e => e.stopPropagation()} onChange={e => setDraft(task.id, "estimatedHours", e.target.value ? Number(e.target.value) : undefined)} placeholder="0" />
                                    </div>
                                    <div>
                                      <label style={LBL}>Planned Start Date</label>
                                      <input type="date" style={INP} value={draft.plannedStartDate ?? ""} onClick={e => e.stopPropagation()} onChange={e => setDraft(task.id, "plannedStartDate", e.target.value)} />
                                    </div>
                                    <div>
                                      <label style={LBL}>Planned Due Date <span style={{ color: "#0f172a", fontWeight: 400, textTransform: "none" as const, letterSpacing: 0, fontSize: "10px" }}>(auto if start+hrs set)</span></label>
                                      <input type="date" style={INP} value={draft.plannedDueDate ?? ""} onClick={e => e.stopPropagation()} onChange={e => setDraft(task.id, "plannedDueDate", e.target.value)} />
                                    </div>
                                    <div>
                                      <label style={LBL}>Adjusted Due Date <span style={{ color: "#0f172a", fontWeight: 400, textTransform: "none" as const, letterSpacing: 0, fontSize: "10px" }}>(auto from deps)</span></label>
                                      <input type="date" style={INP} value={draft.adjustedDueDate ?? ""} onClick={e => e.stopPropagation()} onChange={e => setDraft(task.id, "adjustedDueDate", e.target.value)} />
                                    </div>
                                    <div>
                                      <label style={LBL}>Actual Completion Date</label>
                                      <input type="date" style={INP} value={draft.actualDate ?? ""} onClick={e => e.stopPropagation()} onChange={e => setDraft(task.id, "actualDate", e.target.value)} />
                                    </div>
                                    <div>
                                      <label style={LBL}>Depends On</label>
                                      <input style={INP} value={draft.dependsOn ?? ""} onClick={e => e.stopPropagation()} onChange={e => setDraft(task.id, "dependsOn", e.target.value)} placeholder="Task name or ID" />
                                    </div>
                                    <div>
                                      <label style={LBL}>Blocking</label>
                                      <input style={INP} value={draft.blocking ?? ""} onClick={e => e.stopPropagation()} onChange={e => setDraft(task.id, "blocking", e.target.value)} placeholder="Task name or ID" />
                                    </div>
                                    <div>
                                      <label style={LBL}>Claude Prompt Reference</label>
                                      <input style={INP} value={draft.claudePromptRef ?? ""} onClick={e => e.stopPropagation()} onChange={e => setDraft(task.id, "claudePromptRef", e.target.value)} placeholder="Prompt ID or link" />
                                    </div>
                                    <div style={{ gridColumn: "1 / -1" }}>
                                      <label style={LBL}>Notes</label>
                                      <textarea rows={3} style={{ ...INP, resize: "vertical" as const }} value={draft.notes ?? ""} onClick={e => e.stopPropagation()} onChange={e => setDraft(task.id, "notes", e.target.value)} placeholder="Additional notes…" />
                                    </div>
                                  </div>

                                  <div style={{ display: "flex", gap: "8px", marginTop: "14px" }}>
                                    <button onClick={e => { e.stopPropagation(); saveTask(sprint, task.id); }} disabled={isSaving}
                                      style={{ background: BRAND, border: "none", borderRadius: "8px", color: "#fff", padding: "8px 20px", fontSize: "12px", fontWeight: 600, cursor: "pointer", opacity: isSaving ? 0.7 : 1 }}
                                    >{isSaving ? "Saving…" : "Save Changes"}</button>
                                    <button onClick={e => { e.stopPropagation(); setExpandedTasks(p => { const n = new Set(p); n.delete(task.id); return n; }); }}
                                      style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#0f172a", padding: "8px 16px", fontSize: "12px", cursor: "pointer" }}
                                    >Cancel</button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}

                    {/* Add task row */}
                    {addingInSprint === sprint.id ? (
                      <tr style={{ background: "#f8fbfc" }}>
                        <td colSpan={7} style={{ padding: "12px 14px" }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 130px 130px 110px auto", gap: "8px", alignItems: "end" }}>
                            <div>
                              <label style={LBL}>Task Name *</label>
                              <input autoFocus style={INP} value={newTaskDraft.title ?? ""} onChange={e => setNewTaskDraft(d => ({ ...d, title: e.target.value }))}
                                onKeyDown={e => { if (e.key === "Enter") handleAddTask(sprint); if (e.key === "Escape") { setAddingInSprint(null); setNewTaskDraft({}); } }}
                                placeholder="Task name…"
                              />
                            </div>
                            <div>
                              <label style={LBL}>Est Hrs</label>
                              <input type="number" min={0} style={INP} value={newTaskDraft.estimatedHours ?? ""} onChange={e => setNewTaskDraft(d => ({ ...d, estimatedHours: e.target.value ? Number(e.target.value) : undefined }))} placeholder="0" />
                            </div>
                            <div>
                              <label style={LBL}>Start Date</label>
                              <input type="date" style={INP} value={newTaskDraft.plannedStartDate ?? ""} onChange={e => setNewTaskDraft(d => ({ ...d, plannedStartDate: e.target.value }))} />
                            </div>
                            <div>
                              <label style={LBL}>Due Date</label>
                              <input type="date" style={INP} value={newTaskDraft.plannedDueDate ?? ""} onChange={e => setNewTaskDraft(d => ({ ...d, plannedDueDate: e.target.value }))} />
                            </div>
                            <div>
                              <label style={LBL}>Phase</label>
                              <input style={INP} value={newTaskDraft.phase ?? ""} onChange={e => setNewTaskDraft(d => ({ ...d, phase: e.target.value }))} placeholder="e.g. Auth" />
                            </div>
                            <div style={{ display: "flex", gap: "6px", alignItems: "flex-end" }}>
                              <button onClick={() => handleAddTask(sprint)} style={{ background: BRAND, border: "none", borderRadius: "8px", color: "#fff", padding: "9px 16px", fontSize: "12px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const }}>+ Add Task</button>
                              <button onClick={() => { setAddingInSprint(null); setNewTaskDraft({}); }} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#0f172a", padding: "9px 10px", fontSize: "12px", cursor: "pointer" }}>✕</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td colSpan={7} style={{ padding: "8px 14px", borderTop: "1px solid #f8fafc" }}>
                          <button onClick={() => { setAddingInSprint(sprint.id); setNewTaskDraft({}); }}
                            style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "1px dashed #e2e8f0", borderRadius: "8px", color: "#0f172a", padding: "6px 14px", cursor: "pointer", fontSize: "12px", fontWeight: 500 }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                            Add Task
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {/* + Add Sprint */}
      <button onClick={() => setShowModal(true)}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", background: "#fff", border: `2px dashed ${BRAND}55`, borderRadius: "12px", color: BRAND, padding: "13px 24px", fontSize: "13px", fontWeight: 600, cursor: "pointer", marginTop: "8px" }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
        Add Sprint
      </button>

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: "20px" }}>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "16px", width: "100%", maxWidth: "440px", boxShadow: "0 20px 60px rgba(0,0,0,0.12)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 14px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ fontSize: "17px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans',sans-serif", color: "#0f172a" }}>New Sprint</span>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", color: "#0f172a", cursor: "pointer", padding: "4px", lineHeight: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ padding: "20px 24px", display: "grid", gap: "14px" }}>
              <div>
                <label style={LBL}>Sprint Name *</label>
                <input autoFocus style={INP} value={sprintForm.name} onChange={e => setSprintForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sprint 1 — Auth & Onboarding" onKeyDown={e => e.key === "Enter" && handleAddSprint()} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div><label style={LBL}>Start Date</label><input type="date" style={INP} value={sprintForm.startDate} onChange={e => setSprintForm(f => ({ ...f, startDate: e.target.value }))} /></div>
                <div><label style={LBL}>End Date</label><input type="date" style={INP} value={sprintForm.endDate} onChange={e => setSprintForm(f => ({ ...f, endDate: e.target.value }))} /></div>
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button onClick={() => setShowModal(false)} style={{ background: "transparent", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#334155", padding: "9px 18px", fontSize: "13px", cursor: "pointer" }}>Cancel</button>
                <button onClick={handleAddSprint} disabled={sprintSaving} style={{ background: BRAND, border: "none", borderRadius: "8px", color: "#fff", padding: "9px 20px", fontSize: "13px", fontWeight: 600, cursor: "pointer", opacity: sprintSaving ? 0.7 : 1 }}>
                  {sprintSaving ? "Saving…" : "Create Sprint"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
const DEV_STAGES = ["Concept", "Planning", "In Development", "Testing", "Staging", "Live", "On Hold"];
const STAGE_COLORS: Record<string, string> = {
  "Concept": "#94a3b8", "Planning": "#fb923c", "In Development": "#facc15",
  "Testing": "#34d399", "Staging": "#60a5fa", "Live": "#4ade80", "On Hold": "#f87171",
};

type AppRecord = { id: number; name: string; stage: string; description: string; startDate?: string; targetDate?: string; launchDate?: string; dailyHoursAvailable?: number };

export default function AppDevTrackerDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const taskTableRef = useRef<HTMLDivElement>(null);
  const appId = params.id ?? "";

  // ── App metadata from localStorage
  const loadApp = (): AppRecord | undefined => {
    const raw = localStorage.getItem("hm_tracker_apps");
    const list: AppRecord[] = raw ? JSON.parse(raw) : [];
    return list.find(a => String(a.id) === appId);
  };
  const app = loadApp();

  // App stage — editable, persisted to localStorage
  const [appStage, setAppStage] = useState<string>(app?.stage ?? "");

  // App date fields — editable inline, persisted to localStorage
  const [appStartDate,  setAppStartDate]  = useState<string>(app?.startDate  ?? "");
  const [appTargetDate, setAppTargetDate] = useState<string>(app?.targetDate ?? "");
  const [appLaunchDate, setAppLaunchDate] = useState<string>(app?.launchDate ?? "");

  const saveAppField = (field: keyof AppRecord, value: string) => {
    const raw  = localStorage.getItem("hm_tracker_apps");
    const list: AppRecord[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem("hm_tracker_apps", JSON.stringify(
      list.map(a => String(a.id) === appId ? { ...a, [field]: value } : a)
    ));
  };

  const changeStage = (newStage: string) => {
    setAppStage(newStage);
    saveAppField("stage", newStage);
    if (newStage === "Live" && !appLaunchDate) {
      const today = new Date().toISOString().split("T")[0];
      setAppLaunchDate(today);
      saveAppField("launchDate", today);
    }
  };

  // dailyHoursAvailable — editable per-app setting
  const [dailyHours, setDailyHours] = useState<number>(app?.dailyHoursAvailable ?? 6);
  const [dailyHoursInput, setDailyHoursInput] = useState<string>(String(app?.dailyHoursAvailable ?? 6));

  const saveDailyHours = (val: number) => {
    const safeVal = val > 0 ? val : 1;
    setDailyHours(safeVal);
    setDailyHoursInput(String(safeVal));
    const raw  = localStorage.getItem("hm_tracker_apps");
    const list: AppRecord[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem("hm_tracker_apps", JSON.stringify(
      list.map(a => String(a.id) === appId ? { ...a, dailyHoursAvailable: safeVal } : a)
    ));
  };

  const { sprints, loading, error, addSprint, updateSprint, deleteSprint } = useAppSprints(appId);
  const { docs, uploading, uploadProgress, error: docError, uploadDoc, deleteDoc } = useAppDocs(appId);
  const { notes, setNotes, saving: notesSaving, saveNotes } = useAppNotes(appId);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDocFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await uploadDoc(file).catch(() => {});
  };

  const handleNotesChange = useCallback((text: string) => {
    setNotes(text);
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => saveNotes(text), 800);
  }, [setNotes, saveNotes]);

  // ── Schedule computation (pure, runs on every render)
  const schedule = computeSchedule(sprints, dailyHours, appTargetDate);
  const stats    = computeSprintStats(sprints, appTargetDate);

  // Direct fallback: scan all tasks for the latest adjustedDueDate or plannedDueDate
  // This catches cases where computeSchedule misses dates (e.g. no start+hours combo)
  const directMaxDate = (() => {
    let max: Date | null = null;
    for (const sprint of sprints) {
      for (const task of sprint.tasks ?? []) {
        const s = task.adjustedDueDate || task.plannedDueDate;
        if (s) {
          const d = new Date(s + (s.includes("T") ? "" : "T00:00:00"));
          if (!isNaN(d.getTime()) && (!max || d > max)) max = d;
        }
      }
    }
    return max;
  })();

  console.log("[projLaunch] schedule:", schedule.projectedLaunchDate?.toISOString().slice(0,10) ?? "null", "direct:", directMaxDate?.toISOString().slice(0,10) ?? "null", "velocity:", stats.projectedDate?.toISOString().slice(0,10) ?? "null");

  // Prefer schedule-based projection; fall back to direct max date; then velocity-based
  const projLaunch = schedule.projectedLaunchDate ?? directMaxDate ?? stats.projectedDate;
  const dab        = schedule.daysAheadBehind ?? stats.daysAheadBehind;
  const dabTierKey = getDabTier(dab);
  const tier       = TIER_PALETTE[dabTierKey];

  const currentSprint = getCurrentSprint(sprints);
  const csTasks = currentSprint?.tasks ?? [];
  const csDone  = csTasks.filter(t => t.status === "done").length;
  const csPct   = csTasks.length > 0 ? Math.round((csDone / csTasks.length) * 100) : 0;

  const [showTaskTable,   setShowTaskTable]   = useState(false);
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [sprintForm,      setSprintForm]      = useState({ name: "", startDate: "", endDate: "" });
  const [sprintSaving,    setSprintSaving]    = useState(false);
  const [addingTask,      setAddingTask]      = useState<string | null>(null);
  const [newTaskTitle,    setNewTaskTitle]    = useState("");

  // ── CSV import ──
  type ImportSprintRow = { name: string; startDate: string; endDate: string; taskCount: number; isNew: boolean };
  type ImportPreview   = { sprintRows: ImportSprintRow[]; rows: Record<string, string>[] };
  const fileInputRef               = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importing,     setImporting]     = useState(false);
  const [importError,   setImportError]   = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const rows = parseCSV(text);
        if (!rows.length) { setImportError("No data rows found — make sure the file has a 'sprint_name' and 'task_title' column header and at least one data row."); return; }
        const namesSeen = new Set<string>();
        const sprintRows: ImportSprintRow[] = [];
        for (const r of rows) {
          const name = r.sprint_name?.trim();
          if (!name || namesSeen.has(name)) continue;
          namesSeen.add(name);
          sprintRows.push({
            name,
            startDate: r.sprint_start_date ?? "",
            endDate:   r.sprint_end_date   ?? "",
            taskCount: rows.filter(x => x.sprint_name?.trim() === name && x.task_title?.trim()).length,
            isNew:     !sprints.find(s => s.name === name),
          });
        }
        setImportPreview({ sprintRows, rows });
        setImportError(null);
      } catch {
        setImportError("Failed to parse the CSV. Please check the file format.");
      }
    };
    reader.readAsText(file);
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    setImporting(true);
    setImportError(null);
    const { rows } = importPreview;
    const sprintGroups = new Map<string, { startDate: string; endDate: string; tasks: Task[] }>();
    for (const r of rows) {
      const name = r.sprint_name?.trim();
      if (!name) continue;
      if (!sprintGroups.has(name)) {
        sprintGroups.set(name, { startDate: r.sprint_start_date ?? "", endDate: r.sprint_end_date ?? "", tasks: [] });
      }
      const taskTitle = r.task_title?.trim();
      if (!taskTitle) continue;
      const validStatuses: TaskStatus[] = ["todo","in-progress","ready-for-testing","done","blocked"];
      const status: TaskStatus = validStatuses.includes(r.status as TaskStatus) ? r.status as TaskStatus : "todo";
      const validPriorities = ["low","medium","high","critical"];
      const priority = validPriorities.includes(r.priority) ? r.priority as Task["priority"] : undefined;
      sprintGroups.get(name)!.tasks.push(stripUndefined({
        id:              crypto.randomUUID(),
        title:           taskTitle,
        status,
        phase:           r.phase?.trim()           || undefined,
        priority,
        estimatedHours:  r.estimated_hours         ? (Number(r.estimated_hours) || undefined) : undefined,
        plannedStartDate:r.planned_start_date?.trim() || undefined,
        plannedDueDate:  r.planned_due_date?.trim()   || undefined,
        adjustedDueDate: r.adjusted_due_date?.trim()  || undefined,
        actualDate:      r.actual_date?.trim()        || undefined,
        dependsOn:       r.depends_on?.trim()         || undefined,
        blocking:        r.blocking?.trim()            || undefined,
        claudePromptRef: r.claude_prompt_ref?.trim()  || undefined,
        description:     r.description?.trim()        || undefined,
        notes:           r.notes?.trim()              || undefined,
      }));
    }
    try {
      await Promise.all(
        Array.from(sprintGroups.entries()).map(([name, data]) => {
          const existing = sprints.find(s => s.name === name);
          if (existing) {
            return updateSprint(existing.id, { tasks: [...(existing.tasks ?? []), ...data.tasks] });
          }
          return addSprint({ name, startDate: data.startDate, endDate: data.endDate, tasks: data.tasks });
        })
      );
      setImportPreview(null);
    } catch (err) {
      console.error("Import failed:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setImportError(`Import failed: ${msg}`);
    } finally {
      setImporting(false);
    }
  };

  const handleAddSprint = async () => {
    if (!sprintForm.name.trim()) return;
    setSprintSaving(true);
    await addSprint({ name: sprintForm.name.trim(), startDate: sprintForm.startDate, endDate: sprintForm.endDate, tasks: [] });
    setSprintForm({ name: "", startDate: "", endDate: "" }); setShowSprintModal(false); setSprintSaving(false);
  };

  const handleAddTask = async (sprintId: string, tasks: Task[]) => {
    if (!newTaskTitle.trim()) return;
    await updateSprint(sprintId, { tasks: [...tasks, { id: crypto.randomUUID(), title: newTaskTitle.trim(), status: "todo" }] });
    setNewTaskTitle(""); setAddingTask(null);
  };

  const handleCycleStatus = async (sprintId: string, tasks: Task[], taskId: string) =>
    updateSprint(sprintId, { tasks: tasks.map(t => t.id === taskId ? { ...t, status: CYCLE[t.status] } : t) });

  const handleDeleteTask = async (sprintId: string, tasks: Task[], taskId: string) =>
    updateSprint(sprintId, { tasks: tasks.filter(t => t.id !== taskId) });

  const handleToggleTaskTable = () => {
    const next = !showTaskTable;
    setShowTaskTable(next);
    if (next) setTimeout(() => taskTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  };

  // Projected Launch sub-text
  const projSub = (() => {
    if (!projLaunch) return stats.total === 0 ? "Add tasks with dates" : "Not enough data yet";
    if (schedule.projectedLaunchDate) return "Based on task schedules";
    return "Based on completion velocity";
  })();

  // Days callout label + icon
  const dabLabel = (() => {
    if (dab === null) return null;
    const abs = Math.abs(dab);
    if (dabTierKey === "ahead")   return `${abs} day${abs !== 1 ? "s" : ""} ahead of target`;
    if (dabTierKey === "warning") return `${abs} day${abs !== 1 ? "s" : ""} behind target ⚠️`;
    return `${abs} day${abs !== 1 ? "s" : ""} behind target 🚨`;
  })();

  const dabSub = (() => {
    if (dab === null) return stats.total === 0 ? "Add tasks to see schedule status." : "Complete at least one task to project launch.";
    if (dabTierKey === "ahead")   return `Projected ${fmtDate(projLaunch)} · Target ${fmtDate(app?.targetDate)} · On track`;
    if (dabTierKey === "warning") return `Projected ${fmtDate(projLaunch)} · Target ${fmtDate(app?.targetDate)} · Monitor closely`;
    return `Projected ${fmtDate(projLaunch)} · Target ${fmtDate(app?.targetDate)} · Needs attention`;
  })();

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter',sans-serif", color: "#0f172a" }}>

      {/* ── Header ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "20px 32px" }}>
        <div style={{ maxWidth: "1060px", margin: "0 auto" }}>
          <button onClick={() => setLocation("/app-tracker")} style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: "#0f172a", cursor: "pointer", fontSize: "13px", fontWeight: 500, marginBottom: "14px", padding: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back to App Tracker
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" as const }}>
            <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans',sans-serif", color: "#0f172a", letterSpacing: "-0.3px" }}>{app?.name ?? `App #${appId}`}</div>
            <select
              value={appStage}
              onChange={e => changeStage(e.target.value)}
              style={{
                background: (STAGE_COLORS[appStage] ?? "#94a3b8") + "18",
                border: `1px solid ${(STAGE_COLORS[appStage] ?? "#94a3b8")}66`,
                borderRadius: "20px", padding: "3px 12px", fontSize: "11px",
                color: STAGE_COLORS[appStage] ?? "#94a3b8", fontWeight: 700,
                letterSpacing: "0.06em", cursor: "pointer", outline: "none",
              }}
            >
              {DEV_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {app?.description && <span style={{ fontSize: "13px", color: "#0f172a" }}>{app.description}</span>}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "32px" }}>

        {/* ── TOP ROW: Summary + Documents & Notes ── */}
        <div style={{ display: "flex", gap: "24px", marginBottom: "32px", alignItems: "flex-start" }}>

        {/* ── SUMMARY SECTION ── */}
        <div style={{ flex: "1 1 0", minWidth: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "28px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>

          {/* Header row with dailyHours setting */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap" as const, gap: "12px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: BRAND, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Summary</div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "#0f172a", fontWeight: 500 }}>Daily hours available:</span>
              <input
                type="number" min={0.5} max={24} step={0.5}
                value={dailyHoursInput}
                onChange={e => setDailyHoursInput(e.target.value)}
                onBlur={() => { const n = parseFloat(dailyHoursInput); if (!isNaN(n) && n > 0) saveDailyHours(n); else setDailyHoursInput(String(dailyHours)); }}
                style={{ width: "60px", border: `1px solid ${BRAND}55`, borderRadius: "7px", padding: "5px 8px", fontSize: "13px", fontWeight: 600, color: BRAND, textAlign: "center" as const, outline: "none", background: BRAND_BG }}
              />
              <span style={{ fontSize: "12px", color: "#0f172a" }}>hrs/day</span>
            </div>
          </div>

          {/* Row 1 — Date cards (Start + Target/Launch editable inline) */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            {/* Editable Start Date */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "18px 20px", flex: 1, minWidth: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#0f172a", marginBottom: "8px" }}>Start Date</div>
              <input
                type="date"
                value={appStartDate}
                onChange={e => { setAppStartDate(e.target.value); saveAppField("startDate", e.target.value); }}
                style={{ width: "100%", border: "none", outline: "none", fontSize: "17px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans',sans-serif", color: appStartDate ? "#0f172a" : "#cbd5e1", background: "transparent", cursor: "pointer", padding: 0, boxSizing: "border-box" }}
              />
              {!appStartDate && <div style={{ fontSize: "11px", color: "#0f172a", marginTop: "2px" }}>Click to set</div>}
            </div>
            {/* Launch Date (when Live) or Original Target */}
            {appStage === "Live" ? (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "14px", padding: "18px 20px", flex: 1, minWidth: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#16a34a", marginBottom: "8px" }}>Launch Date</div>
                <input
                  type="date"
                  value={appLaunchDate}
                  onChange={e => { setAppLaunchDate(e.target.value); saveAppField("launchDate", e.target.value); }}
                  style={{ width: "100%", border: "none", outline: "none", fontSize: "17px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans',sans-serif", color: appLaunchDate ? "#16a34a" : "#bbf7d0", background: "transparent", cursor: "pointer", padding: 0, boxSizing: "border-box" }}
                />
                {!appLaunchDate && <div style={{ fontSize: "11px", color: "#16a34a", marginTop: "2px" }}>Click to set</div>}
              </div>
            ) : (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "18px 20px", flex: 1, minWidth: 0, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#0f172a", marginBottom: "8px" }}>Original Target</div>
                <input
                  type="date"
                  value={appTargetDate}
                  onChange={e => { setAppTargetDate(e.target.value); saveAppField("targetDate", e.target.value); }}
                  style={{ width: "100%", border: "none", outline: "none", fontSize: "17px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans',sans-serif", color: appTargetDate ? "#0f172a" : "#cbd5e1", background: "transparent", cursor: "pointer", padding: 0, boxSizing: "border-box" }}
                />
                {!appTargetDate && <div style={{ fontSize: "11px", color: "#0f172a", marginTop: "2px" }}>Click to set</div>}
              </div>
            )}
            <StatCard
              label="Projected Launch"
              value={loading ? "Loading…" : fmtDate(projLaunch)}
              sub={projSub}
              accent={!!projLaunch}
            />
          </div>

          {/* Row 2 — Count cards */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
            <StatCard label="Total Tasks"  value={loading ? "—" : String(stats.total)} sub={stats.total > 0 ? `Across ${sprints.length} sprint${sprints.length !== 1 ? "s" : ""}` : "No sprints yet"} />
            <StatCard label="Completed"    value={loading ? "—" : String(stats.done)}  sub={stats.total > 0 ? `${stats.pct}% of total` : undefined} />
            <StatCard label="Remaining"    value={loading ? "—" : String(stats.total - stats.done)} sub={stats.total > 0 && stats.done < stats.total ? "Tasks left" : stats.done > 0 ? "All done!" : undefined} />
          </div>

          {/* Overall progress bar */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#0f172a" }}>Overall Progress</span>
              <span style={{ fontSize: "15px", fontWeight: 700, color: BRAND }}>{stats.total > 0 ? `${stats.pct}%` : "—"}</span>
            </div>
            <div style={{ height: "10px", background: "#f1f5f9", borderRadius: "5px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: stats.total > 0 ? `${stats.pct}%` : "0%", background: `linear-gradient(90deg, ${BRAND}, ${BRAND_LIGHT})`, borderRadius: "5px", transition: "width 0.5s ease" }} />
            </div>
          </div>

          {/* Current sprint */}
          {currentSprint && (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 18px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" as const }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#0f172a" }}>Current Sprint</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>{currentSprint.name}</span>
                  {currentSprint.startDate && currentSprint.endDate && (
                    <span style={{ fontSize: "11px", color: "#0f172a" }}>{currentSprint.startDate} → {currentSprint.endDate}</span>
                  )}
                </div>
                <span style={{ fontSize: "13px", fontWeight: 700, color: BRAND, flexShrink: 0 }}>{csPct}%</span>
              </div>
              <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${csPct}%`, background: `linear-gradient(90deg, ${BRAND}, ${BRAND_LIGHT})`, borderRadius: "3px", transition: "width 0.4s" }} />
              </div>
              <div style={{ fontSize: "11px", color: "#0f172a", marginTop: "6px" }}>{csDone}/{csTasks.length} tasks complete</div>
            </div>
          )}

          {/* 3-tier days ahead/behind callout */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 20px", borderRadius: "12px", marginBottom: "20px", background: tier.bg, border: `1px solid ${tier.border}` }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0, background: tier.iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {dab !== null ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={tier.iconStroke} strokeWidth="2.5">
                  {dabTierKey === "ahead"
                    ? <path d="M12 19V5M5 12l7-7 7 7"/>
                    : <path d="M12 5v14M5 12l7 7 7-7"/>
                  }
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={tier.iconStroke} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              )}
            </div>
            <div>
              {dabLabel
                ? <div style={{ fontSize: "16px", fontWeight: 700, color: tier.headColor }}>{dabLabel}</div>
                : <div style={{ fontSize: "14px", fontWeight: 600, color: tier.headColor }}>Schedule status unavailable</div>
              }
              <div style={{ fontSize: "12px", color: tier.subColor, marginTop: "2px" }}>{dabSub}</div>
            </div>
          </div>

          {/* Toggle task table button */}
          <button onClick={handleToggleTaskTable}
            style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: showTaskTable ? "#f1f5f9" : BRAND, border: showTaskTable ? "1px solid #e2e8f0" : "none", borderRadius: "10px", color: showTaskTable ? "#64748b" : "#fff", padding: "11px 22px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            {showTaskTable ? "Hide Task Table" : "View Full Task Table"}
          </button>
        </div>{/* end summary card */}

        {/* ── DOCUMENTS & NOTES PANEL ── */}
        <div style={{ width: "340px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Documents card */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: BRAND, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Documents</div>
              <button
                onClick={() => docFileInputRef.current?.click()}
                disabled={uploading}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: uploading ? "#f1f5f9" : BRAND, border: "none", borderRadius: "8px", color: uploading ? "#94a3b8" : "#fff", padding: "7px 14px", fontSize: "12px", fontWeight: 600, cursor: uploading ? "not-allowed" : "pointer" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                {uploading ? "Uploading…" : "Upload"}
              </button>
              <input ref={docFileInputRef} type="file" style={{ display: "none" }} onChange={handleDocFileChange} />
            </div>

            {/* Upload progress bar */}
            {uploading && uploadProgress !== null && (
              <div style={{ marginBottom: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#0f172a", marginBottom: "4px" }}>
                  <span>Uploading…</span><span>{uploadProgress}%</span>
                </div>
                <div style={{ height: "6px", background: "#f1f5f9", borderRadius: "3px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${uploadProgress}%`, background: `linear-gradient(90deg, ${BRAND}, ${BRAND_LIGHT})`, borderRadius: "3px", transition: "width 0.2s" }} />
                </div>
              </div>
            )}

            {/* Doc error */}
            {docError && (
              <div style={{ fontSize: "12px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "7px", padding: "8px 10px", marginBottom: "12px" }}>{docError}</div>
            )}

            {/* Document list */}
            {docs.length === 0 && !uploading ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#0f172a" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: "8px", display: "block", margin: "0 auto 8px" }}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <div style={{ fontSize: "12px" }}>No documents yet</div>
                <div style={{ fontSize: "11px", marginTop: "2px" }}>Upload files to attach them here</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {docs.map(d => (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: BRAND_BG, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{d.name}</div>
                      <div style={{ fontSize: "11px", color: "#0f172a" }}>{fmtFileSize(d.size)}</div>
                    </div>
                    <a href={d.url} target="_blank" rel="noopener noreferrer" title="Download" style={{ color: BRAND, flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </a>
                    <button onClick={() => deleteDoc(d)} title="Delete" style={{ background: "none", border: "none", cursor: "pointer", color: "#0f172a", padding: "2px", flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#dc2626")}
                      onMouseLeave={e => (e.currentTarget.style.color = "#cbd5e1")}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes card */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "22px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div style={{ fontSize: "13px", fontWeight: 700, color: BRAND, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Notes</div>
              {notesSaving && <span style={{ fontSize: "11px", color: "#0f172a" }}>Saving…</span>}
              {!notesSaving && notes && <span style={{ fontSize: "11px", color: "#16a34a" }}>Saved</span>}
            </div>
            <textarea
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
              placeholder="Add notes, links, decisions, or anything relevant to this app…"
              rows={10}
              style={{
                width: "100%", boxSizing: "border-box" as const, resize: "vertical" as const,
                border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 14px",
                fontSize: "13px", fontFamily: "'Inter',sans-serif", color: "#0f172a",
                background: "#f8fafc", outline: "none", lineHeight: "1.6",
              }}
              onFocus={e => (e.target.style.borderColor = BRAND)}
              onBlur={e => (e.target.style.borderColor = "#e2e8f0")}
            />
          </div>

        </div>{/* end documents & notes panel */}
        </div>{/* end top row flex */}

        {/* ── FULL TASK TABLE (toggle) ── */}
        {showTaskTable && (
          <div ref={taskTableRef} style={{ marginBottom: "32px", scrollMarginTop: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans',sans-serif", color: "#0f172a" }}>Full Task Table</div>
              <span style={{ fontSize: "12px", color: "#0f172a" }}>Click a row to expand · Planned/Adj dates auto-calculated from start date + hours ÷ {dailyHours} hrs/day</span>
            </div>
            {loading ? (
              <div style={{ textAlign: "center", padding: "40px", color: "#0f172a" }}>Loading…</div>
            ) : (
              <TaskTable
                sprints={sprints}
                taskDates={schedule.taskDates}
                updateSprint={updateSprint}
                addSprint={addSprint}
              />
            )}
          </div>
        )}

        {/* ── SPRINT MANAGEMENT (card view) ── */}
        {/* Hidden file input for CSV upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap" as const, gap: "8px" }}>
          <div style={{ fontSize: "16px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans',sans-serif", color: "#0f172a" }}>
            Sprints <span style={{ fontSize: "13px", color: "#0f172a", fontWeight: 500 }}>({sprints.length})</span>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" as const }}>
            {importError && (
              <span style={{ fontSize: "12px", color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "7px", padding: "5px 10px" }}>
                ⚠ {importError}
              </span>
            )}
            <button onClick={downloadTemplate}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "9px", color: "#475569", padding: "8px 14px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Download Template
            </button>
            <button onClick={() => { setImportError(null); fileInputRef.current?.click(); }}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#fff", border: `1px solid ${BRAND}`, borderRadius: "9px", color: BRAND, padding: "8px 14px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Import CSV
            </button>
            <button onClick={() => setShowSprintModal(true)}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: BRAND, border: "none", borderRadius: "9px", color: "#fff", padding: "9px 18px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Add Sprint
            </button>
          </div>
        </div>

        {loading && <div style={{ textAlign: "center", padding: "60px 0", color: "#0f172a", fontSize: "14px" }}>Loading sprints…</div>}
        {error   && <div style={{ textAlign: "center", padding: "60px 0", color: "#dc2626", fontSize: "14px" }}>Error: {error}</div>}

        {!loading && sprints.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: BRAND_BG, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 14l2 2 4-4"/></svg>
            </div>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>No sprints yet</div>
            <div style={{ fontSize: "13px", color: "#0f172a" }}>Create your first sprint to start tracking tasks.</div>
          </div>
        )}

        {/* Sprint cards */}
        <div style={{ display: "grid", gap: "16px" }}>
          {sprints.map(sprint => {
            const tasks = sprint.tasks ?? [];
            const done  = tasks.filter(t => t.status === "done").length;
            const pct   = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
            return (
              <div key={sprint.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" as const }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans',sans-serif", color: "#0f172a" }}>{sprint.name}</span>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: pct === 100 ? "#16a34a" : BRAND, background: pct === 100 ? "#f0fdf4" : BRAND_BG, borderRadius: "20px", padding: "2px 10px" }}>{pct}%</span>
                    </div>
                    {(sprint.startDate || sprint.endDate) && (
                      <div style={{ fontSize: "11px", color: "#0f172a", marginTop: "3px" }}>
                        {sprint.startDate && `Start: ${sprint.startDate}`}{sprint.startDate && sprint.endDate && " · "}{sprint.endDate && `End: ${sprint.endDate}`}
                      </div>
                    )}
                    <div style={{ marginTop: "8px", height: "4px", background: "#f1f5f9", borderRadius: "2px", width: "200px", maxWidth: "100%" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#16a34a" : `linear-gradient(90deg, ${BRAND}, ${BRAND_LIGHT})`, borderRadius: "2px", transition: "width 0.3s" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px", color: "#0f172a" }}>{done}/{tasks.length} done</span>
                    <button onClick={() => deleteSprint(sprint.id)} title="Delete sprint" style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: "7px", color: "#0f172a", cursor: "pointer", padding: "5px", lineHeight: 0 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </div>
                </div>
                <div style={{ padding: "8px 0" }}>
                  {tasks.length === 0 && addingTask !== sprint.id && (
                    <div style={{ padding: "14px 20px", fontSize: "13px", color: "#0f172a", fontStyle: "italic" }}>No tasks yet — add one below.</div>
                  )}
                  {tasks.map(task => {
                    const sty = STATUS_MAP[task.status] ?? STATUS_MAP["todo"];
                    return (
                      <div key={task.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 20px", borderBottom: "1px solid #f8fafc" }}>
                        <button onClick={() => handleCycleStatus(sprint.id, tasks, task.id)} title="Click to advance status"
                          style={{ flexShrink: 0, background: sty.bg, border: "none", borderRadius: "20px", color: sty.color, fontSize: "10px", fontWeight: 700, padding: "3px 10px", cursor: "pointer", letterSpacing: "0.04em", whiteSpace: "nowrap" as const }}
                        >{sty.label}</button>
                        <span style={{ flex: 1, fontSize: "13px", color: task.status === "done" ? "#94a3b8" : "#334155", textDecoration: task.status === "done" ? "line-through" : "none" }}>
                          {task.title}
                        </span>
                        {/* Show computed adj due in card view */}
                        {(() => {
                          const c = schedule.taskDates.get(task.id);
                          const d = c?.adjustedDue ?? c?.plannedDue;
                          return d ? <span style={{ fontSize: "11px", color: "#0f172a", whiteSpace: "nowrap" as const }}>{fmtDate(d)}</span> : null;
                        })()}
                        <button onClick={() => handleDeleteTask(sprint.id, tasks, task.id)} style={{ background: "none", border: "none", color: "#0f172a", cursor: "pointer", padding: "2px", lineHeight: 0, flexShrink: 0 }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    );
                  })}
                  {addingTask === sprint.id ? (
                    <div style={{ display: "flex", gap: "8px", padding: "10px 20px", alignItems: "center" }}>
                      <input autoFocus value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleAddTask(sprint.id, tasks); if (e.key === "Escape") { setAddingTask(null); setNewTaskTitle(""); } }}
                        placeholder="Task title… (Enter to save, Esc to cancel)"
                        style={{ flex: 1, border: `1px solid ${BRAND}66`, borderRadius: "8px", padding: "8px 12px", fontSize: "13px", outline: "none", color: "#0f172a", background: "#fff" }}
                      />
                      <button onClick={() => handleAddTask(sprint.id, tasks)} style={{ background: BRAND, border: "none", borderRadius: "8px", color: "#fff", padding: "8px 14px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Add</button>
                      <button onClick={() => { setAddingTask(null); setNewTaskTitle(""); }} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#0f172a", padding: "8px 12px", fontSize: "12px", cursor: "pointer" }}>Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingTask(sprint.id)}
                      style={{ display: "flex", alignItems: "center", gap: "6px", margin: "8px 20px", background: "none", border: "1px dashed #e2e8f0", borderRadius: "8px", color: "#0f172a", padding: "7px 14px", cursor: "pointer", fontSize: "12px", fontWeight: 500 }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                      Add task
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CSV Import Preview Modal */}
      {importPreview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: "20px" }}>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "16px", width: "100%", maxWidth: "500px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 14px", borderBottom: "1px solid #f1f5f9" }}>
              <div>
                <div style={{ fontSize: "17px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans',sans-serif", color: "#0f172a" }}>Review Import</div>
                <div style={{ fontSize: "12px", color: "#0f172a", marginTop: "2px" }}>
                  {importPreview.sprintRows.length} sprint{importPreview.sprintRows.length !== 1 ? "s" : ""} · {importPreview.sprintRows.reduce((a, b) => a + b.taskCount, 0)} tasks
                </div>
              </div>
              <button onClick={() => setImportPreview(null)} style={{ background: "none", border: "none", color: "#0f172a", cursor: "pointer", padding: "4px", lineHeight: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Sprint list */}
            <div style={{ overflowY: "auto", flex: 1, padding: "16px 24px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#0f172a", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "10px" }}>Sprints found in file</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {importPreview.sprintRows.map(s => (
                  <div key={s.name} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", borderRadius: "10px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                      <div style={{ fontSize: "11px", color: "#0f172a", marginTop: "2px" }}>
                        {s.taskCount} task{s.taskCount !== 1 ? "s" : ""}
                        {s.startDate && ` · ${s.startDate}`}{s.endDate && ` → ${s.endDate}`}
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, fontSize: "11px", fontWeight: 600, padding: "3px 8px", borderRadius: "6px", background: s.isNew ? "#dcfce7" : "#fef9c3", color: s.isNew ? "#15803d" : "#92400e" }}>
                      {s.isNew ? "New" : "Merge"}
                    </span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: "12px", padding: "10px 14px", borderRadius: "10px", background: "#f0f9ff", border: "1px solid #bae6fd", fontSize: "12px", color: "#0369a1" }}>
                <strong>New</strong> sprints will be created. <strong>Merge</strong> sprints already exist — tasks will be appended.
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "14px 24px 20px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button onClick={() => setImportPreview(null)} disabled={importing}
                style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "9px", color: "#475569", padding: "9px 18px", fontSize: "13px", fontWeight: 600, cursor: importing ? "not-allowed" : "pointer", opacity: importing ? 0.5 : 1 }}
              >
                Cancel
              </button>
              <button onClick={confirmImport} disabled={importing}
                style={{ background: importing ? "#94a3b8" : BRAND, border: "none", borderRadius: "9px", color: "#fff", padding: "9px 22px", fontSize: "13px", fontWeight: 600, cursor: importing ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: "8px" }}
              >
                {importing && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>}
                {importing ? "Importing…" : `Import ${importPreview.sprintRows.reduce((a,b) => a+b.taskCount,0)} Tasks`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sprint Modal (card view) */}
      {showSprintModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "16px", width: "100%", maxWidth: "440px", boxShadow: "0 20px 60px rgba(0,0,0,0.12)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 14px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ fontSize: "17px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans',sans-serif", color: "#0f172a" }}>New Sprint</span>
              <button onClick={() => setShowSprintModal(false)} style={{ background: "none", border: "none", color: "#0f172a", cursor: "pointer", padding: "4px", lineHeight: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ padding: "20px 24px", display: "grid", gap: "14px" }}>
              <div>
                <label style={LBL}>Sprint Name *</label>
                <input autoFocus style={INP} value={sprintForm.name} onChange={e => setSprintForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Sprint 1 — Auth & Onboarding" onKeyDown={e => e.key === "Enter" && handleAddSprint()} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div><label style={LBL}>Start Date</label><input type="date" style={INP} value={sprintForm.startDate} onChange={e => setSprintForm(f => ({ ...f, startDate: e.target.value }))} /></div>
                <div><label style={LBL}>End Date</label><input type="date" style={INP} value={sprintForm.endDate} onChange={e => setSprintForm(f => ({ ...f, endDate: e.target.value }))} /></div>
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button onClick={() => setShowSprintModal(false)} style={{ background: "transparent", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#334155", padding: "9px 18px", fontSize: "13px", cursor: "pointer" }}>Cancel</button>
                <button onClick={handleAddSprint} disabled={sprintSaving} style={{ background: BRAND, border: "none", borderRadius: "8px", color: "#fff", padding: "9px 20px", fontSize: "13px", fontWeight: 600, cursor: "pointer", opacity: sprintSaving ? 0.7 : 1 }}>
                  {sprintSaving ? "Saving…" : "Create Sprint"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
