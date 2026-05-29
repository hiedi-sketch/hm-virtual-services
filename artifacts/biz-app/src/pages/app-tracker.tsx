import { useState } from "react";

const DEV_STAGES = ["Concept", "Planning", "In Development", "Testing", "Staging", "Live", "On Hold"];
const STAGE_COLORS: Record<string, string> = {
  "Concept": "#94a3b8",
  "Planning": "#fb923c",
  "In Development": "#facc15",
  "Testing": "#34d399",
  "Staging": "#60a5fa",
  "Live": "#4ade80",
  "On Hold": "#f87171",
};

const DEV_CHECKLIST_TEMPLATE = [
  { id: "dc1", label: "Define scope & requirements" },
  { id: "dc2", label: "Wireframes / mockups approved" },
  { id: "dc3", label: "Tech stack selected" },
  { id: "dc4", label: "Dev environment set up" },
  { id: "dc5", label: "Database schema designed" },
  { id: "dc6", label: "Core features built" },
  { id: "dc7", label: "API integrations complete" },
  { id: "dc8", label: "Unit tests written" },
  { id: "dc9", label: "QA / user testing done" },
  { id: "dc10", label: "Security review complete" },
  { id: "dc11", label: "Performance optimized" },
  { id: "dc12", label: "Documentation written" },
  { id: "dc13", label: "Staging deployment tested" },
  { id: "dc14", label: "Production deployment complete" },
  { id: "dc15", label: "Monitoring & alerts configured" },
];

const MAINTENANCE_CHECKLIST_TEMPLATE = [
  { id: "mc1", label: "Weekly: Review error logs", freq: "Weekly" },
  { id: "mc2", label: "Weekly: Check uptime / performance metrics", freq: "Weekly" },
  { id: "mc3", label: "Monthly: Update dependencies", freq: "Monthly" },
  { id: "mc4", label: "Monthly: Review and rotate API keys", freq: "Monthly" },
  { id: "mc5", label: "Monthly: Database backup verified", freq: "Monthly" },
  { id: "mc6", label: "Monthly: Review user feedback / support tickets", freq: "Monthly" },
  { id: "mc7", label: "Quarterly: Security audit", freq: "Quarterly" },
  { id: "mc8", label: "Quarterly: Performance benchmark review", freq: "Quarterly" },
  { id: "mc9", label: "Quarterly: Accessibility audit", freq: "Quarterly" },
  { id: "mc10", label: "Quarterly: Disaster recovery test", freq: "Quarterly" },
];

const INITIAL_APPS = [
  { id: 1, name: "Client Dashboard", stage: "In Development", description: "HM Virtual Services client management dashboard", startDate: "2026-03-15", targetDate: "2026-07-01", devChecklist: {}, maintenanceChecklist: {} },
];

const CHANGE_STATUSES = ["Requested", "Approved", "In Progress", "Complete", "Deferred"];
const CHANGE_STATUS_COLORS: Record<string, string> = {
  "Requested": "#94a3b8",
  "Approved": "#60a5fa",
  "In Progress": "#facc15",
  "Complete": "#4ade80",
  "Deferred": "#f87171",
};
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const PRIORITY_COLORS: Record<string, string> = { Low: "#94a3b8", Medium: "#60a5fa", High: "#fb923c", Critical: "#f87171" };

const Icon = ({ name, size = 16 }: { name: string; size?: number }) => {
  const icons: Record<string, JSX.Element> = {
    apps: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
    changes: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="m18.5 2.5 2 2L11 14l-4 1 1-4z"/></svg>,
    checklist: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
    plus: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>,
    trash: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="m19 6-.867 12.142A2 2 0 0 1 16.138 20H7.862a2 2 0 0 1-1.995-1.858L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
    x: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>,
    check: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>,
  };
  return icons[name] || null;
};

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "16px", width: "100%", maxWidth: "560px", maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.12)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 24px 16px", borderBottom: "1px solid #f1f5f9" }}>
        <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>{title}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "4px" }}><Icon name="x" /></button>
      </div>
      <div style={{ padding: "24px" }}>{children}</div>
    </div>
  </div>
);

