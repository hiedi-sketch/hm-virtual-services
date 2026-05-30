import { useState } from "react";
import {
  Search, Plus, Eye, Edit2, Copy, CheckCircle2, ChevronUp, ChevronDown,
  Send, Download, AlertCircle, X, Trash2,
  FileText, TrendingUp, Clock,
} from "lucide-react";

const BRAND = "#266b75";
const BRAND_LIGHT = "#7dbdc6";
const BRAND_BG = "rgba(38,107,117,0.07)";
const BRAND_BG_MED = "rgba(38,107,117,0.13)";

const MOCK_INVOICES = [
  { id: "INV-2024-041", client: "Sarah Chen",     service: "May 2024 Bookkeeping",  amount: 850.00,  status: "paid",    due: "2024-05-31", issued: "2024-05-01" },
  { id: "INV-2024-042", client: "Lara Okonkwo",   service: "May 2024 VA Services",  amount: 1200.00, status: "sent",    due: "2024-06-05", issued: "2024-05-10" },
  { id: "INV-2024-043", client: "Marcus Webb",    service: "Q1 Bookkeeping",        amount: 2400.00, status: "overdue", due: "2024-04-15", issued: "2024-04-01" },
  { id: "INV-2024-044", client: "The Novak Group",service: "Apr–May 2024 VA",       amount: 3600.00, status: "draft",   due: "2024-06-15", issued: "2024-05-20" },
  { id: "INV-2024-045", client: "Sarah Chen",     service: "Apr 2024 Bookkeeping",  amount: 850.00,  status: "paid",    due: "2024-04-30", issued: "2024-04-01" },
  { id: "INV-2024-046", client: "Rivera Family",  service: "May 2024 VA Services",  amount: 750.00,  status: "sent",    due: "2024-06-10", issued: "2024-05-15" },
  { id: "INV-2024-047", client: "Bright Path LLC",service: "Bookkeeping Q1",        amount: 1950.00, status: "overdue", due: "2024-04-20", issued: "2024-04-01" },
  { id: "INV-2024-048", client: "Lara Okonkwo",   service: "Apr 2024 VA Services",  amount: 1200.00, status: "paid",    due: "2024-04-30", issued: "2024-04-05" },
];

