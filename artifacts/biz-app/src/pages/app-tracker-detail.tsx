import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useAppSprints, computeSprintStats, Task, TaskStatus, Sprint } from "@/hooks/useAppSprints";

const BRAND       = "#266b75";
const BRAND_LIGHT = "#7dbdc6";
const BRAND_BG    = "rgba(38,107,117,0.08)";

const STATUS_STYLES: Record<TaskStatus, { label: string; bg: string; color: string; next: TaskStatus }> = {
  "todo":        { label: "To Do",       bg: "#f1f5f9", color: "#64748b", next: "in-progress" },
  "in-progress": { label: "In Progress", bg: "#eff6ff", color: "#2563eb", next: "done"        },
  "done":        { label: "Done",        bg: "#f0fdf4", color: "#16a34a", next: "todo"        },
};

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d + (d.includes("T") ? "" : "T00:00:00")) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getCurrentSprint(sprints: Sprint[]): Sprint | null {
  if (!sprints.length) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const active = sprints.find(s => {
    const start = s.startDate ? new Date(s.startDate + "T00:00:00") : null;
    const end   = s.endDate   ? new Date(s.endDate   + "T23:59:59") : null;
    if (!start) return false;
    return (!end || today <= end) && today >= start;
  });
  return active ?? sprints[sprints.length - 1];
}

function StatCard({
  label, value, sub, accent,
}: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? BRAND : "#ffffff",
      border: `1px solid ${accent ? "transparent" : "#e2e8f0"}`,
      borderRadius: "14px",
      padding: "18px 20px",
      boxShadow: accent ? `0 4px 16px ${BRAND}44` : "0 1px 3px rgba(0,0,0,0.05)",
      flex: 1,
      minWidth: 0,
    }}>
      <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: accent ? "rgba(255,255,255,0.7)" : "#94a3b8", marginBottom: "8px" }}>
        {label}
      </div>
      <div style={{ fontSize: "20px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", color: accent ? "#ffffff" : "#0f172a", lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: "11px", color: accent ? "rgba(255,255,255,0.6)" : "#94a3b8", marginTop: "4px" }}>{sub}</div>
      )}
    </div>
  );
}