const inputStyle: React.CSSProperties = {
  width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px",
  color: "#0f172a", padding: "10px 12px", fontSize: "14px", fontFamily: "'Inter', sans-serif", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", color: "#64748b", fontSize: "12px", fontWeight: 600, letterSpacing: "0.08em",
  textTransform: "uppercase", marginBottom: "6px",
};
const btnPrimary: React.CSSProperties = {
  background: "linear-gradient(135deg, #6366f1, #818cf8)", border: "none", borderRadius: "8px",
  color: "#fff", padding: "10px 20px", fontSize: "14px", fontWeight: 600, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: "6px",
};
const btnSecondary: React.CSSProperties = {
  background: "transparent", border: "1px solid #e2e8f0", borderRadius: "8px",
  color: "#64748b", padding: "10px 20px", fontSize: "14px", cursor: "pointer",
};

// ── App Tracker tab ──────────────────────────────────────────────────────────
type AppEntry = { id: number; name: string; stage: string; description: string; startDate: string; targetDate: string; devChecklist: Record<string, boolean>; maintenanceChecklist: Record<string, boolean> };

const AppTrackerTab = ({ apps, setApps }: { apps: AppEntry[]; setApps: React.Dispatch<React.SetStateAction<AppEntry[]>> }) => {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", stage: "Concept", startDate: "", targetDate: "" });

  const addApp = () => {
    if (!form.name.trim()) return;
    setApps(prev => [...prev, { ...form, id: Date.now(), devChecklist: {}, maintenanceChecklist: {} }]);
    setForm({ name: "", description: "", stage: "Concept", startDate: "", targetDate: "" });
    setShowModal(false);
  };

  const updateStage = (id: number, stage: string) => setApps(prev => prev.map(a => a.id === id ? { ...a, stage } : a));
  const deleteApp = (id: number) => setApps(prev => prev.filter(a => a.id !== id));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "22px", fontWeight: 700, color: "#0f172a", margin: 0 }}>App Pipeline</h2>
          <p style={{ color: "#94a3b8", fontSize: "14px", margin: "4px 0 0" }}>{apps.length} app{apps.length !== 1 ? "s" : ""} tracked</p>
        </div>
        <button style={btnPrimary} onClick={() => setShowModal(true)}><Icon name="plus" size={14} /> Add App</button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "24px" }}>
        {DEV_STAGES.map(s => (
          <span key={s} style={{ background: STAGE_COLORS[s] + "18", border: `1px solid ${STAGE_COLORS[s]}44`, borderRadius: "20px", padding: "4px 12px", fontSize: "12px", color: STAGE_COLORS[s], fontWeight: 600 }}>{s}</span>
        ))}
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        {apps.length === 0 && <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>No apps yet — add your first one!</div>}
        {apps.map(app => (
          <div key={app.id} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px", display: "grid", gridTemplateColumns: "1fr auto", gap: "16px", alignItems: "start", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <span style={{ background: STAGE_COLORS[app.stage] + "18", border: `1px solid ${STAGE_COLORS[app.stage]}66`, borderRadius: "20px", padding: "3px 12px", fontSize: "11px", color: STAGE_COLORS[app.stage], fontWeight: 700, letterSpacing: "0.06em" }}>{app.stage}</span>
                <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "17px", fontWeight: 700, color: "#0f172a" }}>{app.name}</span>
              </div>
              {app.description && <p style={{ color: "#64748b", fontSize: "14px", margin: "0 0 12px" }}>{app.description}</p>}
              <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                {app.startDate && <span style={{ fontSize: "12px", color: "#94a3b8" }}>Started: <span style={{ color: "#475569" }}>{app.startDate}</span></span>}
                {app.targetDate && <span style={{ fontSize: "12px", color: "#94a3b8" }}>Target: <span style={{ color: "#475569" }}>{app.targetDate}</span></span>}
              </div>
              <div style={{ marginTop: "12px" }}>
                <label style={{ ...labelStyle, marginBottom: "4px" }}>Move to Stage</label>
                <select value={app.stage} onChange={e => updateStage(app.id, e.target.value)} style={{ ...inputStyle, width: "auto", minWidth: "200px" }}>
                  {DEV_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <button onClick={() => deleteApp(app.id)} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#94a3b8", cursor: "pointer", padding: "8px", lineHeight: 0 }}><Icon name="trash" /></button>
          </div>
        ))}
      </div>

      {showModal && (
        <Modal title="Add New App" onClose={() => setShowModal(false)}>
          <div style={{ display: "grid", gap: "16px" }}>
            <div><label style={labelStyle}>App Name *</label><input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Client Portal" /></div>
            <div><label style={labelStyle}>Description</label><textarea style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description..." /></div>
            <div><label style={labelStyle}>Current Stage</label>
              <select style={inputStyle} value={form.stage} onChange={e => setForm(f => ({ ...f, stage: e.target.value }))}>
                {DEV_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div><label style={labelStyle}>Start Date</label><input type="date" style={inputStyle} value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
              <div><label style={labelStyle}>Target Date</label><input type="date" style={inputStyle} value={form.targetDate} onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))} /></div>
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button style={btnSecondary} onClick={() => setShowModal(false)}>Cancel</button>
              <button style={btnPrimary} onClick={addApp}><Icon name="plus" size={14} /> Add App</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Change Tracker tab ───────────────────────────────────────────────────────