const STATUS_CONFIG: Record<string, { label: string; bgClass: string; textClass: string; dotClass: string }> = {
  draft:   { label: "Draft",   bgClass: "bg-slate-100",  textClass: "text-slate-500",   dotClass: "bg-slate-400"   },
  sent:    { label: "Sent",    bgClass: "bg-blue-50",    textClass: "text-blue-600",    dotClass: "bg-blue-500"    },
  paid:    { label: "Paid",    bgClass: "bg-emerald-50", textClass: "text-emerald-600", dotClass: "bg-emerald-500" },
  overdue: { label: "Overdue", bgClass: "bg-red-50",     textClass: "text-red-600",     dotClass: "bg-red-500"     },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bgClass} ${cfg.textClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotClass}`} />
      {cfg.label}
    </span>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function InvoicePage() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [sortField, setSortField] = useState<string | null>("issued");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [lineItems, setLineItems] = useState([
    { desc: "Monthly Bookkeeping", qty: 1, rate: 850 },
  ]);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);

  const tabs = [
    { id: "all",     label: "All",     count: MOCK_INVOICES.length },
    { id: "draft",   label: "Draft",   count: MOCK_INVOICES.filter(i => i.status === "draft").length },
    { id: "sent",    label: "Sent",    count: MOCK_INVOICES.filter(i => i.status === "sent").length },
    { id: "paid",    label: "Paid",    count: MOCK_INVOICES.filter(i => i.status === "paid").length },
    { id: "overdue", label: "Overdue", count: MOCK_INVOICES.filter(i => i.status === "overdue").length },
  ];

  const filtered = MOCK_INVOICES
    .filter(i => activeTab === "all" || i.status === activeTab)
    .filter(i => !search || i.client.toLowerCase().includes(search.toLowerCase()) || i.id.includes(search));

  const totalPaid    = MOCK_INVOICES.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const outstanding  = MOCK_INVOICES.filter(i => i.status === "sent").reduce((s, i) => s + i.amount, 0);
  const overdue      = MOCK_INVOICES.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0);
  const mtd          = MOCK_INVOICES.reduce((s, i) => s + i.amount, 0);
  const lineTotal    = lineItems.reduce((s, l) => s + l.qty * l.rate, 0);

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 text-slate-300" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3" style={{ color: BRAND }} />
      : <ChevronDown className="w-3 h-3" style={{ color: BRAND }} />;
  }

  const inputFocusClass = "outline-none transition-all";

  return (
    <div className="min-h-screen bg-[#F8FAFB] flex flex-col" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Invoices</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            HM Virtual Services · {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>
        <button
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-2 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-sm transition-opacity hover:opacity-90"
          style={{ backgroundColor: BRAND }}
        >
          <Plus className="w-4 h-4" />
          New Invoice
        </button>
      </div>

      <div className="flex-1 px-8 py-7 space-y-6">

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-4 gap-4">
          {[
            {
              label: "Total Invoiced (MTD)", value: fmt(mtd),
              icon: TrendingUp,
              iconColor: BRAND, iconBg: BRAND_BG,
              delta: "+12% vs last month",
            },
            {
              label: "Outstanding", value: fmt(outstanding),
              icon: Clock,
              iconColor: "#2563eb", iconBg: "#eff6ff",
              delta: `${MOCK_INVOICES.filter(i => i.status === "sent").length} invoices`,
            },
            {
              label: "Overdue", value: fmt(overdue),
              icon: AlertCircle,
              iconColor: "#dc2626", iconBg: "#fef2f2",
              delta: `${MOCK_INVOICES.filter(i => i.status === "overdue").length} need attention`,
            },
            {
              label: "Paid", value: fmt(totalPaid),
              icon: CheckCircle2,
              iconColor: "#059669", iconBg: "#ecfdf5",
              delta: `${MOCK_INVOICES.filter(i => i.status === "paid").length} invoices collected`,
            },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)] px-5 py-4">
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: kpi.iconBg }}>
                  <kpi.icon className="w-4 h-4" style={{ color: kpi.iconColor }} />
                </div>
              </div>
              <p className="text-2xl font-semibold text-slate-900 tracking-tight tabular-nums">{kpi.value}</p>
              <p className="text-xs text-slate-400 mt-1">{kpi.delta}</p>
            </div>
          ))}
        </div>

        {/* ── Table Card ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">

          {/* Toolbar */}
          <div className="px-5 pt-4 pb-0 flex items-center justify-between gap-4 border-b border-slate-100">
            <div className="flex items-center">
              {tabs.map(tab => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors"
                    style={{
                      borderBottomColor: active ? BRAND : "transparent",
                      color: active ? BRAND : "#64748b",
                    }}
                  >
                    {tab.label}
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={active
                        ? { backgroundColor: BRAND_BG_MED, color: BRAND }
                        : { backgroundColor: "#f1f5f9", color: "#64748b" }
                      }
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50/60 min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search client or invoice #…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="text-xs text-slate-700 placeholder:text-slate-400 bg-transparent outline-none flex-1"
              />
            </div>
          </div>

          {/* Table */}
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/60">
                {[
                  { label: "Invoice #",       field: "id" },
                  { label: "Client",          field: "client" },
                  { label: "Service Period",  field: "service" },
                  { label: "Amount",          field: "amount" },
                  { label: "Status",          field: "status" },
                  { label: "Due Date",        field: "due" },
                  { label: "",                field: null },
                ].map((col, i) => (
                  <th
                    key={i}
                    onClick={() => col.field && toggleSort(col.field)}
                    className={`px-5 py-3 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider ${col.field ? "cursor-pointer hover:text-slate-700 select-none" : ""}`}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {col.field && <SortIcon field={col.field} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                        <FileText className="w-7 h-7 text-slate-300" />
                      </div>
                      <p className="text-sm font-medium text-slate-500">No invoices found</p>
                      <p className="text-xs text-slate-400">Try a different filter or create a new invoice.</p>
                    </div>
                  </td>
                </tr>
              ) : filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-mono font-semibold" style={{ color: BRAND }}>{inv.id}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: `linear-gradient(135deg, ${BRAND_LIGHT}, ${BRAND})` }}
                      >
                        <span className="text-white text-[10px] font-semibold">
                          {inv.client.split(" ").map(w => w[0]).join("").slice(0, 2)}
                        </span>
                      </div>
                      <span className="text-xs font-medium text-slate-800">{inv.client}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-xs text-slate-500">{inv.service}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">{fmt(inv.amount)}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <StatusPill status={inv.status} />
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs ${inv.status === "overdue" ? "text-red-500 font-medium" : "text-slate-500"}`}>
                      {fmtDate(inv.due)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {[
                        { icon: Eye,          key: `${inv.id}-eye`,  title: "Preview" },
                        { icon: Edit2,        key: `${inv.id}-edit`, title: "Edit" },
                        { icon: Copy,         key: `${inv.id}-copy`, title: "Duplicate" },
                        { icon: Send,         key: `${inv.id}-send`, title: "Send" },
                        ...(inv.status !== "paid" ? [{ icon: CheckCircle2, key: `${inv.id}-paid`, title: "Mark Paid" }] : []),
                      ].map(({ icon: Icon, key, title }) => (
                        <button
                          key={key}
                          title={title}
                          onMouseEnter={() => setHoveredAction(key)}
                          onMouseLeave={() => setHoveredAction(null)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                          style={hoveredAction === key
                            ? { backgroundColor: BRAND_BG, color: BRAND }
                            : { color: "#94a3b8" }
                          }
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Slide-over Panel ── */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/20 backdrop-blur-[2px]" onClick={() => setPanelOpen(false)} />
          <div className="w-[520px] bg-white shadow-2xl flex flex-col border-l border-slate-200 overflow-hidden">

            {/* Panel Header */}
            <div
              className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0"
              style={{ background: `linear-gradient(135deg, ${BRAND}, #1e5a63)` }}
            >
              <div>
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: BRAND_LIGHT }}>New Invoice</p>
                <p className="text-sm font-semibold text-white mt-0.5">INV-2024-049</p>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition-colors hover:bg-white/20"
                style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* Client & Period */}
              <div className="px-6 py-5 border-b border-slate-50 space-y-4">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Client</label>
                  <select
                    className={`mt-1.5 w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 ${inputFocusClass}`}
                    onFocus={e => { e.currentTarget.style.borderColor = BRAND_LIGHT; e.currentTarget.style.boxShadow = `0 0 0 3px ${BRAND_BG}`; }}
                    onBlur={e =>  { e.currentTarget.style.borderColor = "#e2e8f0";   e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <option>— Select client —</option>
                    <option>Sarah Chen</option>
                    <option>Lara Okonkwo</option>
                    <option>Marcus Webb</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {["Service Period Start", "Service Period End"].map(label => (
                    <div key={label}>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</label>
                      <input
                        type="date"
                        className={`mt-1.5 w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 ${inputFocusClass}`}
                        onFocus={e => { e.currentTarget.style.borderColor = BRAND_LIGHT; e.currentTarget.style.boxShadow = `0 0 0 3px ${BRAND_BG}`; }}
                        onBlur={e =>  { e.currentTarget.style.borderColor = "#e2e8f0";   e.currentTarget.style.boxShadow = "none"; }}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Due Date</label>
                  <input
                    type="date"
                    className={`mt-1.5 w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 ${inputFocusClass}`}
                    onFocus={e => { e.currentTarget.style.borderColor = BRAND_LIGHT; e.currentTarget.style.boxShadow = `0 0 0 3px ${BRAND_BG}`; }}
                    onBlur={e =>  { e.currentTarget.style.borderColor = "#e2e8f0";   e.currentTarget.style.boxShadow = "none"; }}
                  />
                </div>
              </div>

              {/* Line Items */}
              <div className="px-6 py-5 border-b border-slate-50">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Line Items</p>

                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_60px_80px_72px] gap-2">
                    {["Description", "Qty", "Rate", ""].map((h, i) => (
                      <p key={i} className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider px-1">{h}</p>
                    ))}
                  </div>

                  {lineItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_60px_80px_72px] gap-2 items-center">
                      <input
                        value={item.desc}
                        onChange={e => setLineItems(l => l.map((li, i) => i === idx ? { ...li, desc: e.target.value } : li))}
                        className={`text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white ${inputFocusClass} text-slate-700`}
                        onFocus={e => { e.currentTarget.style.borderColor = BRAND_LIGHT; }}
                        onBlur={e =>  { e.currentTarget.style.borderColor = "#e2e8f0"; }}
                        placeholder="Description"
                      />
                      <input
                        type="number"
                        value={item.qty}
                        onChange={e => setLineItems(l => l.map((li, i) => i === idx ? { ...li, qty: Number(e.target.value) } : li))}
                        className={`text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white ${inputFocusClass} text-slate-700 text-center tabular-nums`}
                        onFocus={e => { e.currentTarget.style.borderColor = BRAND_LIGHT; }}
                        onBlur={e =>  { e.currentTarget.style.borderColor = "#e2e8f0"; }}
                      />
                      <input
                        type="number"
                        value={item.rate}
                        onChange={e => setLineItems(l => l.map((li, i) => i === idx ? { ...li, rate: Number(e.target.value) } : li))}
                        className={`text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white ${inputFocusClass} text-slate-700 tabular-nums`}
                        onFocus={e => { e.currentTarget.style.borderColor = BRAND_LIGHT; }}
                        onBlur={e =>  { e.currentTarget.style.borderColor = "#e2e8f0"; }}
                      />
                      <div className="flex items-center justify-between pl-1">
                        <span className="text-xs text-slate-500 tabular-nums">{fmt(item.qty * item.rate)}</span>
                        {lineItems.length > 1 && (
                          <button
                            onClick={() => setLineItems(l => l.filter((_, i) => i !== idx))}
                            className="text-slate-300 hover:text-red-400 transition-colors ml-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => setLineItems(l => [...l, { desc: "", qty: 1, rate: 0 }])}
                    className="flex items-center gap-1.5 text-xs font-medium mt-2 transition-opacity hover:opacity-80"
                    style={{ color: BRAND }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add line item
                  </button>
                </div>

                <div className="mt-4 flex justify-end">
                  <div className="rounded-xl px-5 py-3 text-right" style={{ backgroundColor: BRAND_BG }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: BRAND }}>Total Due</p>
                    <p className="text-2xl font-bold tabular-nums mt-0.5" style={{ color: BRAND }}>{fmt(lineTotal)}</p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="px-6 py-5">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Notes (optional)</label>
                <textarea
                  rows={3}
                  className={`mt-1.5 w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 ${inputFocusClass} resize-none`}
                  onFocus={e => { e.currentTarget.style.borderColor = BRAND_LIGHT; e.currentTarget.style.boxShadow = `0 0 0 3px ${BRAND_BG}`; }}
                  onBlur={e =>  { e.currentTarget.style.borderColor = "#e2e8f0";   e.currentTarget.style.boxShadow = "none"; }}
                  placeholder="Thank you for your business…"
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center gap-3 shrink-0">
              <button className="flex-1 flex items-center justify-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl py-2.5 transition-colors">
                <Download className="w-4 h-4" />
                Save as Draft
              </button>
              <button
                className="flex-1 flex items-center justify-center gap-2 text-white text-sm font-medium rounded-xl py-2.5 shadow-sm transition-opacity hover:opacity-90"
                style={{ backgroundColor: BRAND }}
              >
                <Send className="w-4 h-4" />
                Send Invoice
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