export default function AppDevTrackerDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const taskTableRef = useRef<HTMLDivElement>(null);
  const appId = params.id ?? "";

  const appsRaw = localStorage.getItem("hm_tracker_apps");
  const allApps: { id: number; name: string; stage: string; description: string; startDate?: string; targetDate?: string }[] =
    appsRaw ? JSON.parse(appsRaw) : [];
  const app = allApps.find(a => String(a.id) === appId);

  const { sprints, loading, error, addSprint, updateSprint, deleteSprint } = useAppSprints(appId);
  const stats = computeSprintStats(sprints, app?.targetDate ?? "");
  const currentSprint = getCurrentSprint(sprints);

  const [showSprintModal, setShowSprintModal] = useState(false);
  const [sprintForm, setSprintForm]           = useState({ name: "", startDate: "", endDate: "" });
  const [sprintSaving, setSprintSaving]       = useState(false);
  const [addingTask, setAddingTask]           = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle]       = useState("");

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
    const updated = tasks.map(t => t.id === taskId ? { ...t, status: STATUS_STYLES[t.status].next } : t);
    await updateSprint(sprintId, { tasks: updated });
  };

  const handleDeleteTask = async (sprintId: string, tasks: Task[], taskId: string) => {
    await updateSprint(sprintId, { tasks: tasks.filter(t => t.id !== taskId) });
  };

  // Current sprint derived values
  const csTasks = currentSprint?.tasks ?? [];
  const csDone  = csTasks.filter(t => t.status === "done").length;
  const csPct   = csTasks.length > 0 ? Math.round((csDone / csTasks.length) * 100) : 0;

  // Days ahead / behind
  const dab     = stats.daysAheadBehind;
  const dabAhead = dab !== null && dab >= 0;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif", color: "#0f172a" }}>

      {/* ── Page Header ── */}
      <div style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0", padding: "20px 32px" }}>
        <div style={{ maxWidth: "1060px", margin: "0 auto" }}>
          <button
            onClick={() => setLocation("/app-tracker")}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "13px", fontWeight: 500, marginBottom: "14px", padding: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back to App Tracker
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#0f172a", letterSpacing: "-0.3px" }}>
              {app?.name ?? `App #${appId}`}
            </div>
            {app?.stage && (
              <span style={{ background: BRAND_BG, border: `1px solid ${BRAND}44`, borderRadius: "20px", padding: "3px 12px", fontSize: "11px", color: BRAND, fontWeight: 700, letterSpacing: "0.06em" }}>
                {app.stage}
              </span>
            )}
            {app?.description && (
              <span style={{ fontSize: "13px", color: "#64748b" }}>{app.description}</span>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: "1060px", margin: "0 auto", padding: "32px" }}>

        {/* ── SUMMARY SECTION ── */}
        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "18px", padding: "28px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", marginBottom: "32px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: BRAND, letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: "20px" }}>
            Summary
          </div>

          {/* Row 1 — Date cards */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <StatCard
              label="Start Date"
              value={fmtDate(app?.startDate)}
            />
            <StatCard
              label="Original Target"
              value={fmtDate(app?.targetDate)}
            />
            <StatCard
              label="Projected Launch"
              value={loading ? "Loading…" : fmtDate(stats.projectedDate ?? undefined)}
              sub={
                stats.projectedDate ? "Based on current velocity"
                : stats.total === 0  ? "Add tasks to project"
                : "Not enough data yet"
              }
              accent={!!stats.projectedDate}
            />
          </div>

          {/* Row 2 — Count cards */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
            <StatCard
              label="Total Tasks"
              value={loading ? "—" : String(stats.total)}
              sub={stats.total > 0 ? `Across ${sprints.length} sprint${sprints.length !== 1 ? "s" : ""}` : "No sprints yet"}
            />
            <StatCard
              label="Completed"
              value={loading ? "—" : String(stats.done)}
              sub={stats.total > 0 ? `${stats.pct}% of total` : undefined}
            />
            <StatCard
              label="Remaining"
              value={loading ? "—" : String(stats.total - stats.done)}
              sub={stats.total > 0 && stats.done < stats.total ? "Tasks left" : stats.done > 0 ? "All done!" : undefined}
            />
          </div>

          {/* Overall progress bar */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#64748b" }}>Overall Progress</span>
              <span style={{ fontSize: "15px", fontWeight: 700, color: BRAND }}>{stats.total > 0 ? `${stats.pct}%` : "—"}</span>
            </div>
            <div style={{ height: "10px", background: "#f1f5f9", borderRadius: "5px", overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: stats.total > 0 ? `${stats.pct}%` : "0%",
                background: `linear-gradient(90deg, ${BRAND}, ${BRAND_LIGHT})`,
                borderRadius: "5px",
                transition: "width 0.5s ease",
              }} />
            </div>
          </div>

          {/* Current sprint */}
          {currentSprint && (
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 18px", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" as const }}>
                  <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#94a3b8" }}>Current Sprint</span>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>{currentSprint.name}</span>
                  {currentSprint.startDate && currentSprint.endDate && (
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>{currentSprint.startDate} → {currentSprint.endDate}</span>
                  )}
                </div>
                <span style={{ fontSize: "13px", fontWeight: 700, color: BRAND, flexShrink: 0 }}>{csPct}%</span>
              </div>
              <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${csPct}%`,
                  background: `linear-gradient(90deg, ${BRAND}, ${BRAND_LIGHT})`,
                  borderRadius: "3px",
                  transition: "width 0.4s",
                }} />
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px" }}>
                {csDone}/{csTasks.length} tasks complete
              </div>
            </div>
          )}

          {/* Days ahead / behind callout */}
          {dab !== null ? (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              padding: "14px 20px",
              borderRadius: "12px",
              marginBottom: "20px",
              background: dabAhead ? "#f0fdf4" : "#fef2f2",
              border: `1px solid ${dabAhead ? "#bbf7d0" : "#fecaca"}`,
            }}>
              <div style={{
                width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0,
                background: dabAhead ? "#dcfce7" : "#fee2e2",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={dabAhead ? "#16a34a" : "#dc2626"} strokeWidth="2.5">
                  {dabAhead
                    ? <path d="M12 19V5M5 12l7-7 7 7"/>
                    : <path d="M12 5v14M5 12l7 7 7-7"/>
                  }
                </svg>
              </div>
              <div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: dabAhead ? "#15803d" : "#dc2626" }}>
                  {Math.abs(dab)} day{Math.abs(dab) !== 1 ? "s" : ""} {dabAhead ? "ahead of target" : "behind target"}
                </div>
                <div style={{ fontSize: "12px", color: dabAhead ? "#16a34a" : "#ef4444", marginTop: "2px" }}>
                  {dabAhead
                    ? `Projected ${fmtDate(stats.projectedDate ?? undefined)} · Target ${fmtDate(app?.targetDate)} · On track`
                    : `Projected ${fmtDate(stats.projectedDate ?? undefined)} · Target ${fmtDate(app?.targetDate)} · Needs attention`}
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: "12px",
              padding: "12px 18px", borderRadius: "12px", marginBottom: "20px",
              background: "#f8fafc", border: "1px solid #e2e8f0",
            }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              </div>
              <span style={{ fontSize: "13px", color: "#64748b" }}>
                {stats.total === 0
                  ? "Add sprints and tasks to see projected launch and schedule status."
                  : stats.done === 0
                  ? "Complete at least one task to generate a projected launch date."
                  : "Not enough data yet to project launch date."}
              </span>
            </div>
          )}

          {/* View Full Task Table button */}
          <button
            onClick={() => taskTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              background: BRAND, border: "none", borderRadius: "10px",
              color: "#ffffff", padding: "11px 22px", fontSize: "13px",
              fontWeight: 600, cursor: "pointer", letterSpacing: "0.02em",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            View Full Task Table
          </button>
        </div>

        {/* ── SPRINT MANAGEMENT ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
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
        <div style={{ display: "grid", gap: "16px", marginBottom: "48px" }}>
          {sprints.map(sprint => {
            const tasks = sprint.tasks ?? [];
            const done  = tasks.filter(t => t.status === "done").length;
            const pct   = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
            return (
              <div key={sprint.id} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" as const }}>
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
                    <div style={{ marginTop: "8px", height: "4px", background: "#f1f5f9", borderRadius: "2px", width: "200px", maxWidth: "100%" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#16a34a" : `linear-gradient(90deg, ${BRAND}, ${BRAND_LIGHT})`, borderRadius: "2px", transition: "width 0.3s" }} />
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

                <div style={{ padding: "8px 0" }}>
                  {tasks.length === 0 && addingTask !== sprint.id && (
                    <div style={{ padding: "14px 20px", fontSize: "13px", color: "#cbd5e1", fontStyle: "italic" }}>No tasks yet — add one below.</div>
                  )}
                  {tasks.map(task => {
                    const sty = STATUS_STYLES[task.status];
                    return (
                      <div key={task.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 20px", borderBottom: "1px solid #f8fafc" }}>
                        <button
                          onClick={() => handleCycleStatus(sprint.id, tasks, task.id)}
                          title="Click to advance status"
                          style={{ flexShrink: 0, background: sty.bg, border: "none", borderRadius: "20px", color: sty.color, fontSize: "10px", fontWeight: 700, padding: "3px 10px", cursor: "pointer", letterSpacing: "0.04em", whiteSpace: "nowrap" as const }}
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

                  {addingTask === sprint.id ? (
                    <div style={{ display: "flex", gap: "8px", padding: "10px 20px", alignItems: "center" }}>
                      <input
                        autoFocus
                        value={newTaskTitle}
                        onChange={e => setNewTaskTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") handleAddTask(sprint.id, tasks);
                          if (e.key === "Escape") { setAddingTask(null); setNewTaskTitle(""); }
                        }}
                        placeholder="Task title… (Enter to save, Esc to cancel)"
                        style={{ flex: 1, border: `1px solid ${BRAND}66`, borderRadius: "8px", padding: "8px 12px", fontSize: "13px", outline: "none", color: "#0f172a", background: "#fff" }}
                      />
                      <button onClick={() => handleAddTask(sprint.id, tasks)} style={{ background: BRAND, border: "none", borderRadius: "8px", color: "#fff", padding: "8px 14px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>Add</button>
                      <button onClick={() => { setAddingTask(null); setNewTaskTitle(""); }} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#64748b", padding: "8px 12px", fontSize: "12px", cursor: "pointer" }}>Cancel</button>
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

        {/* ── FULL TASK TABLE ── */}
        <div ref={taskTableRef} style={{ scrollMarginTop: "24px" }}>
          <div style={{ fontSize: "16px", fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#0f172a", marginBottom: "16px" }}>
            Full Task Table
          </div>
          {sprints.length === 0 ? (
            <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
              No tasks yet — add sprints above to get started.
            </div>
          ) : (
            <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "14px", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Sprint", "Task", "Status"].map(h => (
                      <th key={h} style={{ padding: "11px 18px", textAlign: "left" as const, fontSize: "10px", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase" as const, borderBottom: "1px solid #e2e8f0" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sprints.flatMap(sprint =>
                    (sprint.tasks ?? []).map((task, i) => {
                      const sty = STATUS_STYLES[task.status];
                      const sprintTasks = sprint.tasks ?? [];
                      return (
                        <tr key={task.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                          {i === 0 && (
                            <td rowSpan={sprintTasks.length} style={{ padding: "10px 18px", verticalAlign: "top" as const, borderRight: "1px solid #f1f5f9", width: "220px" }}>
                              <div style={{ fontSize: "12px", fontWeight: 600, color: BRAND }}>{sprint.name}</div>
                              {sprint.endDate && <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>Due {sprint.endDate}</div>}
                            </td>
                          )}
                          <td style={{ padding: "10px 18px" }}>
                            <span style={{ fontSize: "13px", color: task.status === "done" ? "#94a3b8" : "#334155", textDecoration: task.status === "done" ? "line-through" : "none" }}>
                              {task.title}
                            </span>
                          </td>
                          <td style={{ padding: "10px 18px" }}>
                            <span style={{ background: sty.bg, color: sty.color, fontSize: "10px", fontWeight: 700, padding: "3px 10px", borderRadius: "20px", letterSpacing: "0.04em" }}>
                              {sty.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  {sprints.every(s => (s.tasks ?? []).length === 0) && (
                    <tr>
                      <td colSpan={3} style={{ padding: "32px", textAlign: "center" as const, color: "#94a3b8", fontSize: "13px" }}>
                        No tasks added yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ── Add Sprint Modal ── */}
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
                <label style={LBL}>Sprint Name *</label>
                <input
                  autoFocus
                  style={INP}
                  value={sprintForm.name}
                  onChange={e => setSprintForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Sprint 1 — Auth & Onboarding"
                  onKeyDown={e => e.key === "Enter" && handleAddSprint()}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label style={LBL}>Start Date</label>
                  <input type="date" style={INP} value={sprintForm.startDate} onChange={e => setSprintForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div>
                  <label style={LBL}>End Date</label>
                  <input type="date" style={INP} value={sprintForm.endDate} onChange={e => setSprintForm(f => ({ ...f, endDate: e.target.value }))} />
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

const LBL: React.CSSProperties = {
  display: "block", color: "#334155", fontSize: "11px", fontWeight: 600,
  letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px",
};
const INP: React.CSSProperties = {
  width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px",
  color: "#0f172a", padding: "9px 12px", fontSize: "13px", fontFamily: "'Inter', sans-serif",
  boxSizing: "border-box",
};