type ChangeEntry = { id: number; appId: number; title: string; description: string; priority: string; status: string; requestDate: string; targetDate: string };

const ChangeTracker = ({ apps, changes, setChanges }: { apps: AppEntry[]; changes: ChangeEntry[]; setChanges: React.Dispatch<React.SetStateAction<ChangeEntry[]>> }) => {
  const [showModal, setShowModal] = useState(false);
  const [filterApp, setFilterApp] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [form, setForm] = useState({ appId: String(apps[0]?.id || ""), title: "", description: "", priority: "Medium", status: "Requested", requestDate: "", targetDate: "" });

  const addChange = () => {
    if (!form.title.trim() || !form.appId) return;
    setChanges(prev => [...prev, { ...form, id: Date.now(), appId: Number(form.appId) }]);
    setForm(f => ({ ...f, title: "", description: "", priority: "Medium", status: "Requested", requestDate: "", targetDate: "" }));
    setShowModal(false);
  };

  const updateStatus = (id: number, status: string) => setChanges(prev => prev.map(c => c.id === id ? { ...c, status } : c));
  const deleteChange = (id: number) => setChanges(prev => prev.filter(c => c.id !== id));

  const filtered = changes.filter(c =>
    (filterApp === "all" || c.appId === Number(filterApp)) &&
    (filterStatus === "all" || c.status === filterStatus)
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "22px", fontWeight: 700, color: "#0f172a", margin: 0 }}>Build Changes</h2>
          <p style={{ color: "#94a3b8", fontSize: "14px", margin: "4px 0 0" }}>{changes.length} change request{changes.length !== 1 ? "s" : ""}</p>
        </div>
        <button style={btnPrimary} onClick={() => setShowModal(true)}><Icon name="plus" size={14} /> Log Change</button>
      </div>

      <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <select style={{ ...inputStyle, width: "auto" }} value={filterApp} onChange={e => setFilterApp(e.target.value)}>
          <option value="all">All Apps</option>
          {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select style={{ ...inputStyle, width: "auto" }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          {CHANGE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
        {CHANGE_STATUSES.map(s => {
          const count = changes.filter(c => c.status === s).length;
          return <span key={s} style={{ background: CHANGE_STATUS_COLORS[s] + "18", border: `1px solid ${CHANGE_STATUS_COLORS[s]}44`, borderRadius: "20px", padding: "4px 12px", fontSize: "12px", color: CHANGE_STATUS_COLORS[s], fontWeight: 600 }}>{s}: {count}</span>;
        })}
      </div>

      <div style={{ display: "grid", gap: "12px" }}>
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>No changes match the current filters.</div>}
        {filtered.map(c => {
          const appName = apps.find(a => a.id === c.appId)?.name || "Unknown";
          return (
            <div key={c.id} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "18px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                    <span style={{ fontSize: "12px", color: "#6366f1", background: "#6366f118", borderRadius: "6px", padding: "2px 8px" }}>{appName}</span>
                    <span style={{ background: PRIORITY_COLORS[c.priority] + "18", border: `1px solid ${PRIORITY_COLORS[c.priority]}44`, borderRadius: "6px", padding: "2px 8px", fontSize: "11px", color: PRIORITY_COLORS[c.priority], fontWeight: 700 }}>{c.priority}</span>
                    <span style={{ fontWeight: 600, color: "#0f172a", fontSize: "15px" }}>{c.title}</span>
                  </div>
                  {c.description && <p style={{ color: "#64748b", fontSize: "13px", margin: "0 0 10px" }}>{c.description}</p>}
                  <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
                    {c.requestDate && <span style={{ fontSize: "12px", color: "#94a3b8" }}>Requested: <span style={{ color: "#475569" }}>{c.requestDate}</span></span>}
                    {c.targetDate && <span style={{ fontSize: "12px", color: "#94a3b8" }}>Target: <span style={{ color: "#475569" }}>{c.targetDate}</span></span>}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#94a3b8" }}>Status:</span>
                      <select value={c.status} onChange={e => updateStatus(c.id, e.target.value)}
                        style={{ background: CHANGE_STATUS_COLORS[c.status] + "18", border: `1px solid ${CHANGE_STATUS_COLORS[c.status]}44`, borderRadius: "6px", color: CHANGE_STATUS_COLORS[c.status], padding: "3px 8px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                        {CHANGE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <button onClick={() => deleteChange(c.id)} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: "8px", color: "#94a3b8", cursor: "pointer", padding: "6px", lineHeight: 0, flexShrink: 0 }}><Icon name="trash" size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <Modal title="Log Change Request" onClose={() => setShowModal(false)}>
          <div style={{ display: "grid", gap: "16px" }}>
            <div><label style={labelStyle}>App *</label>
              <select style={inputStyle} value={form.appId} onChange={e => setForm(f => ({ ...f, appId: e.target.value }))}>
                {apps.length === 0 && <option value="">No apps — add one first</option>}
                {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div><label style={labelStyle}>Change Title *</label><input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Add export to CSV" /></div>
            <div><label style={labelStyle}>Description</label><textarea style={{ ...inputStyle, minHeight: "80px", resize: "vertical" }} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Details, context, or acceptance criteria..." /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div><label style={labelStyle}>Priority</label>
                <select style={inputStyle} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div><label style={labelStyle}>Status</label>
                <select style={inputStyle} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {CHANGE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div><label style={labelStyle}>Date Requested</label><input type="date" style={inputStyle} value={form.requestDate} onChange={e => setForm(f => ({ ...f, requestDate: e.target.value }))} /></div>
              <div><label style={labelStyle}>Target Date</label><input type="date" style={inputStyle} value={form.targetDate} onChange={e => setForm(f => ({ ...f, targetDate: e.target.value }))} /></div>
            </div>
            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
              <button style={btnSecondary} onClick={() => setShowModal(false)}>Cancel</button>
              <button style={btnPrimary} onClick={addChange}><Icon name="plus" size={14} /> Log Change</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// ── Checklists tab ───────────────────────────────────────────────────────────
type ChecklistItemType = { id: string; label: string; freq?: string; custom?: boolean };

const ChecklistItemRow = ({ item, checked, onToggle, isCustom, onDelete }: { item: ChecklistItemType; checked: boolean; onToggle: (id: string) => void; isCustom: boolean; onDelete: (id: string) => void }) => (
  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
    <button onClick={() => onToggle(item.id)} style={{ width: "20px", height: "20px", borderRadius: "5px", border: `2px solid ${checked ? "#6366f1" : "#e2e8f0"}`, background: checked ? "#6366f1" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, lineHeight: 0 }}>
      {checked && <Icon name="check" size={12} />}
    </button>
    <span style={{ flex: 1, color: checked ? "#94a3b8" : "#334155", fontSize: "14px", textDecoration: checked ? "line-through" : "none" }}>{item.label}</span>
    {item.freq && <span style={{ fontSize: "11px", color: "#94a3b8", background: "#f1f5f9", borderRadius: "4px", padding: "2px 6px" }}>{item.freq}</span>}
    {isCustom && <button onClick={() => onDelete(item.id)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "2px", lineHeight: 0 }}><Icon name="trash" size={13} /></button>}
  </div>
);

const ChecklistSection = ({ title, items, checkedMap, onToggle, onAddItem, onDeleteItem }: { title: string; items: ChecklistItemType[]; checkedMap: Record<string, boolean>; onToggle: (id: string) => void; onAddItem: (item: ChecklistItemType) => void; onDeleteItem: (id: string) => void }) => {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const done = items.filter(i => checkedMap[i.id]).length;

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    onAddItem({ id: "custom_" + Date.now(), label: newLabel.trim(), custom: true });
    setNewLabel("");
    setAdding(false);
  };

  return (
    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "20px", marginBottom: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
        <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "16px", fontWeight: 700, color: "#0f172a" }}>{title}</span>
        <span style={{ fontSize: "13px", color: "#6366f1", fontWeight: 600 }}>{done}/{items.length}</span>
      </div>
      <div style={{ height: "4px", background: "#f1f5f9", borderRadius: "2px", marginBottom: "12px" }}>
        <div style={{ height: "100%", width: `${items.length ? (done / items.length) * 100 : 0}%`, background: "linear-gradient(90deg, #6366f1, #818cf8)", borderRadius: "2px", transition: "width 0.3s" }} />
      </div>
      {items.map(item => (
        <ChecklistItemRow key={item.id} item={item} checked={!!checkedMap[item.id]} onToggle={onToggle} isCustom={!!item.custom} onDelete={onDeleteItem} />
      ))}
      {adding ? (
        <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
          <input autoFocus style={{ ...inputStyle, flex: 1 }} value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="New item..." />
          <button style={btnPrimary} onClick={handleAdd}>Add</button>
          <button style={btnSecondary} onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ marginTop: "10px", background: "none", border: "1px dashed #e2e8f0", borderRadius: "8px", color: "#94a3b8", padding: "8px 14px", cursor: "pointer", fontSize: "13px", width: "100%", display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
          <Icon name="plus" size={13} /> Add item
        </button>
      )}
    </div>
  );
};

type ChecklistsState = Record<number, Record<string, Record<string, boolean> | ChecklistItemType[]>>;

const Checklists = ({ apps, checklists, setChecklists }: { apps: AppEntry[]; checklists: ChecklistsState; setChecklists: React.Dispatch<React.SetStateAction<ChecklistsState>> }) => {
  const [selectedApp, setSelectedApp] = useState<number | null>(apps[0]?.id || null);

  const getChecklist = (appId: number, type: string) => (checklists[appId]?.[type] as Record<string, boolean>) || {};
  const getCustomItems = (appId: number, type: string) => (checklists[appId]?.[`${type}_custom`] as ChecklistItemType[]) || [];

  const toggleItem = (appId: number, type: string, itemId: string) => {
    setChecklists(prev => ({
      ...prev,
      [appId]: { ...prev[appId], [type]: { ...(prev[appId]?.[type] as Record<string, boolean> || {}), [itemId]: !(prev[appId]?.[type] as Record<string, boolean>)?.[itemId] } }
    }));
  };

  const addCustomItem = (appId: number, type: string, item: ChecklistItemType) => {
    setChecklists(prev => ({
      ...prev,
      [appId]: { ...prev[appId], [`${type}_custom`]: [...(prev[appId]?.[`${type}_custom`] as ChecklistItemType[] || []), item] }
    }));
  };

  const deleteCustomItem = (appId: number, type: string, itemId: string) => {
    setChecklists(prev => ({
      ...prev,
      [appId]: { ...prev[appId], [`${type}_custom`]: (prev[appId]?.[`${type}_custom`] as ChecklistItemType[] || []).filter(i => i.id !== itemId) }
    }));
  };

  const app = apps.find(a => a.id === selectedApp);

  return (
    <div>
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "22px", fontWeight: 700, color: "#0f172a", margin: "0 0 16px" }}>Checklists</h2>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {apps.map(a => (
            <button key={a.id} onClick={() => setSelectedApp(a.id)}
              style={{ padding: "8px 16px", borderRadius: "8px", border: `1px solid ${selectedApp === a.id ? "#6366f1" : "#e2e8f0"}`, background: selectedApp === a.id ? "#6366f118" : "transparent", color: selectedApp === a.id ? "#6366f1" : "#64748b", cursor: "pointer", fontSize: "14px", fontWeight: 600 }}>
              {a.name}
            </button>
          ))}
        </div>
      </div>

      {!app ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>Add an app first to manage its checklists.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" }}>
          <div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "16px", fontWeight: 700, color: "#6366f1", marginBottom: "16px" }}>🏗️ Development</div>
            <ChecklistSection
              title="Build Checklist"
              items={[...DEV_CHECKLIST_TEMPLATE, ...getCustomItems(app.id, "dev")]}
              checkedMap={getChecklist(app.id, "dev")}
              onToggle={id => toggleItem(app.id, "dev", id)}
              onAddItem={item => addCustomItem(app.id, "dev", item)}
              onDeleteItem={id => deleteCustomItem(app.id, "dev", id)}
            />
          </div>
          <div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "16px", fontWeight: 700, color: "#10b981", marginBottom: "16px" }}>🔧 Maintenance</div>
            <ChecklistSection
              title="Regular Maintenance"
              items={[...MAINTENANCE_CHECKLIST_TEMPLATE, ...getCustomItems(app.id, "maintenance")]}
              checkedMap={getChecklist(app.id, "maintenance")}
              onToggle={id => toggleItem(app.id, "maintenance", id)}
              onAddItem={item => addCustomItem(app.id, "maintenance", item)}
              onDeleteItem={id => deleteCustomItem(app.id, "maintenance", id)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ── Root page ────────────────────────────────────────────────────────────────
export default function AppDevTracker() {
  const [tab, setTab] = useState("apps");
  const [apps, setApps] = useState<AppEntry[]>(INITIAL_APPS);
  const [changes, setChanges] = useState<ChangeEntry[]>([]);
  const [checklists, setChecklists] = useState<ChecklistsState>({});

  const tabs = [
    { id: "apps", label: "App Pipeline", icon: "apps" },
    { id: "changes", label: "Build Changes", icon: "changes" },
    { id: "checklists", label: "Checklists", icon: "checklist" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', sans-serif", color: "#0f172a" }}>
      {/* Page header */}
      <div style={{ borderBottom: "1px solid #e2e8f0", padding: "20px 32px", background: "#ffffff" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: "22px", fontWeight: 700, color: "#0f172a", letterSpacing: "-0.3px" }}>App Development Tracker</div>
            <div style={{ fontSize: "13px", color: "#94a3b8", marginTop: "2px" }}>HM Virtual Services</div>
          </div>
          {/* Tab switcher */}
          <div style={{ display: "flex", gap: "4px", background: "#f1f5f9", borderRadius: "10px", padding: "4px" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                padding: "8px 18px", borderRadius: "7px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: 600,
                display: "flex", alignItems: "center", gap: "6px",
                background: tab === t.id ? "#ffffff" : "transparent",
                color: tab === t.id ? "#0f172a" : "#64748b",
                boxShadow: tab === t.id ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s",
              }}>
                <Icon name={t.icon} size={14} /> {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ borderBottom: "1px solid #e2e8f0", padding: "12px 32px", background: "#ffffff" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "flex", gap: "32px", flexWrap: "wrap" }}>
          {[
            { label: "Total Apps", value: apps.length, color: "#6366f1" },
            { label: "Live", value: apps.filter(a => a.stage === "Live").length, color: "#22c55e" },
            { label: "In Development", value: apps.filter(a => a.stage === "In Development").length, color: "#f59e0b" },
            { label: "Open Changes", value: changes.filter(c => c.status !== "Complete" && c.status !== "Deferred").length, color: "#fb923c" },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "22px", fontWeight: 700, color: s.color, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{s.value}</span>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px" }}>
        {tab === "apps" && <AppTrackerTab apps={apps} setApps={setApps} />}
        {tab === "changes" && <ChangeTracker apps={apps} changes={changes} setChanges={setChanges} />}
        {tab === "checklists" && <Checklists apps={apps} checklists={checklists} setChecklists={setChecklists} />}
      </div>
    </div>
  );
}
