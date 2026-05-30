import { useState } from "react";
import {
  Search, Plus, Eye, Edit2, Copy, CheckCircle2, ChevronUp, ChevronDown,
  Send, Download, MoreHorizontal, AlertCircle, X, Minus, Trash2,
  FileText, Calendar, DollarSign, TrendingUp, Clock,
} from "lucide-react";

const MOCK_INVOICES = [
  { id: "INV-2024-041", client: "Sarah Chen", service: "May 2024 Bookkeeping", amount: 850.00, status: "paid", due: "2024-05-31", issued: "2024-05-01" },
  { id: "INV-2024-042", client: "Lara Okonkwo", service: "May 2024 VA Services", amount: 1200.00, status: "sent", due: "2024-06-05", issued: "2024-05-10" },
  { id: "INV-2024-043", client: "Marcus Webb", service: "Q1 Bookkeeping", amount: 2400.00, status: "overdue", due: "2024-04-15", issued: "2024-04-01" },
  { id: "INV-2024-044", client: "The Novak Group", service: "Apr–May 2024 VA", amount: 3600.00, status: "draft", due: "2024-06-15", issued: "2024-05-20" },
  { id: "INV-2024-045", client: "Sarah Chen", service: "Apr 2024 Bookkeeping", amount: 850.00, status: "paid", due: "2024-04-30", issued: "2024-04-01" },
  { id: "INV-2024-046", client: "Rivera Family", service: "May 2024 VA Services", amount: 750.00, status: "sent", due: "2024-06-10", issued: "2024-05-15" },
  { id: "INV-2024-047", client: "Bright Path LLC", service: "Bookkeeping Q1", amount: 1950.00, status: "overdue", due: "2024-04-20", issued: "2024-04-01" },
  { id: "INV-2024-048", client: "Lara Okonkwo", service: "Apr 2024 VA Services", amount: 1200.00, status: "paid", due: "2024-04-30", issued: "2024-04-05" },
];

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  draft:   { label: "Draft",   bg: "bg-slate-100",   text: "text-slate-500",  dot: "bg-slate-400" },
  sent:    { label: "Sent",    bg: "bg-blue-50",     text: "text-blue-600",   dot: "bg-blue-500"  },
  paid:    { label: "Paid",    bg: "bg-emerald-50",  text: "text-emerald-600",dot: "bg-emerald-500"},
  overdue: { label: "Overdue", bg: "bg-red-50",      text: "text-red-600",    dot: "bg-red-500"   },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
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

  const totalPaid = MOCK_INVOICES.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const outstanding = MOCK_INVOICES.filter(i => i.status === "sent").reduce((s, i) => s + i.amount, 0);
  const overdue = MOCK_INVOICES.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0);
  const mtd = MOCK_INVOICES.reduce((s, i) => s + i.amount, 0);

  const lineTotal = lineItems.reduce((s, l) => s + l.qty * l.rate, 0);

  function toggleSort(field: string) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 text-slate-300" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-teal-600" />
      : <ChevronDown className="w-3 h-3 text-teal-600" />;
  }

  return (
    <div className="min-h-screen bg-[#F8FAFB] font-sans flex flex-col" style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Invoices</h1>
          <p className="text-xs text-slate-400 mt-0.5">HM Virtual Services · {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
        </div>
        <button
          onClick={() => setPanelOpen(true)}
          className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Invoice
        </button>
      </div>

      <div className="flex-1 px-8 py-7 space-y-6">

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total Invoiced (MTD)", value: fmt(mtd), icon: TrendingUp, color: "text-teal-600", bg: "bg-teal-50", delta: "+12% vs last month" },
            { label: "Outstanding", value: fmt(outstanding), icon: Clock, color: "text-blue-600", bg: "bg-blue-50", delta: `${MOCK_INVOICES.filter(i => i.status === "sent").length} invoices` },
            { label: "Overdue", value: fmt(overdue), icon: AlertCircle, color: "text-red-500", bg: "bg-red-50", delta: `${MOCK_INVOICES.filter(i => i.status === "overdue").length} need attention` },
            { label: "Paid", value: fmt(totalPaid), icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", delta: `${MOCK_INVOICES.filter(i => i.status === "paid").length} invoices collected` },
          ].map((kpi, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)] px-5 py-4">
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
                <div className={`w-8 h-8 rounded-xl ${kpi.bg} flex items-center justify-center`}>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
              </div>
              <p className="text-2xl font-semibold text-slate-900 tracking-tight" style={{ fontFamily: "'DM Mono', monospace" }}>{kpi.value}</p>
              <p className="text-xs text-slate-400 mt-1">{kpi.delta}</p>
            </div>
          ))}
        </div>

        {/* ── Table Card ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">

          {/* Toolbar */}
          <div className="px-5 pt-4 pb-0 flex items-center justify-between gap-4 border-b border-slate-50">
            {/* Tabs */}
            <div className="flex items-center gap-0">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-teal-600 text-teal-700"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.label}
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-500"
                  }`}>{tab.count}</span>
                </button>
              ))}
            </div>

            {/* Search */}
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
                  { label: "Invoice #", field: "id" },
                  { label: "Client", field: "client" },
                  { label: "Service Period", field: "service" },
                  { label: "Amount", field: "amount" },
                  { label: "Status", field: "status" },
                  { label: "Due Date", field: "due" },
                  { label: "", field: null },
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
                    <span className="text-xs font-mono font-medium text-teal-700">{inv.id}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shrink-0">
                        <span className="text-white text-[10px] font-semibold">{inv.client.split(" ").map(w => w[0]).join("").slice(0,2)}</span>
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
                        { icon: Eye, title: "Preview" },
                        { icon: Edit2, title: "Edit" },
                        { icon: Copy, title: "Duplicate" },
                        { icon: Send, title: "Send" },
                      ].map(({ icon: Icon, title }) => (
                        <button key={title} title={title} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                          <Icon className="w-3.5 h-3.5" />
                        </button>
                      ))}
                      {inv.status !== "paid" && (
                        <button title="Mark Paid" className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                      )}
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
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-teal-600 to-teal-700 shrink-0">
              <div>
                <p className="text-xs font-medium text-teal-200 uppercase tracking-wider">New Invoice</p>
                <p className="text-sm font-semibold text-white mt-0.5">INV-2024-049</p>
              </div>
              <button onClick={() => setPanelOpen(false)} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">

              {/* Client & Period */}
              <div className="px-6 py-5 border-b border-slate-50 space-y-4">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Client</label>
                  <select className="mt-1.5 w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all">
                    <option>— Select client —</option>
                    <option>Sarah Chen</option>
                    <option>Lara Okonkwo</option>
                    <option>Marcus Webb</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Service Period Start</label>
                    <input type="date" className="mt-1.5 w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Service Period End</label>
                    <input type="date" className="mt-1.5 w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Due Date</label>
                  <input type="date" className="mt-1.5 w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all" />
                </div>
              </div>

              {/* Line Items */}
              <div className="px-6 py-5 border-b border-slate-50">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Line Items</p>
                </div>

                <div className="space-y-2">
                  {/* Header row */}
                  <div className="grid grid-cols-[1fr_60px_80px_60px] gap-2 px-0">
                    {["Description", "Qty", "Rate", ""].map((h, i) => (
                      <p key={i} className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider px-1">{h}</p>
                    ))}
                  </div>

                  {lineItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_60px_80px_60px] gap-2 items-center">
                      <input
                        value={item.desc}
                        onChange={e => setLineItems(l => l.map((li, i) => i === idx ? { ...li, desc: e.target.value } : li))}
                        className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:border-teal-400 transition-colors text-slate-700"
                        placeholder="Description"
                      />
                      <input
                        type="number"
                        value={item.qty}
                        onChange={e => setLineItems(l => l.map((li, i) => i === idx ? { ...li, qty: Number(e.target.value) } : li))}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white outline-none focus:border-teal-400 transition-colors text-slate-700 text-center tabular-nums"
                      />
                      <input
                        type="number"
                        value={item.rate}
                        onChange={e => setLineItems(l => l.map((li, i) => i === idx ? { ...li, rate: Number(e.target.value) } : li))}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-2 bg-white outline-none focus:border-teal-400 transition-colors text-slate-700 tabular-nums"
                      />
                      <div className="flex items-center justify-between pl-1">
                        <span className="text-xs text-slate-500 tabular-nums">{fmt(item.qty * item.rate)}</span>
                        {lineItems.length > 1 && (
                          <button onClick={() => setLineItems(l => l.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-400 transition-colors ml-1">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => setLineItems(l => [...l, { desc: "", qty: 1, rate: 0 }])}
                    className="flex items-center gap-1.5 text-xs text-teal-600 hover:text-teal-700 font-medium mt-2 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add line item
                  </button>
                </div>

                {/* Total */}
                <div className="mt-4 flex justify-end">
                  <div className="bg-teal-50 rounded-xl px-5 py-3 text-right">
                    <p className="text-[10px] text-teal-600 font-semibold uppercase tracking-wider">Total Due</p>
                    <p className="text-2xl font-bold text-teal-800 tabular-nums mt-0.5">{fmt(lineTotal)}</p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="px-6 py-5">
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Notes (optional)</label>
                <textarea
                  rows={3}
                  className="mt-1.5 w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 bg-white text-slate-700 outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition-all resize-none"
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
              <button className="flex-1 flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-xl py-2.5 shadow-sm transition-colors">
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
