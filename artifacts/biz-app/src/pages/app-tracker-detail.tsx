import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useAppSprints, computeSprintStats, Task, TaskStatus } from "@/hooks/useAppSprints";

const BRAND = "#266b75";
const BRAND_BG = "rgba(38,107,117,0.08)";

const STATUS_STYLES: Record<TaskStatus, { label: string; bg: string; color: string; next: TaskStatus }> = {
  "todo":        { label: "To Do",       bg: "#f1f5f9",   color: "#64748b", next: "in-progress" },
  "in-progress": { label: "In Progress", bg: "#eff6ff",   color: "#2563eb", next: "done"        },
  "done":        { label: "Done",        bg: "#f0fdf4",   color: "#16a34a", next: "todo"        },
};

function fmt(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AppDevTrackerDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const appId = params.id ?? "";

  // Load app metadata from localStorage (synced by app-tracker.tsx)
  const appsRaw = localStorage.getItem("hm_tracker_apps");
  const allApps: { id: number; name: string; stage: string; description: string; targetDate: string }[] =
    appsRaw ? JSON.parse(appsRaw) : [];
  const app = allApps.find(a => String(a.id) === appId);

  const { sprints, loading, error, addSprint, updateSprint, deleteSprint } = useAppSprints(appId);
  const stats = computeSprintStats(sprints, app?.targetDate ?? "");

  // Add sprint modal state
  const [showSprintModal, setShowSprintModal] = useState(false);
  const [sprintForm, setSprintForm] = useState({ name: "", startDate: "", endDate: "" });
  const [sprintSaving, setSprintSaving] = useState(false);

  // Add task state per sprint
  const [addingTask, setAddingTask] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");

  const handleAddSprint = async () => {
    if (!sprintForm.name.trim()) return;
    setSprintSaving(true);
    await addSprint({ name: sprintForm.name.trim(), startDate: sprintForm.startDate, endDate: sprintForm.endDate, tasks: [] });
    setSprintForm({ name: "", startDate: "", endDate: "" });
    setShowSprintModal(false);
    setSprintSaving(false);
  };

  const handleAddTask = async (sprintId: string, tasks: Task[]) => {
    if (!newTaskTitle.trim()) return;
    const newTask: Task = { id: crypto.randomUUID(), title: newTaskTitle.trim(), status: "todo" };
    await updateSprint(sprintId, { tasks: [...tasks, newTask] });
    setNewTaskTitle("");
    setAddingTask(null);
  };

  const handleCycleStatus = async (sprintId: string, tasks: Task[], taskId: string) => {
    const updated = tasks.map(t =>
      t.id === taskId ? { ...t, status: STATUS_STYLES[t.status].next } : t
    );
    await updateSprint(sprintId, { tasks: updated });
  };

  const handleDeleteTask = async (sprintId: string, tasks: Task[], taskId: string) => {
    await updateSprint(sprintId, { tasks: tasks.filter(t => t.id !== taskId) });
  };

  const s = labelStyle;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif", color: "#0f172a" }}>

      {/* Header */}
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0", padding: "20px 32px" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <button
            onClick={() => setLocation("/app-tracker")}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "13px", fontWeight: 500, marginBottom: "14px", padding: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back to App Tracker
          </button>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#0f172a", letterSpacing: "-0.3px" }}>
                {app?.name ?? `App #${appId}`}
              </div>
              {app?.description && (
                <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>{app.description}</div>
              )}
              {app?.stage && (
                <div style={{ marginTop: "8px" }}>
                  <span style={{ background: BRAND_BG, border: `1px solid ${BRAND}44`, borderRadius: "20px", padding: "3px 12px", fontSize: "11px", color: BRAND, fontWeight: 700, letterSpacing: "0.06em" }}>
                    {app.stage}
                  </span>
                </div>
              )}
            </div>
            {/* Stats row */}
            <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
              {[
                { label: "Progress", value: stats.total > 0 ? `${stats.pct}%` : "—" },
                { label: "Tasks", value: stats.total > 0 ? `${stats.done}/${stats.total}` : "—" },
                { label: "Projected Launch", value: stats.projectedDate ? fmt(stats.projectedDate) : "—" },
                {
                  label: "vs. Target",
                  value: stats.daysAheadBehind !== null
                    ? `${Math.abs(stats.daysAheadBehind)}d ${stats.daysAheadBehind >= 0 ? "ahead" : "behind"}`
                    : "—",
                  color: stats.daysAheadBehind !== null ? (stats.daysAheadBehind >= 0 ? "#16a34a" : "#dc2626") : "#94a3b8",
                },
              ].map(s => (
                <div key={s.label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", color: (s as any).color ?? "#0f172a" }}>{s.value}</div>
                  <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px", fontWeight: 500 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Overall progress bar */}
          {stats.total > 0 && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ height: "6px", background: "#f1f5f9", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${stats.pct}%`, background: `linear-gradient(90deg, ${BRAND}, #7dbdc6)`, borderRadius: "3px", transition: "width 0.4s ease" }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "32px" }}>

        {/* Sprint list header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "16px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#0f172a" }}>
            Sprints <span style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 500 }}>({sprints.length})</span>
          </div>
          <button
            onClick={() => setShowSprintModal(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: BRAND, border: "none", borderRadius: "9px", color: "#fff", padding: "9px 18px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Add Sprint
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8", fontSize: "14px" }}>Loading sprints…</div>
        )}
        {error && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#dc2626", fontSize: "14px" }}>Error: {error}</div>
        )}

        {!loading && sprints.length === 0 && (
          <div style={{ textAlign: "center", padding: "80px 0" }}>
            <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: BRAND_BG, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={BRAND} strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 14l2 2 4-4"/></svg>
            </div>
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#334155", marginBottom: "6px" }}>No sprints yet</div>
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>Create your first sprint to start tracking tasks.</div>
          </div>
        )}

        {/* Sprint cards */}
        <div style={{ display: "grid", gap: "16px" }}>
          {sprints.map(sprint => {
            const tasks = sprint.tasks ?? [];
            const done = tasks.filter(t => t.status === "done").length;
            const pct = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

            return (
              <div key={sprint.id} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>

                {/* Sprint header */}
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ fontSize: "15px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#0f172a" }}>{sprint.name}</span>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: pct === 100 ? "#16a34a" : BRAND, background: pct === 100 ? "#f0fdf4" : BRAND_BG, borderRadius: "20px", padding: "2px 10px" }}>{pct}%</span>
                    </div>
                    {(sprint.startDate || sprint.endDate) && (
                      <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>
                        {sprint.startDate && `Start: ${sprint.startDate}`}
                        {sprint.startDate && sprint.endDate && " · "}
                        {sprint.endDate && `End: ${sprint.endDate}`}
                      </div>
                    )}
                    {/* Sprint progress bar */}
                    <div style={{ marginTop: "8px", height: "4px", background: "#f1f5f9", borderRadius: "2px", width: "200px", maxWidth: "100%" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#16a34a" : `linear-gradient(90deg, ${BRAND}, #7dbdc6)`, borderRadius: "2px", transition: "width 0.3s" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>{done}/{tasks.length} done</span>
                    <button
                      onClick={() => deleteSprint(sprint.id)}
                      title="Delete sprint"
                      style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: "7px", color: "#94a3b8", cursor: "pointer", padding: "5px", lineHeight: 0 }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                    </button>
                  </div>
                </div>

                {/* Tasks */}
                <div style={{ padding: "8px 0" }}>
                  {tasks.length === 0 && addingTask !== sprint.id && (
                    <div style={{ padding: "14px 20px", fontSize: "13px", color: "#cbd5e1", fontStyle: "italic" }}>No tasks yet — add one below.</div>
                  )}
                  {tasks.map(task => {
                    const sty = STATUS_STYLES[task.status];
                    return (
                      <div key={task.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 20px", borderBottom: "1px solid #f8fafc" }}>
                        {/* Status toggle pill */}
                        <button
                          onClick={() => handleCycleStatus(sprint.id, tasks, task.id)}
                          title="Click to advance status"
                          style={{ flexShrink: 0, background: sty.bg, border: "none", borderRadius: "20px", color: sty.color, fontSize: "10px", fontWeight: 700, padding: "3px 10px", cursor: "pointer", letterSpacing: "0.04em", whiteSpace: "nowrap" }}
                        >
                          {sty.label}
                        </button>
                        <span style={{ flex: 1, fontSize: "13px", color: task.status === "done" ? "#94a3b8" : "#334155", textDecoration: task.status === "done" ? "line-through" : "none" }}>
                          {task.title}
                        </span>
                        <button
                          onClick={() => handleDeleteTask(sprint.id, tasks, task.id)}
                          style={{ background: "none", border: "none", color: "#cbd5e1", cursor: "pointer", padding: "2px", lineHeight: 0, flexShrink: 0 }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        </button>
                      </div>
                    );
                  })}

                  {/* Add task inline */}
                  {addingTask === sprint.id ? (
                    <div style={{ display: "flex", gap: "8px", padding: "10px 20px", alignItems: "center" }}>
                      <input
                        autoFocus
                        value={newTaskTitle}
                        onChange={e => setNewTaskTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleAddTask(sprint.id, tasks); if (e.key === "Escape") { setAddingTask(null); setNewTaskTitle(""); } }}
                        placeholder="Task title… (Enter to save, Esc to cancel)"
                        style={{ flex: 1, border: `1px solid ${BRAND}66`, borderRadius: "8px", padding: "8px 12px", fontSize: "13px", outline: "none", color: "#0f172a", background: "#fff" }}
                      />
                      <button onClick={() => handleAddTask(sprint.id, tasks)} style={{ background: BRAND, border: "none", borderRadius: "8px", color: "#fff", padding: "8px 14px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                        Add
                      </button>
                      <button onClick={() => { setAddingTask(null); setNewTaskTitle(""); }} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#64748b", padding: "8px 12px", fontSize: "12px", cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingTask(sprint.id)}
                      style={{ display: "flex", alignItems: "center", gap: "6px", margin: "8px 20px", background: "none", border: "1px dashed #e2e8f0", borderRadius: "8px", color: "#94a3b8", padding: "7px 14px", cursor: "pointer", fontSize: "12px", fontWeight: 500 }}
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

      {/* Add Sprint Modal */}
      {showSprintModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", width: "100%", maxWidth: "440px", boxShadow: "0 20px 60px rgba(0,0,0,0.12)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px 14px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ fontSize: "17px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#0f172a" }}>New Sprint</span>
              <button onClick={() => setShowSprintModal(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "4px", lineHeight: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ padding: "20px 24px", display: "grid", gap: "14px" }}>
              <div>
                <label style={s}>Sprint Name *</label>
                <input
                  autoFocus
                  style={inp}
                  value={sprintForm.name}
                  onChange={e => setSprintForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Sprint 1 — Auth & Onboarding"
                  onKeyDown={e => e.key === "Enter" && handleAddSprint()}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={s}>Start Date</label>
                  <input type="date" style={inp} value={sprintForm.startDate} onChange={e => setSprintForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div>
                  <label style={s}>End Date</label>
                  <input type="date" style={inp} value={sprintForm.endDate} onChange={e => setSprintForm(f => ({ ...f, endDate: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "4px" }}>
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

const labelStyle: React.CSSProperties = {
  display: "block", color: "#334155", fontSize: "11px", fontWeight: 600,
  letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px",
};
const inp: React.CSSProperties = {
  width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px",
  color: "#0f172a", padding: "9px 12px", fontSize: "13px", fontFamily: "'Inter', sans-serif",
  boxSizing: "border-box",
};
